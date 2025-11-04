export async function onRequest(context) {
  const { request, env, params } = context;
  const token = request.headers.get('x-admin-token');
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });

  const prod_id = params.id;
  const q = await env.DB.prepare('SELECT prod_id, prod_name, price, stock FROM ceo_products WHERE prod_id = ?')
    .bind(prod_id)
    .first();

  if (!q) {
    return new Response(JSON.stringify({ error: 'Product not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify(q), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
