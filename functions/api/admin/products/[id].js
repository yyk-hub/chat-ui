export async function onRequest(context) {
  const { request, env, params } = context;
  const token = request.headers.get('x-admin-token');
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }

  // Token check
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const prod_id = params.id;

  // === GET: Fetch product details ===
  if (request.method === 'GET') {
    const q = await env.DB.prepare(
      'SELECT prod_id, prod_name, price, stock FROM ceo_products WHERE prod_id = ?'
    ).bind(prod_id).first();

    if (!q) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(q), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // === PUT: Update price / stock ===
  if (request.method === 'PUT') {
    const body = await request.json().catch(() => ({}));
    const updates = [];
    const values = [];

    if (body.price !== undefined) {
      updates.push('price = ?');
      values.push(body.price);
    }
    if (body.stock !== undefined) {
      updates.push('stock = ?');
      values.push(body.stock);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    values.push(prod_id);
    const query = `UPDATE ceo_products SET ${updates.join(', ')} WHERE prod_id = ?`;
    const result = await env.DB.prepare(query).bind(...values).run();

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Fallback
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
  }
