// ===================================
// FILE 1: functions/api/pi/approve.js
// ===================================

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { payment_id, order_id } = body;

    console.log('📥 Approve request:', { payment_id, order_id });

    if (!payment_id || !order_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing payment_id or order_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PI_API_KEY = env.PI_API_KEY;
    if (!PI_API_KEY) {
      throw new Error('PI_API_KEY not configured');
    }

    // STEP 1: Verify order exists in database first
    console.log('🔍 Checking order in database...');
    const order = await env.DB.prepare(
      'SELECT * FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    if (!order) {
      console.error('❌ Order not found:', order_id);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Order not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Order found:', order);

    // STEP 2: Check if there's already a pending payment for this order
    if (order.pi_payment_id && order.pi_payment_id !== payment_id) {
      console.log('⚠️ Different payment_id already exists for this order');
      
      // Check status of existing payment
      const existingPaymentCheck = await fetch(
        `https://api.minepi.com/v2/payments/${order.pi_payment_id}`,
        {
          headers: { 'Authorization': `Key ${PI_API_KEY}` }
        }
      );

      if (existingPaymentCheck.ok) {
        const existingPaymentData = await existingPaymentCheck.json();
        
        // If existing payment is still pending, reject new payment
        if (!existingPaymentData.status?.developer_completed && 
            !existingPaymentData.status?.cancelled) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Payment already in progress. Please complete the pending payment.',
            existing_payment_id: order.pi_payment_id
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }
    }

    // STEP 3: Verify payment with Pi Network
    console.log('🔍 Verifying payment with Pi...');
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      {
        headers: { 'Authorization': `Key ${PI_API_KEY}` }
      }
    );

    if (!verifyResponse.ok) {
      throw new Error(`Pi verification failed: ${verifyResponse.status}`);
    }

    const paymentData = await verifyResponse.json();
    console.log('✅ Payment data:', paymentData);

    // Check if already approved
    if (paymentData.status?.developer_approved) {
      console.log('ℹ️ Payment already approved');
      return new Response(JSON.stringify({ 
        success: true,
        message: 'Payment already approved',
        payment_id 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // STEP 4: Approve payment on Pi Network
    console.log('🔄 Approving payment on Pi...');
    const approveResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }
    );

    if (!approveResponse.ok) {
      const errorText = await approveResponse.text();
      console.error('❌ Pi approve failed:', errorText);
      throw new Error(`Pi approve failed: ${approveResponse.status} - ${errorText}`);
    }

    const approveData = await approveResponse.json();
    console.log('✅ Payment approved on Pi:', approveData);

    // STEP 5: Save payment_id in database
    console.log('🔄 Saving payment_id to database...');
    const updateResult = await env.DB.prepare(
      'UPDATE ceo_orders SET pi_payment_id = ? WHERE order_id = ?'
    ).bind(payment_id, order_id).run();

    console.log('✅ Database updated:', updateResult);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment approved successfully',
      payment_id,
      order_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('❌ Pi approve error:', err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
