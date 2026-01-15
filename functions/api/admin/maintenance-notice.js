// File: chat-ui/functions/api/admin/maintenance-notice.js
// This is the ONLY backend file you need for Cloudflare Pages Functions

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // GET - Public endpoint (no auth required)
  if (request.method === 'GET') {
    return handleGet(env, corsHeaders);
  }

  // POST - Admin only
  if (request.method === 'POST') {
    return handlePost(request, env, corsHeaders);
  }

  return new Response('Method not allowed', { 
    status: 405,
    headers: corsHeaders 
  });
}

// GET: Retrieve current maintenance notice
async function handleGet(env, corsHeaders) {
  try {
    // Get from KV
    const noticeData = await env.MAINTENANCE_KV.get('current_notice', 'json');
    
    // Return default if no notice exists
    if (!noticeData) {
      return new Response(JSON.stringify({
        success: true,
        notice: {
          enabled: false,
          type: 'info',
          icon: '🔧',
          title: 'Notice',
          message: '',
          updated_at: new Date().toISOString()
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      notice: noticeData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to fetch notice: ' + err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// POST: Update maintenance notice (Admin only)
async function handlePost(request, env, corsHeaders) {
  try {
    // Check admin token
    const adminToken = request.headers.get('x-admin-token');
    console.log('Received token from header:', adminToken || '[missing]');
    console.log('Expected env.ADMIN_TOKEN value:', env.ADMIN_TOKEN ? '[set]' : '[undefined or empty]');
    console.log('Token match result:', adminToken === env.ADMIN_TOKEN ? 'MATCH' : 'NO MATCH');
    if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Unauthorized'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await request.json();
    const { enabled, type, icon, title, message } = body;

    // Validate
    if (typeof enabled !== 'boolean') {
      return new Response(JSON.stringify({
        success: false,
        error: 'enabled must be boolean'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!['info', 'warning', 'error', 'success'].includes(type)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid notice type'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!title || !message) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Title and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create notice object
    const noticeData = {
      enabled,
      type,
      icon: icon || '🔧',
      title,
      message,
      updated_at: new Date().toISOString()
    };

    // Save to KV
    await env.MAINTENANCE_KV.put('current_notice', JSON.stringify(noticeData));

    return new Response(JSON.stringify({
      success: true,
      message: 'Maintenance notice updated successfully',
      notice: noticeData
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to update notice: ' + err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
