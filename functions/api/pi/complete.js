// functions/api/pi/complete.js
// DEBUG VERSION - See what Pi API actually returns

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
      console.error('❌ Missing env vars');
      throw new Error('PI_API_KEY or APP_WALLET_SECRET not configured');
    }

    // Find order
    let order = null;
    
    if (order_id) {
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE order_id = ?'
      ).bind(order_id).first();
    }
    
    if (!order) {
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE pi_payment_id = ?'
      ).bind(payment_id).first();
    }

    if (!order) {
      console.error('❌ No order found');
    } else {
      console.log('✅ Order found:', order.order_id);
      
      if (order.order_status === 'Paid') {
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

    // ====================================================================
    // 🔍 DEBUG: Verify payment - LOG FULL RESPONSE
    // ====================================================================
    console.log('🔍 Calling Pi API: GET /v2/payments/' + payment_id);
    
    const verifyResponse = await fetch(
      `https://api.minepi.com/v2/payments/${payment_id}`,
      {
        headers: { 'Authorization': `Key ${PI_API_KEY}` }
      }
    );

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('❌ Pi verification failed:', errorText);
      throw new Error(`Pi verification failed: ${verifyResponse.status}`);
    }

    const paymentData = await verifyResponse.json();
    
    // ====================================================================
    // 🔍 DEBUG: Log FULL payment data structure
    // ====================================================================
    console.log('====================================');
    console.log('📦 FULL PAYMENT DATA FROM Pi API:');
    console.log(JSON.stringify(paymentData, null, 2));
    console.log('====================================');
    
    // Check if user data exists
    console.log('🔍 Checking user data:');
    console.log('  - paymentData.user exists?', !!paymentData.user);
    console.log('  - paymentData.user:', paymentData.user);
    console.log('  - paymentData.from_address exists?', !!paymentData.from_address);
    console.log('  - paymentData.from_address:', paymentData.from_address);
    
    // Try multiple possible locations for user_uid
    let userUid = null;
    let source = 'not found';
    
    if (paymentData.user?.uid) {
      userUid = paymentData.user.uid;
      source = 'paymentData.user.uid';
    } else if (paymentData.user_uid) {
      userUid = paymentData.user_uid;
      source = 'paymentData.user_uid';
    } else if (paymentData.uid) {
      userUid = paymentData.uid;
      source = 'paymentData.uid';
    } else if (paymentData.from_address) {
      // For U2A payments, from_address might be the user identifier
      userUid = paymentData.from_address;
      source = 'paymentData.from_address (blockchain address)';
    }
    
    console.log('====================================');
    console.log('✅ User UID extraction result:');
    console.log('  - user_uid:', userUid);
    console.log('  - source:', source);
    console.log('====================================');

    // Complete payment on Pi Network
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
        console.error('❌ Pi complete failed:', errorText);
        throw new Error(`Pi complete failed: ${completeResponse.status}`);
      }

      const completeData = await completeResponse.json();
      console.log('✅ Payment completed:', completeData);
    } else {
      console.log('ℹ️ Payment already completed on Pi');
    }

    // Update order in D1
    if (order) {
      console.log('🔄 Updating order in database...');
      
      let updateResult;
      
      if (userUid) {
        updateResult = await env.DB.prepare(`
          UPDATE ceo_orders
          SET order_status = 'Paid',
              pi_payment_id = ?,
              pi_txid = ?,
              pymt_method = 'Pi Network',
              user_uid = ?
          WHERE order_id = ?
        `).bind(payment_id, txid, userUid, order.order_id).run();
        
        console.log('✅ Updated WITH user_uid:', userUid);
      } else {
        updateResult = await env.DB.prepare(`
          UPDATE ceo_orders
          SET order_status = 'Paid',
              pi_payment_id = ?,
              pi_txid = ?,
              pymt_method = 'Pi Network'
          WHERE order_id = ?
        `).bind(payment_id, txid, order.order_id).run();
        
        console.log('⚠️ Updated WITHOUT user_uid (not found in Pi response)');
      }

      console.log('Database update result:', {
        success: updateResult.success,
        changes: updateResult.meta?.changes
      });

      // Fetch updated order
      const updatedOrder = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE order_id = ?'
      ).bind(order.order_id).first();

      console.log('✅ Order updated:', {
        order_id: updatedOrder.order_id,
        status: updatedOrder.order_status,
        user_uid: updatedOrder.user_uid || 'NULL'
      });

      return new Response(JSON.stringify({
        success: true,
        message: 'Payment completed successfully',
        order_id: updatedOrder.order_id,
        payment_id,
        txid,
        order_status: updatedOrder.order_status,
        user_uid: updatedOrder.user_uid || null,
        debug: {
          user_uid_source: source,
          had_user_data: !!paymentData.user
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      
    } else {
      console.log('✅ Payment completed (no order to update)');
      
      return new Response(JSON.stringify({
        success: true,
        message: 'Payment completed on Pi Network (no order found)',
        payment_id,
        txid,
        user_uid: userUid || null,
        debug: {
          user_uid_source: source,
          had_user_data: !!paymentData.user
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err) {
    console.error('❌ Error:', err);
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
