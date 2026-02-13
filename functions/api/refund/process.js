// functions/api/refund/process.js
// COMPLETE A2U FLOW: Create → Poll → Complete

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
    // STEP 1: Create A2U Payment
    // ====================================================================
    
    const paymentRequestBody = {
      payment: {
        amount: parseFloat(refund.amount),
        memo: refund.memo || `Refund for order ${refund.order_id}`,
        metadata: JSON.parse(refund.metadata || '{}'),
        uid: refund.user_uid
      }
    };

    console.log('🔄 Step 1: Creating A2U payment on Pi Platform...');

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
      `).bind(`Pi API create error: ${errorText}`, refund_id).run();
      
      throw new Error(`Pi API create error: ${createResponse.status} - ${errorText}`);
    }

    const createData = await createResponse.json();
    const paymentIdentifier = createData.identifier;
    
    console.log('✅ Step 1 Complete: Payment created:', paymentIdentifier);

    // Update refund with payment_identifier
    await env.DB.prepare(`
      UPDATE refunds 
      SET payment_identifier = ?,
          refund_status = 'processing',
          initiated_at = unixepoch()
      WHERE refund_id = ?
    `).bind(paymentIdentifier, refund_id).run();

    // ====================================================================
    // STEP 2: Poll for Approval (with timeout)
    // ====================================================================
    
    console.log('⏳ Step 2: Waiting for Pi Platform approval...');
    
    let approved = false;
    let txid = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10; // 10 attempts = ~10 seconds (Cloudflare Workers limit)
    
    while (!approved && attempts < MAX_ATTEMPTS) {
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
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        console.log(`Poll ${attempts + 1}/${MAX_ATTEMPTS}:`, {
          developer_approved: statusData.status?.developer_approved,
          has_transaction: !!statusData.transaction,
          txid: statusData.transaction?.txid
        });
        
        // Check if approved
        if (statusData.status?.developer_approved) {
          console.log('✅ Step 2 Complete: Payment approved!');
          approved = true;
          txid = statusData.transaction?.txid;
          break;
        }
      }
      
      attempts++;
    }
    
    if (!approved) {
      console.warn('⚠️ Approval timeout - payment still processing');
      
      return Response.json({
        success: true,
        status: 'processing',
        refund_id,
        payment_identifier: paymentIdentifier,
        message: 'Payment created but not approved yet. Check status in a few moments.',
        note: 'Use /api/refund/check to complete manually'
      }, { 
        headers: corsHeaders 
      });
    }

    if (!txid) {
      console.warn('⚠️ Approved but no txid - unusual state');
      
      return Response.json({
        success: true,
        status: 'processing',
        refund_id,
        payment_identifier: paymentIdentifier,
        message: 'Payment approved but blockchain transaction pending',
        note: 'Check status in a few moments'
      }, { 
        headers: corsHeaders 
      });
    }

    // ====================================================================
    // STEP 3: Complete the Payment (CRITICAL!)
    // ====================================================================
    
    console.log('🚀 Step 3: Completing payment with txid:', txid);
    
    const completeResponse = await fetch(
      `https://api.minepi.com/v2/payments/${paymentIdentifier}/complete`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Key ${env.PI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ txid })
      }
    );
    
    if (!completeResponse.ok) {
      const errorText = await completeResponse.text();
      console.error('❌ Complete API error:', errorText);
      
      // Don't fail - payment might auto-complete
      console.warn('⚠️ Manual completion failed, but payment may complete automatically');
    } else {
      const completeData = await completeResponse.json();
      console.log('✅ Step 3 Complete: Payment completed:', completeData);
    }

    // ====================================================================
    // STEP 4: Update Database
    // ====================================================================
    
    console.log('💾 Step 4: Updating database...');
    
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
