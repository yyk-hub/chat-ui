// functions/api/admin/orders.js

// Admin endpoints for orders/products (protected by ADMIN_TOKEN)

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Authentication (header: x-admin-token)
  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);
    
    // Get Orders with pagination & filters
    
   if (request.method === 'GET') {
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

    // Update order (PUT) — expects order_id path or order_id in body
    if (request.method === 'PUT') {
      // parse path: /api/admin/orders/ORD12345  OR body contains order_id
      const parts = url.pathname.split('/').filter(Boolean);
      const maybeId = parts.length >= 3 ? parts[2] : null; // /api/admin/orders/{id}
      const body = await request.json().catch(()=> ({}));
      const order_id = maybeId || body.order_id;

      if (!order_id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing order_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // allowed update fields:
      const allowed = ['order_status','courier_name','tracking_link','shipping_cost','delivery_eta','pymt_status'];
      const fields = [];
      const values = [];

      for (const k of allowed) {
        if (body[k] !== undefined) {
          fields.push(`${k} = ?`);
          values.push(body[k]);
        }
      }

      if (fields.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No valid update fields provided' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      values.push(order_id);
      const q = `UPDATE ceo_orders SET ${fields.join(', ')} WHERE order_id = ?`;
      const result = await env.DB.prepare(q).bind(...values).run();

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Update product stock / price (POST) — small helper
    if (request.method === 'POST') {
      // body: { action: 'update_product', prod_id, price?, stock? }
      const body = await request.json().catch(()=> ({}));
      if (body.action === 'update_product' && body.prod_id) {
        const updates = [];
        const vals = [];
        if (body.price !== undefined) { updates.push('price = ?'); vals.push(body.price); }
        if (body.stock !== undefined) { updates.push('stock = ?'); vals.push(body.stock); }
        if (body.image_url !== undefined) { updates.push('image_url = ?'); vals.push(body.image_url); }
        if (updates.length === 0) {
          return new Response(JSON.stringify({ success: false, error: 'No product fields to update' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        vals.push(body.prod_id);
        const q = `UPDATE ceo_products SET ${updates.join(', ')} WHERE prod_id = ?`;
        const r = await env.DB.prepare(q).bind(...vals).run();
        return new Response(JSON.stringify({ success: true, result: r }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: false, error: 'Unknown POST action' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  } catch (err) {
    console.error('Admin API error', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
                        }
