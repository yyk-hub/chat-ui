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
    console.log('Complete payment request:', { payment_id, txid, order_id });
    
    if (!payment_id || !txid || !order_id) {
      return new Response(JSON.stringify({ 
        success: false, 
       error: 'Missing required fields: payment_id, txid, or order_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Verify payment with Pi API
    const PI_API_KEY = env.PI_API_KEY;
    
    if (!PI_API_KEY) {
      throw new Error('PI_API_KEY not configured in environment');
    }
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      {
        headers: {
          'Authorization': `Key ${PI_API_KEY}`
        }
      }
    );

    if (!verifyResponse.ok) {
      throw new Error(`Pi API verification failed: ${verifyResponse.status}`);
    }

    const paymentData = await verifyResponse.json();

    // Complete payment on Pi Network
    if (!paymentData.status.developer_completed) {
      console.log('Completing payment on Pi Network...');

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
        const errorText = await completeResponse.text();
        console.error('Pi complete API error:', errorText);
        throw new Error(`Failed to complete on Pi: ${completeResponse.status}`);
      }
      console.log('✅ Completed on Pi Network');
    } else {
      console.log('Already completed on Pi Network');
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
      txid: txid,
      payment_id: payment_id
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
