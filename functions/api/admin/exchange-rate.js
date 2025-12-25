// functions/api/admin/exchange-rate.js
// Admin API for managing Pi exchange rates

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // Authentication
  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }), 
      { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(request.url);

    // ============================================
    // Debug: Check if DB is available
    // ============================================
    if (!env.DB) {
      console.error('❌ env.DB is not defined - D1 binding missing in wrangler.toml');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Database not configured. Please add D1 binding in wrangler.toml' 
        }), 
        { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // GET: Get current exchange rate
    // ============================================
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT rate, updated_at FROM exchange_rate WHERE currency = 'PI' ORDER BY updated_at DESC LIMIT 1"
      ).all();

      if (!results || results.length === 0) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'No exchange rate found. Please initialize the table.' 
          }), 
          { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      const rate = results[0].rate;
      return new Response(
        JSON.stringify({ 
          success: true, 
          rate: rate,
          updated_at: results[0].updated_at,
          pi_per_myr: parseFloat((1.0 / rate).toFixed(8))
        }), 
        { headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // POST: Update exchange rate or get history
    // ============================================
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const action = body.action || 'update';

      // Get rate history
      if (action === 'history') {
        const limit = parseInt(body.limit || '10', 10);
        
        const { results } = await env.DB.prepare(`
          SELECT 
            id,
            currency,
            rate,
            updated_at,
            ROUND(1.0 / rate, 8) as pi_per_myr
          FROM exchange_rate 
          WHERE currency = 'PI'
          ORDER BY updated_at DESC 
          LIMIT ?
        `).bind(limit).all();

        return new Response(
          JSON.stringify({ 
            success: true, 
            history: results 
          }), 
          { headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      // Update rate
      if (action === 'update') {
        const newRate = parseFloat(body.rate);
        
        if (!newRate || newRate <= 0) {
          return new Response(
            JSON.stringify({ 
              success: false, 
              error: 'Invalid rate. Must be a positive number.' 
            }), 
            { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
          );
        }

        // Get current rate for logging
        let oldRate = null;
        try {
          const { results } = await env.DB.prepare(
            "SELECT rate FROM exchange_rate WHERE currency = 'PI' ORDER BY updated_at DESC LIMIT 1"
          ).all();
          oldRate = results[0]?.rate;
        } catch (e) {
          console.warn('Could not fetch old rate:', e);
        }

        // Insert new rate (keeps history)
        await env.DB.prepare(
          "INSERT INTO exchange_rate (currency, rate) VALUES ('PI', ?)"
        ).bind(newRate).run();

        console.log(`💱 Exchange rate updated: ${oldRate} → ${newRate}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            old_rate: oldRate,
            new_rate: newRate,
            message: `Exchange rate updated to ${newRate} MYR per Pi`
          }), 
          { headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: 'Invalid action' }), 
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }), 
      { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Exchange rate API error:', err);
    console.error('Error stack:', err.stack);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      hasDB: !!env.DB,
      hasAdminToken: !!env.ADMIN_TOKEN
    });
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message,
        details: err.name,
        hint: !env.DB ? 'D1 binding missing' : 'Check if exchange_rate table exists'
      }), 
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
}
