// Pi Payment Approval Handler
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

    if (!payment_id || !order_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing payment_id or order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PI_API_KEY = env.PI_API_KEY;
    if (!PI_API_KEY) throw new Error('PI_API_KEY not configured');

    // Verify payment from Pi
    const verifyResponse = await fetch(`https://api.minepi.com/v2/payments/${payment_id}`, {
      headers: { 'Authorization': `Key ${PI_API_KEY}` },
    });

    const verifyText = await verifyResponse.text();
    let paymentData;
    try { paymentData = JSON.parse(verifyText); } 
    catch { paymentData = { status: { developer_approved: false } }; }

    if (paymentData.status?.developer_approved) {
      return new Response(JSON.stringify({ success: false, error: 'Payment already approved' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify order exists
    const order = await env.DB.prepare('SELECT * FROM ceo_orders WHERE order_id = ?').bind(order_id).first();
    if (!order) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Approve payment on Pi
    const approveResponse = await fetch(`https://api.minepi.com/v2/payments/${payment_id}/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!approveResponse.ok) {
      const text = await approveResponse.text();
      throw new Error(`Pi approve failed: ${approveResponse.status} ${text}`);
    }

    // Save payment_id in DB
    await env.DB.prepare('UPDATE ceo_orders SET pi_payment_id = ? WHERE order_id = ?').bind(payment_id, order_id).run();

    return new Response(JSON.stringify({ success: true, message: 'Payment approved', payment_id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Pi approve error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message || 'Unknown error' }), {
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
