// ===================================
// FILE 2: functions/api/pi/complete.js
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
    const { payment_id, txid, order_id } = body;

    console.log('📥 Complete request:', { payment_id, txid, order_id });

    if (!payment_id || !txid || !order_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing payment_id, txid, or order_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PI_API_KEY = env.PI_API_KEY;
    const APP_WALLET_SECRET = env.APP_WALLET_SECRET;

    if (!PI_API_KEY || !APP_WALLET_SECRET) {
      throw new Error('PI_API_KEY or APP_WALLET_SECRET not configured');
    }

    // STEP 1: Verify order exists
    console.log('🔍 Checking order in database...');
    const orderBefore = await env.DB.prepare(
      'SELECT * FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    if (!orderBefore) {
      console.error('❌ Order not found:', order_id);
      return new Response(JSON.stringify({ 
        success: false, 
        error: `Order ${order_id} not found` 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Order before update:', orderBefore);

    // STEP 2: Verify payment with Pi
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
    console.log('✅ Payment data from Pi:', paymentData);

    // STEP 3: Complete payment on Pi if not already done
    if (!paymentData.status?.developer_completed) {
      console.log('🔄 Completing payment on Pi Network...');
      
      const completeResponse = await fetch(
        `https://api.minepi.com/v2/payments/${payment_id}/complete`,
        {
          method: 'POST',
          headers: { 
            'Authorization': `Key ${PI_API_KEY}`, 
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({ 
            txid, 
            app_wallet_secret: APP_WALLET_SECRET 
          }),
        }
      );

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.error('❌ Pi complete failed:', errorText);
        throw new Error(`Pi complete failed: ${completeResponse.status} - ${errorText}`);
      }

      const completeData = await completeResponse.json();
      console.log('✅ Payment completed on Pi:', completeData);
    } else {
      console.log('ℹ️ Payment already completed on Pi');
    }

    // STEP 4: Update order in D1
    console.log('🔄 Updating order in database...');
    const updateResult = await env.DB.prepare(`
      UPDATE ceo_orders
      SET order_status = 'Paid',
          pi_payment_id = ?,
          pi_txid = ?,
          pymt_method = 'Pi Network'
      WHERE order_id = ?
    `).bind(payment_id, txid, order_id).run();

    console.log('✅ Database update result:', {
      success: updateResult.success,
      changes: updateResult.meta?.changes
    });

    // STEP 5: Verify update worked
    if (!updateResult.success || updateResult.meta?.changes === 0) {
      throw new Error('Failed to update order in database');
    }

    const updatedOrder = await env.DB.prepare(
      'SELECT * FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    console.log('✅ Order after update:', updatedOrder);

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment completed successfully',
      order_id,
      payment_id,
      txid,
      order_status: updatedOrder.order_status,
      order: updatedOrder,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('❌ Pi complete error:', err);
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
