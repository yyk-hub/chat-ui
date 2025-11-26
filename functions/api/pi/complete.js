// Pi Payment Completion Handler
export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { payment_id, txid, order_id } = body;

    if (!payment_id || !txid || !order_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing payment_id, txid, or order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PI_API_KEY = env.PI_API_KEY;
    const APP_WALLET_SECRET = env.APP_WALLET_SECRET;

    if (!PI_API_KEY || !APP_WALLET_SECRET) throw new Error('PI_API_KEY or APP_WALLET_SECRET not configured');

    // Verify payment
    const verifyResponse = await fetch(`https://api.minepi.com/v2/payments/${payment_id}`, {
      headers: { 'Authorization': `Key ${PI_API_KEY}` },
    });

    const verifyText = await verifyResponse.text();
    let paymentData;
    try { paymentData = JSON.parse(verifyText); } 
    catch { paymentData = { status: { developer_completed: false } }; }

    // Complete payment if not done
    if (!paymentData.status?.developer_completed) {
      const completeResponse = await fetch(`https://api.minepi.com/v2/payments/${payment_id}/complete`, {
        method: 'POST',
        headers: { 'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ txid, app_wallet_secret: APP_WALLET_SECRET }),
      });

      const text = await completeResponse.text();
      let completeData;
      try { completeData = JSON.parse(text); } catch { completeData = { raw: text }; }

      if (!completeResponse.ok) {
        throw new Error(`Pi complete failed: ${completeResponse.status} ${text}`);
      }
      console.log('✅ Payment completed on Pi:', completeData);
    }

    // Update order in D1
    const orderBefore = await env.DB.prepare('SELECT * FROM ceo_orders WHERE order_id = ?').bind(order_id).first();
    console.log('Order before update:', orderBefore);

    const updateResult = await env.DB.prepare(`
      UPDATE ceo_orders
      SET order_status = 'Paid',
          pi_payment_id = ?,
          pi_txid = ?,
          pymt_method = 'Pi Network'
      WHERE order_id = ?
    `).bind(payment_id, txid, order_id).run();

    console.log('Database update result:', updateResult);

    const updatedOrder = await env.DB.prepare('SELECT * FROM ceo_orders WHERE order_id = ?').bind(order_id).first();

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment completed successfully',
      order_id,
      payment_id,
      txid,
      order: updatedOrder,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Pi complete error:', err);
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
