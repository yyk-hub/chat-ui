// functions/api/refund/process.js
// FIXED: Use x-admin-token authentication

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  try {
    // ✅ FIXED: Use x-admin-token
    const adminToken = request.headers.get('x-admin-token');
    if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
      return Response.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { 
        status: 403, 
        headers: corsHeaders 
      });
    }

    const body = await request.json();
    const { refund_id } = body;

    console.log('📥 Process refund request:', refund_id);

    if (!refund_id) {
      return Response.json({
        success: false,
        error: 'Missing refund_id'
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Get refund details
    const refund = await env.DB.prepare(
      'SELECT * FROM refunds WHERE refund_id = ?'
    ).bind(refund_id).first();

    if (!refund) {
      return Response.json({
        success: false,
        error: 'Refund not found'
      }, { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Check refund status
    if (refund.refund_status === 'completed') {
      return Response.json({
        success: false,
        error: 'Refund already completed',
        refund_id,
        txid: refund.txid
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    if (refund.refund_status !== 'pending') {
      return Response.json({
        success: false,
        error: `Refund status is ${refund.refund_status}, expected pending`
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    console.log('✅ Refund found:', {
      refund_id,
      order_id: refund.order_id,
      user_uid: refund.user_uid,
      amount: refund.amount
    });

    // ====================================================================
    // STEP 1: Create A2U Payment via Pi Platform API
    // ====================================================================
    
    const paymentData = {
      amount: parseFloat(refund.amount),
      memo: refund.memo || `Refund for order ${refund.order_id}`,
      metadata: JSON.parse(refund.metadata || '{}'),
      uid: refund.user_uid
    };

    console.log('🔄 Creating A2U payment on Pi Platform...');
    console.log('Payment data:', {
      amount: paymentData.amount,
      uid: paymentData.uid,
      memo: paymentData.memo
    });

    const piResponse = await fetch('https://api.minepi.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentData)
    });

    if (!piResponse.ok) {
      const errorText = await piResponse.text();
      console.error('❌ Pi API error:', errorText);
      
      // Update refund with error
      await env.DB.prepare(`
        UPDATE refunds 
        SET refund_status = 'failed',
            error_message = ?,
            retry_count = retry_count + 1
        WHERE refund_id = ?
      `).bind(`Pi API error: ${errorText}`, refund_id).run();
      
      throw new Error(`Pi API error: ${piResponse.status} - ${errorText}`);
    }

    const piData = await piResponse.json();
    
    console.log('✅ A2U payment created on Pi Platform:', {
      payment_id: piData.identifier,
      has_transaction: !!piData.transaction,
      status: piData.status
    });

    const paymentIdentifier = piData.identifier;
    const recipientAddress = piData.to_address || piData.recipient;
    const txid = piData.transaction?.txid;

    // ====================================================================
    // STEP 2: Update Refund Record
    // ====================================================================

    // Check if payment is already completed by Pi Platform
    if (piData.status?.developer_completed && txid) {
      console.log('✅ Payment auto-completed by Pi Platform');
      
      // Update refund as completed
      await env.DB.prepare(`
        UPDATE refunds 
        SET payment_identifier = ?,
            recipient_address = ?,
            txid = ?,
            refund_status = 'completed',
            initiated_at = unixepoch(),
            completed_at = unixepoch()
        WHERE refund_id = ?
      `).bind(paymentIdentifier, recipientAddress, txid, refund_id).run();

      // Update order
      await env.DB.prepare(`
        UPDATE ceo_orders 
        SET has_refund = 1,
            refund_reason = ?,
            refunded_at = unixepoch()
        WHERE order_id = ?
      `).bind(refund.memo, refund.order_id).run();

      console.log('✅ Refund completed:', {
        refund_id,
        payment_id: paymentIdentifier,
        txid
      });

      return Response.json({
        success: true,
        refund_id,
        payment_identifier: paymentIdentifier,
        txid,
        status: 'completed',
        message: 'Refund processed successfully'
      }, { 
        headers: corsHeaders 
      });
      
    } else {
      // Payment initiated but not completed yet
      console.log('⏳ Payment initiated, waiting for completion...');
      
      await env.DB.prepare(`
        UPDATE refunds 
        SET payment_identifier = ?,
            recipient_address = ?,
            refund_status = 'processing',
            initiated_at = unixepoch()
        WHERE refund_id = ?
      `).bind(paymentIdentifier, recipientAddress, refund_id).run();

      return Response.json({
        success: true,
        refund_id,
        payment_identifier: paymentIdentifier,
        status: 'processing',
        message: 'A2U payment initiated. Transaction being processed by Pi Platform.'
      }, { 
        headers: corsHeaders 
      });
    }

  } catch (error) {
    console.error('❌ Process refund error:', error);
    
    return Response.json({
      success: false,
      error: error.message
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
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    },
  });
}
