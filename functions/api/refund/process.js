// functions/api/refund/process.js
// Correct A2U Refund Flow: Create → Approve → Complete → Poll

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

    // Step 1: Create payment
    const paymentRequestBody = {
      payment: {
        amount: parseFloat(refund.amount),
        memo: refund.memo || `Refund for order ${refund.order_id}`,
        metadata: JSON.parse(refund.metadata || '{}'),
        uid: refund.user_uid
      }
    };

    const createResponse = await fetch('https://api.minepi.com/v2/payments', {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.PI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentRequestBody)
    });
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      await env.DB.prepare(`UPDATE refunds SET refund_status='failed', error_message=?, retry_count=retry_count+1 WHERE refund_id=?`)
        .bind(errorText, refund_id).run();
      throw new Error(`Pi API create error: ${errorText}`);
    }
    const createData = await createResponse.json();
    const paymentIdentifier = createData.identifier;

    await env.DB.prepare(`UPDATE refunds SET payment_identifier=?, refund_status='processing', initiated_at=unixepoch() WHERE refund_id=?`)
      .bind(paymentIdentifier, refund_id).run();

    // Step 2: Approve payment
    await fetch(`https://api.minepi.com/v2/payments/${paymentIdentifier}/approve`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.PI_API_KEY}` }
    });

    // Step 3: Complete payment
    await fetch(`https://api.minepi.com/v2/payments/${paymentIdentifier}/complete`, {
      method: 'POST',
      headers: { 'Authorization': `Key ${env.PI_API_KEY}` }
    });

    // Step 4: Poll until transaction_verified
    let txid = null;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const statusResponse = await fetch(`https://api.minepi.com/v2/payments/${paymentIdentifier}`, {
        headers: { 'Authorization': `Key ${env.PI_API_KEY}` }
      });
      if (!statusResponse.ok) continue;
      const statusData = await statusResponse.json();

      if (statusData.developer_completed && statusData.transaction_verified && statusData.transaction?.txid) {
        txid = statusData.transaction.txid;
        break;
      }
    }

    if (!txid) {
      return Response.json({
        success: true,
        refund_id,
        payment_identifier: paymentIdentifier,
        status: 'processing',
        message: 'Refund initiated but blockchain transaction not yet confirmed. Poll again later.'
      }, { headers: corsHeaders });
    }

    // Step 5: Update DB
    await env.DB.prepare(`UPDATE refunds SET txid=?, refund_status='completed', completed_at=unixepoch() WHERE refund_id=?`)
      .bind(txid, refund_id).run();
    await env.DB.prepare(`UPDATE ceo_orders SET has_refund=1, refund_reason=?, refunded_at=unixepoch() WHERE order_id=?`)
      .bind(refund.memo, refund.order_id).run();

    return Response.json({
      success: true,
      refund_id,
      payment_identifier: paymentIdentifier,
      txid,
      status: 'completed',
      message: 'Refund processed and completed successfully!'
    }, { headers: corsHeaders });

  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500, headers: corsHeaders });
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
