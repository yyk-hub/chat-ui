// functions/api/refund/process.js
// FINAL FIX: Include APP_WALLET_SECRET in A2U payment request

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  try {
    const adminToken = request.headers.get('x-admin-token');
    if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 403, headers: corsHeaders });
    }

    const body = await request.json();
    const { refund_id } = body;
    if (!refund_id) {
      return Response.json({ success: false, error: 'Missing refund_id' }, { status: 400, headers: corsHeaders });
    }

    const refund = await env.DB.prepare('SELECT * FROM refunds WHERE refund_id = ?').bind(refund_id).first();
    if (!refund) {
      return Response.json({ success: false, error: 'Refund not found' }, { status: 404, headers: corsHeaders });
    }
    if (refund.refund_status === 'completed') {
      return Response.json({ success: false, error: 'Refund already completed', refund_id, txid: refund.txid }, { status: 400, headers: corsHeaders });
    }
    if (refund.refund_status !== 'pending') {
      return Response.json({ success: false, error: `Refund status is ${refund.refund_status}, expected pending` }, { status: 400, headers: corsHeaders });
    }

    console.log('📥 Processing refund:', {
      refund_id,
      order_id: refund.order_id,
      user_uid: refund.user_uid,
      amount: refund.amount
    });

    // ====================================================================
    // STEP 1: Create A2U Payment with Wallet Secret
    // ====================================================================
    
    const paymentRequestBody = {
      payment: {
        amount: parseFloat(refund.amount),
        memo: refund.memo || `Refund for order ${refund.order_id}`,
        metadata: JSON.parse(refund.metadata || '{}'),
        uid: refund.user_uid,
        app_wallet_secret: env.APP_WALLET_SECRET  // ✅ CRITICAL FIX!
      }
    };

    console.log('🔄 Creating A2U payment (Pi will auto-sign)...');

    const createResponse = await fetch('https://api.minepi.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentRequestBody)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ Pi API create error:', errorText);
      
      await env.DB.prepare(`
        UPDATE refunds 
        SET refund_status = 'failed',
            error_message = ?,
            retry_count = retry_count + 1
        WHERE refund_id = ?
      `).bind(`Create error: ${errorText}`, refund_id).run();
      
      throw new Error(`Pi API error: ${createResponse.status} - ${errorText}`);
    }

    const createData = await createResponse.json();
    const paymentIdentifier = createData.identifier;
    
    console.log('✅ Payment created:', paymentIdentifier);
    console.log('Payment status:', createData.status);

    // Update refund with payment_identifier
    await env.DB.prepare(`
      UPDATE refunds 
      SET payment_identifier = ?,
          refund_status = 'processing',
          initiated_at = unixepoch()
      WHERE refund_id = ?
    `).bind(paymentIdentifier, refund_id).run();

    // ====================================================================
    // STEP 2: Poll for Transaction Completion
    // ====================================================================
    
    console.log('⏳ Polling for transaction completion...');
    
    let txid = null;
    let completed = false;
    const MAX_ATTEMPTS = 20; // 20 seconds (Cloudflare Workers limit is ~30s)
    
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // Wait 1 second between polls
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(
        `https://api.minepi.com/v2/payments/${paymentIdentifier}`,
        {
          headers: {
            'Authorization': `Key ${env.PI_API_KEY}`
          }
        }
      );
      
      if (!statusResponse.ok) {
        console.warn(`⚠️ Poll ${attempt + 1}: Status check failed`);
        continue;
      }
      
      const statusData = await statusResponse.json();
      
      console.log(`🔍 Poll ${attempt + 1}/${MAX_ATTEMPTS}:`, {
        developer_approved: statusData.status?.developer_approved,
        transaction_verified: statusData.status?.transaction_verified,
        developer_completed: statusData.status?.developer_completed,
        has_transaction: !!statusData.transaction,
        txid: statusData.transaction?.txid
      });
      
      // Check if transaction is verified and has txid
      if (statusData.status?.transaction_verified && statusData.transaction?.txid) {
        txid = statusData.transaction.txid;
        completed = true;
        console.log('✅ Transaction verified! txid:', txid);
        break;
      }
      
      // Check if cancelled
      if (statusData.status?.cancelled) {
        throw new Error('Payment was cancelled by Pi Platform');
      }
    }

    // If not completed within timeout, return processing status
    if (!completed || !txid) {
      console.warn('⚠️ Transaction not completed within timeout');
      
      return Response.json({
        success: true,
        status: 'processing',
        refund_id,
        payment_identifier: paymentIdentifier,
        message: 'Payment created but blockchain transaction not yet confirmed. Check status later.',
        note: 'Use /api/refund/check to verify completion'
      }, { 
        headers: corsHeaders 
      });
    }

    // ====================================================================
    // STEP 3: Update Database with Completion
    // ====================================================================
    
    console.log('💾 Updating database...');
    
    await env.DB.prepare(`
      UPDATE refunds 
      SET txid = ?,
          refund_status = 'completed',
          completed_at = unixepoch()
      WHERE refund_id = ?
    `).bind(txid, refund_id).run();

    await env.DB.prepare(`
      UPDATE ceo_orders 
      SET has_refund = 1,
          refund_reason = ?,
          refunded_at = unixepoch()
      WHERE order_id = ?
    `).bind(refund.memo, refund.order_id).run();

    console.log('✅ Refund completed successfully!');

    return Response.json({
      success: true,
      refund_id,
      payment_identifier: paymentIdentifier,
      txid,
      status: 'completed',
      message: 'Refund processed and completed successfully!'
    }, { 
      headers: corsHeaders 
    });

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
