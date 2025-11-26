// functions/api/pi/approve.js
// Pi Payment Approval Handler

// Safe JSON parser
async function safeJson(request) {
  try {
    return await request.json();
  } catch (err) {
    console.error("Invalid JSON:", err);
    return null;
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // SAFER JSON
    const body = await safeJson(request);

    if (!body) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid JSON body',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { payment_id, order_id } = body;

    if (!payment_id || !order_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing payment_id or order_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify payment with Pi API
    const PI_API_KEY = env.PI_API_KEY;
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      { headers: { 'Authorization': `Key ${PI_API_KEY}` } }
    );

    if (!verifyResponse.ok) {
      throw new Error('Pi payment verification failed');
    }

    const paymentData = await verifyResponse.json();

    if (paymentData.status.developer_approved) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Payment already approved' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check order exists
    const order = await env.DB.prepare(
      'SELECT * FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    if (!order) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Order not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Approve payment
    const approveResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}/approve`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${PI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      }
    );

    if (!approveResponse.ok) {
      throw new Error('Failed to approve payment on Pi Network');
    }

    // Save payment ID
    await env.DB.prepare(
      'UPDATE ceo_orders SET pi_payment_id = ? WHERE order_id = ?'
    ).bind(payment_id, order_id).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment approved' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pi approval error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
