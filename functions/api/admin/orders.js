// functions/api/admin/orders.js

export async function onRequest(context) {
  const { request, env } = context;
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
      status: 403, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const url = new URL(request.url);

    // === GET: list orders with pagination & optional phone ===
    if (request.method === 'GET') {
      const phone = url.searchParams.get('phone');
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);
      const offset = parseInt(url.searchParams.get('offset') || '0', 10);

      let q;
      if (phone) {
        q = env.DB.prepare(
          'SELECT * FROM ceo_orders WHERE phone = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(phone, limit, offset);
      } else {
        q = env.DB.prepare(
          'SELECT * FROM ceo_orders ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset);
      }

      const { results } = await q.all();
      return new Response(JSON.stringify(results), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // === PUT: update order ===
    if (request.method === 'PUT') {
      const parts = url.pathname.split('/').filter(Boolean);
      const maybeId = parts.length >= 3 ? parts[2] : null;
      const body = await request.json().catch(() => ({}));
      const order_id = maybeId || body.order_id;
      if (!order_id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing order_id' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      const allowed = ['order_status','courier_name','tracking_link','shipping_cost','delivery_eta','pymt_status'];
      const fields = [], values = [];
      for (const k of allowed) {
        if (body[k] !== undefined) { fields.push(`${k} = ?`); values.push(body[k]); }
      }
      if (!fields.length) {
        return new Response(JSON.stringify({ success: false, error: 'No valid update fields' }), {
          status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }

      values.push(order_id);
      const sql = `UPDATE ceo_orders SET ${fields.join(', ')} WHERE order_id = ?`;
      const result = await env.DB.prepare(sql).bind(...values).run();

      return new Response(JSON.stringify({ success: true, result }), {
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    // === POST: update product ===
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.action === 'update_product' && body.prod_id) {
        const updates = [], vals = [];
        if (body.price !== undefined) { updates.push('price = ?'); vals.push(body.price); }
        if (body.stock !== undefined) { updates.push('stock = ?'); vals.push(body.stock); }
        if (body.image_url !== undefined) { updates.push('image_url = ?'); vals.push(body.image_url); }
        if (!updates.length) {
          return new Response(JSON.stringify({ success: false, error: 'No fields to update' }), {
            status: 400, headers: { ...cors, 'Content-Type': 'application/json' }
          });
        }

        vals.push(body.prod_id);
        const q = `UPDATE ceo_products SET ${updates.join(', ')} WHERE prod_id = ?`;
        const r = await env.DB.prepare(q).bind(...vals).run();
        return new Response(JSON.stringify({ success: true, result: r }), {
          headers: { ...cors, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405, headers: cors
    });
  } catch (err) {
    console.error('Admin API error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
          }
