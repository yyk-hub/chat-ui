export async function onRequest(context) {
  const { request, env } = context;
  const token = request.headers.get('x-admin-token');

  // Verify admin token
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Fetch all products for dropdown
    const q = await env.DB.prepare(
      'SELECT prod_id, prod_name FROM ceo_products ORDER BY prod_id ASC'
    ).all();

    return new Response(JSON.stringify(q.results || []), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
