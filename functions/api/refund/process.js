// functions/api/refund/process.js
// CORRECTED: Following official Pi API documentation for A2U payments

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
    // ✅ FIXED: Use correct request body format from Pi documentation
    // ====================================================================
    
    const paymentRequestBody = {
      payment: {  // ← CRITICAL: Wrap in "payment" object!
        amount: parseFloat(refund.amount),
        memo: refund.memo || `Refund for order ${refund.order_id}`,
        metadata: JSON.parse(refund.metadata || '{}'),
        uid: refund.user_uid
      }
    };

    console.log('🔄 Creating A2U payment on Pi Platform...');
    console.log('Request body:', JSON.stringify(paymentRequestBody, null, 2));

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
      
      // Update refund with error
      await env.DB.prepare(`
        UPDATE refunds 
        SET refund_status = 'failed',
            error_message = ?,
            retry_count = retry_count + 1
        WHERE refund_id = ?
      `).bind(`Pi API create error: ${errorText}`, refund_id).run();
      
      throw new Error(`Pi API create error: ${createResponse.status} - ${errorText}`);
    }

    const createData = await createResponse.json();
    
    console.log('✅ A2U payment created:', {
      payment_id: createData.identifier,
      user_uid: createData.user_uid,
      amount: createData.amount,
      status: createData.status
    });

    const paymentIdentifier = createData.identifier;

    // Update refund with payment_identifier
    await env.DB.prepare(`
      UPDATE refunds 
      SET payment_identifier = ?,
          refund_status = 'processing',
          initiated_at = unixepoch()
      WHERE refund_id = ?
    `).bind(paymentIdentifier, refund_id).run();

    // ====================================================================
    // STEP 2: Get payment status to check if it's completed
    // ====================================================================
    
    console.log('🔍 Checking payment status...');
    
    const statusResponse = await fetch(
      `https://api.minepi.com/v2/payments/${paymentIdentifier}`,
      {
        headers: {
          'Authorization': `Key ${env.PI_API_KEY}`
        }
      }
    );

    if (!statusResponse.ok) {
      console.error('⚠️ Failed to get payment status');
    } else {
      const statusData = await statusResponse.json();
      console.log('Payment status:', {
        identifier: statusData.identifier,
        developer_approved: statusData.status?.developer_approved,
        developer_completed: statusData.status?.developer_completed,
        transaction_verified: statusData.status?.transaction_verified,
        has_transaction: !!statusData.transaction
      });

      // If payment auto-completed by Pi Platform
      if (statusData.status?.developer_completed && statusData.transaction?.txid) {
        const txid = statusData.transaction.txid;
        
        console.log('✅ Payment auto-completed by Pi Platform, txid:', txid);
        
        // Update refund as completed
        await env.DB.prepare(`
          UPDATE refunds 
          SET txid = ?,
              refund_status = 'completed',
              completed_at = unixepoch()
          WHERE refund_id = ?
        `).bind(txid, refund_id).run();

        // Update order
        await env.DB.prepare(`
          UPDATE ceo_orders 
          SET has_refund = 1,
              refund_reason = ?,
              refunded_at = unixepoch()
          WHERE order_id = ?
        `).bind(refund.memo, refund.order_id).run();

        return Response.json({
          success: true,
          refund_id,
          payment_identifier: paymentIdentifier,
          txid,
          status: 'completed',
          message: 'Refund processed and completed successfully'
        }, { 
          headers: corsHeaders 
        });
      }
    }

    // Payment created but not yet completed
    return Response.json({
      success: true,
      refund_id,
      payment_identifier: paymentIdentifier,
      status: 'processing',
      message: 'A2U payment created. Pi Platform will process the transaction. Check back in a few moments.'
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
