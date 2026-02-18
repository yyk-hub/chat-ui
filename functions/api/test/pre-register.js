//test order for refund//

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { order_id, user_uid, amount } = await request.json();

    // Direct insertion into your production-structured D1 table
    await env.DB.prepare(`
      INSERT INTO ceo_orders (order_id, user_uid, amount, status, created_at) 
      VALUES (?, ?, ?, 'pending_payment', unixepoch())
    `).bind(order_id, user_uid, amount).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
