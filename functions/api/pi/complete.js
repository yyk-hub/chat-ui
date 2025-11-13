// functions/api/pi/complete.js
// Pi Payment Completion Handler

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const { payment_id, txid, order_id } = await request.json();

    if (!payment_id || !txid || !order_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Verify payment completed on Pi blockchain
    const PI_API_KEY = env.PI_API_KEY;
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      {
        headers: {
          'Authorization': `Key ${PI_API_KEY}`
        }
      }
    );

    if (!verifyResponse.ok) {
      throw new Error('Pi payment verification failed');
    }

    const paymentData = await verifyResponse.json();

    // Check payment is completed
    if (!paymentData.status.developer_completed) {
      // Complete payment via Pi API
      const completeResponse = await fetch(
        `https://api.minepi.com/v2/payments/${payment_id}/complete`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Key ${PI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ txid })
        }
      );

      if (!completeResponse.ok) {
        throw new Error('Failed to complete payment on Pi Network');
      }
    }

    // Update order in D1 - mark as Paid
    await env.DB.prepare(`
      UPDATE ceo_orders 
      SET order_status = 'Paid',
          pi_payment_id = ?,
          pi_txid = ?,
          pymt_method = 'Pi Network',
          updated_at = CURRENT_TIMESTAMP
      WHERE order_id = ?
    `).bind(payment_id, txid, order_id).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment completed successfully',
      order_id: order_id,
      txid: txid
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Pi completion error:', error);
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
