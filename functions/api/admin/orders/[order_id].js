export async function onRequestPut(context) {
  const { request, env, params } = context;
  const token = request.headers.get('x-admin-token');
  if (token !== env.ADMIN_TOKEN)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 403 });

  const db = env.DB; // D1 binding
  const body = await request.json();
  const { order_status, courier_name, tracking_link } = body;

  try {
    await db.prepare(
      `UPDATE ceo_orders 
       SET order_status=?, courier_name=?, tracking_link=? 
       WHERE order_id=?`
    ).bind(order_status, courier_name, tracking_link, params.order_id).run();

    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ success: false, error: err.message });
  }
  }
