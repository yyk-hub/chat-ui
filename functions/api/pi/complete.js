// functions/api/pi/complete.js
// Pi Payment Completion Handler - PRODUCTION READY
// Tries multiple locations for user_uid

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

    if (!payment_id || !txid) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing payment_id or txid' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const PI_API_KEY = env.PI_API_KEY;
    const APP_WALLET_SECRET = env.APP_WALLET_SECRET;

    if (!PI_API_KEY || !APP_WALLET_SECRET) {
      console.error('❌ Missing env vars:', { 
        has_api_key: !!PI_API_KEY, 
        has_wallet_secret: !!APP_WALLET_SECRET 
      });
      throw new Error('PI_API_KEY or APP_WALLET_SECRET not configured');
    }

    // STEP 1: Find order
    let order = null;
    
    if (order_id) {
      console.log('🔍 Looking for order:', order_id);
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE order_id = ?'
      ).bind(order_id).first();
    }
    
    if (!order) {
      console.log('🔍 Order not found by order_id, searching by payment_id...');
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE pi_payment_id = ?'
      ).bind(payment_id).first();
    }

    if (!order) {
      console.error('❌ No order found for payment_id:', payment_id);
      console.log('⚠️ Will complete on Pi Network but cannot update order');
    } else {
      console.log('✅ Order found:', {
        order_id: order.order_id,
        status: order.order_status
      });
      
      if (order.order_status === 'Paid') {
        console.log('ℹ️ Order already marked as Paid');
        return new Response(JSON.stringify({
          success: true,
          message: 'Payment already completed',
          order_id: order.order_id,
          payment_id,
          txid,
          user_uid: order.user_uid || null
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // STEP 2: Verify payment with Pi Network
    console.log('🔍 Verifying payment with Pi Network...');
    
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      {
        headers: { 'Authorization': `Key ${PI_API_KEY}` }
      }
    );

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('❌ Pi verification failed:', errorText);
      throw new Error(`Pi verification failed: ${verifyResponse.status} - ${errorText}`);
    }

    const paymentData = await verifyResponse.json();
    
    // ====================================================================
    // 🎯 ROBUST user_uid EXTRACTION - Tries multiple locations
    // ====================================================================
    let userUid = null;
    let uidSource = 'not_found';
    
    // Try location 1: paymentData.user.uid (standard U2A location)
    if (paymentData.user?.uid) {
      userUid = paymentData.user.uid;
      uidSource = 'user.uid';
    }
    // Try location 2: paymentData.user_uid (alternative format)
    else if (paymentData.user_uid) {
      userUid = paymentData.user_uid;
      uidSource = 'user_uid';
    }
    // Try location 3: paymentData.uid (short format)
    else if (paymentData.uid) {
      userUid = paymentData.uid;
      uidSource = 'uid';
    }
    // Try location 4: paymentData.from_address (blockchain address)
    else if (paymentData.from_address) {
      userUid = paymentData.from_address;
      uidSource = 'from_address';
    }
    // Try location 5: paymentData.metadata.user_uid (metadata field)
    else if (paymentData.metadata?.user_uid) {
      userUid = paymentData.metadata.user_uid;
      uidSource = 'metadata.user_uid';
    }
    
    console.log('✅ Payment verified:', {
      identifier: paymentData.identifier,
      amount: paymentData.amount,
      has_user_uid: !!userUid,
      uid_source: uidSource
    });
    
    if (userUid) {
      console.log('✅ User UID extracted:', userUid, `(from: ${uidSource})`);
    } else {
      console.warn('⚠️ No user UID found in payment data');
    }

    // STEP 3: Complete payment on Pi Network if not already done
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
            txid: txid,
            app_wallet_secret: APP_WALLET_SECRET
          }),
        }
      );

      if (!completeResponse.ok) {
        const errorText = await completeResponse.text();
        console.error('❌ Pi complete failed:', {
          status: completeResponse.status,
          error: errorText
        });
        throw new Error(`Pi complete failed: ${completeResponse.status} - ${errorText}`);
      }

      const completeData = await completeResponse.json();
      console.log('✅ Payment completed on Pi Network');
    } else {
      console.log('ℹ️ Payment already completed on Pi Network');
    }

    // STEP 4: Update order in D1 (if order exists)
    if (order) {
      console.log('🔄 Updating order in database...');
      
      let updateResult;
      
      if (userUid) {
        // Update WITH user_uid
        updateResult = await env.DB.prepare(`
          UPDATE ceo_orders
          SET order_status = 'Paid',
              pi_payment_id = ?,
              pi_txid = ?,
              pymt_method = 'Pi Network',
              user_uid = ?
          WHERE order_id = ?
        `).bind(payment_id, txid, userUid, order.order_id).run();
        
        console.log('✅ Updated order with user_uid:', userUid);
      } else {
        // Update WITHOUT user_uid
        updateResult = await env.DB.prepare(`
          UPDATE ceo_orders
          SET order_status = 'Paid',
              pi_payment_id = ?,
              pi_txid = ?,
              pymt_method = 'Pi Network'
          WHERE order_id = ?
        `).bind(payment_id, txid, order.order_id).run();
        
        console.log('⚠️ Updated order WITHOUT user_uid (not available)');
      }

      console.log('✅ Database update:', {
        success: updateResult.success,
        changes: updateResult.meta?.changes
      });

      // Fetch updated order
      const updatedOrder = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE order_id = ?'
      ).bind(order.order_id).first();

      console.log('✅ Order status:', {
        order_id: updatedOrder.order_id,
        status: updatedOrder.order_status,
        has_user_uid: !!updatedOrder.user_uid
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Payment completed successfully',
        order_id: updatedOrder.order_id,
        payment_id,
        txid,
        order_status: updatedOrder.order_status,
        user_uid: updatedOrder.user_uid || null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      
    } else {
      // No order found, but payment completed on Pi
      console.log('✅ Payment completed on Pi (no order to update)');
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Payment completed on Pi Network (no order found)',
        payment_id,
        txid,
        user_uid: userUid || null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Stack:', err.stack);
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message || 'Unknown error',
      details: err.stack
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
