//test order for refund//

export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const { order_id, user_uid, amount } = await request.json();

    // Mapping the data to your specific D1 columns:
    // total_amt -> amount
    // order_status -> 'pending'
    await env.DB.prepare(`
      INSERT INTO ceo_orders (
        order_id, 
        user_uid, 
        total_amt, 
        order_status, 
        created_at,
        cus_name,
        prod_name
      ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `).bind(
      order_id, 
      user_uid, 
      amount, 
      'pending', 
      'Test User', 
      'Test Refund Product'
    ).run();

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
