// functions/api/admin/orders.js
// Admin endpoints for orders and product updates (protected by ADMIN_TOKEN)

export async function onRequestGet(context) {
  return handleRequest(context, 'GET');
}

export async function onRequestPost(context) {
  return handleRequest(context, 'POST');
}

export async function onRequestPut(context) {
  return handleRequest(context, 'PUT');
}

export async function onRequestOptions(context) {
  return handleRequest(context, 'OPTIONS');
}

async function handleRequest(context, method) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ✅ Token check
  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);

    // === GET: load orders with pagination & phone filter ===
    if (method === 'GET') {
      const phone = url.searchParams.get('phone');
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      let query;
      if (phone) {
        query = env.DB.prepare(
          'SELECT * FROM ceo_orders WHERE phone = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(phone, limit, offset);
      } else {
        query = env.DB.prepare(
          'SELECT * FROM ceo_orders ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset);
      }

      const { results } = await query.all();
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // === PUT: update order status/fields ===
    if (method === 'PUT') {
      const urlParts = new URL(request.url).pathname.split('/').filter(Boolean);
      const maybeId = urlParts.length >= 3 ? urlParts[2] : null; // /api/admin/orders/{id}
      const body = await request.json().catch(() => ({}));
      const order_id = maybeId || body.order_id;
      if (!order_id)
        return new Response(JSON.stringify({ success: false, error: 'Missing order_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      const allowed = ['order_status','courier_name','tracking_link','shipping_cost','delivery_eta','pymt_status'];
      const updates = [];
      const vals = [];
      for (const key of allowed) {
        if (body[key] !== undefined) {
          updates.push(`${key} = ?`);
          vals.push(body[key]);
        }
      }
      if (!updates.length)
        return new Response(JSON.stringify({ success: false, error: 'No valid update fields' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

      vals.push(order_id);
      const result = await env.DB.prepare(
        `UPDATE ceo_orders SET ${updates.join(', ')} WHERE order_id = ?`
      ).bind(...vals).run();

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // === POST: update product stock/price ===
    if (method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.action === 'update_product' && body.prod_id) {
        const updates = [];
        const vals = [];
        if (body.price !== undefined) { updates.push('price = ?'); vals.push(body.price); }
        if (body.stock !== undefined) { updates.push('stock = ?'); vals.push(body.stock); }
        if (body.image_url !== undefined) { updates.push('image_url = ?'); vals.push(body.image_url); }

        if (!updates.length)
          return new Response(JSON.stringify({ success: false, error: 'No product fields to update' }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });

        vals.push(body.prod_id);
        const result = await env.DB.prepare(
          `UPDATE ceo_products SET ${updates.join(', ')} WHERE prod_id = ?`
        ).bind(...vals).run();

        return new Response(JSON.stringify({ success: true, result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({ success: false, error: 'Unknown POST action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405, headers: corsHeaders
    });
  } catch (err) {
    console.error('Admin API error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
                               }
