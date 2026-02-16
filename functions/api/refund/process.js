// functions/api/refund/process.js
import { Keypair, TransactionBuilder, Operation, Asset, Server, Memo } from '@stellar/stellar-sdk';

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
      return Response.json({ success: false, error: 'Already completed' }, { status: 400, headers: corsHeaders });
    }
    if (refund.refund_status !== 'pending') {
      return Response.json({ success: false, error: `Status is ${refund.refund_status}` }, { status: 400, headers: corsHeaders });
    }

    console.log('📥 Processing refund:', refund_id);

    // Step 1: Create Payment
    const paymentBody = {
      payment: {
        amount: parseFloat(refund.amount),
        memo: refund.memo || `Refund for order ${refund.order_id}`,
        metadata: JSON.parse(refund.metadata || '{}'),
        uid: refund.user_uid
      }
    };

    const createResponse = await fetch('https://api.minepi.com/v2/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(paymentBody)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      await env.DB.prepare(`UPDATE refunds SET refund_status='failed', error_message=? WHERE refund_id=?`)
        .bind(errorText, refund_id).run();
      throw new Error(`Pi API error: ${errorText}`);
    }

    const paymentData = await createResponse.json();
    const paymentIdentifier = paymentData.identifier;
    const recipientAddress = paymentData.to_address;

    await env.DB.prepare(`UPDATE refunds SET payment_identifier=?, refund_status='processing', initiated_at=unixepoch() WHERE refund_id=?`)
      .bind(paymentIdentifier, refund_id).run();

    // Step 2-6: Build, Sign, Submit Transaction
    const isTestnet = env.PI_NETWORK === 'testnet';
    const horizonUrl = isTestnet ? 'https://api.testnet.minepi.com' : 'https://api.mainnet.minepi.com';
    const networkPassphrase = isTestnet ? 'Pi Testnet' : 'Pi Network';

    const server = new Server(horizonUrl);
    const sourceKeypair = Keypair.fromSecret(env.APP_WALLET_SECRET);
    const sourcePublicKey = sourceKeypair.publicKey();

    const account = await server.loadAccount(sourcePublicKey);
    const baseFee = await server.fetchBaseFee();

    const transaction = new TransactionBuilder(account, {
      fee: baseFee.toString(),
      networkPassphrase: networkPassphrase
    })
      .addOperation(Operation.payment({
        destination: recipientAddress,
        asset: Asset.native(),
        amount: refund.amount.toString()
      }))
      .addMemo(Memo.text(paymentIdentifier))
      .setTimeout(180)
      .build();

    transaction.sign(sourceKeypair);

    const submitResult = await server.submitTransaction(transaction);
    const txid = submitResult.hash;

    // Step 7: Complete Payment
    await fetch(`https://api.minepi.com/v2/payments/${paymentIdentifier}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${env.PI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txid })
    });

    // Step 8: Update Database
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
      message: 'Refund completed successfully!'
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Error:', error);
    
    try {
      await env.DB.prepare(`UPDATE refunds SET refund_status='failed', error_message=? WHERE refund_id=?`)
        .bind(error.message, body?.refund_id).run();
    } catch (e) {}

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
