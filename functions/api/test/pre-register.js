// functions/api/test/pre-register.js
// Pre-register test orders for refund testing

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { order_id, user_uid, username, amount } = await request.json();

    // Validate required fields
    if (!order_id || !user_uid || !amount) {
      return Response.json({
        success: false,
        error: 'Missing required fields: order_id, user_uid, amount'
      }, { 
        status: 400,
        headers: corsHeaders 
      });
    }

    console.log('📝 Pre-registering test order:', { order_id, user_uid, amount });

    // Check if order already exists
    const existing = await env.DB.prepare(
      'SELECT order_id FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    if (existing) {
      return Response.json({
        success: true,
        message: 'Order already exists',
        order_id
      }, { headers: corsHeaders });
    }

    // Insert test order with all required columns
    await env.DB.prepare(`
      INSERT INTO ceo_orders (
        order_id,
        user_uid,
        pi_username,
        total_amt,
        pi_amount,
        order_status,
        created_at,
        cus_name,
        phone,
        cus_address,
        postcode,
        state_to,
        prod_name,
        quantity
       ) VALUES (?, ?, ?, ?, ?, ?, unixepoch(), ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      order_id,
      user_uid,
      pi_username || 'test_user',
      amount,                    // total_amt (in RM)
      amount,                    // pi_amount (1 RM = 1 Pi for testing)
      'completed',               // order_status
      'Test User',               // cus_name
      '0168101358',              // phone
      'Test Address',            // cus_address
      '88000',                   // postcode
      'Sabah',                   // state_to
      'A2U Refund Test',         // prod_name
      1                          // quantity
    ).run();

    console.log('✅ Test order registered:', order_id);

    return Response.json({
      success: true,
      message: 'Test order registered successfully',
      order_id,
      user_uid,
      amount
    }, { headers: corsHeaders });

  } catch (err) {
    console.error('❌ Pre-register error:', err);
    
    return Response.json({
      success: false,
      error: err.message
    }, { 
      status: 500,
      headers: corsHeaders 
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

