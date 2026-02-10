// functions/api/refund/create.js
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
    const { order_id, amount_rm, reason, admin_id } = body;

    console.log('📥 Create refund request:', { order_id, amount_rm, reason });

    // Validate input
    if (!order_id || !amount_rm || !reason) {
      return Response.json({
        success: false,
        error: 'Missing required fields: order_id, amount_rm, reason'
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Get order details
    const order = await env.DB.prepare(
      'SELECT * FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).first();

    if (!order) {
      return Response.json({
        success: false,
        error: 'Order not found'
      }, { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // CRITICAL: Check if order has user_uid
    if (!order.user_uid) {
      return Response.json({
        success: false,
        error: 'Cannot refund this order. Order missing user_uid (placed before U2A update). Only orders with Pi payments can be refunded.'
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Validate refund amount
    if (amount_rm <= 0) {
      return Response.json({
        success: false,
        error: 'Refund amount must be greater than 0'
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    if (amount_rm > order.total_amt) {
      return Response.json({
        success: false,
        error: `Refund amount (RM ${amount_rm}) exceeds order total (RM ${order.total_amt})`
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Check if order already has a refund
    const existingRefund = await env.DB.prepare(
      "SELECT * FROM refunds WHERE order_id = ? AND refund_status != 'cancelled'"
    ).bind(order_id).first();

    if (existingRefund) {
      return Response.json({
        success: false,
        error: `Order already has a ${existingRefund.refund_status} refund (${existingRefund.refund_id})`
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Get current exchange rate
    let exchangeRate = 1.0;
    try {
      const rateResult = await env.DB.prepare(
        "SELECT rate FROM exchange_rates WHERE currency = 'MYR' ORDER BY updated_at DESC LIMIT 1"
      ).first();
      if (rateResult?.rate) {
        exchangeRate = rateResult.rate;
      }
    } catch (err) {
      console.warn('⚠️ Failed to load exchange rate, using 1.0:', err.message);
    }

    const amountPi = (amount_rm / exchangeRate).toFixed(8);

    // Create refund record
    const refund_id = `REF_${Date.now()}`;
    const metadata = JSON.stringify({
      orderId: order_id,
      customerName: order.cus_name,
      adminId: admin_id || 'admin',
      originalAmount: order.total_amt,
      reason: reason,
      createdAt: new Date().toISOString()
    });

    await env.DB.prepare(`
      INSERT INTO refunds (
        refund_id, order_id, user_uid, amount, amount_rm, 
        exchange_rate, memo, metadata, refund_status, processed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).bind(
      refund_id,
      order_id,
      order.user_uid,
      parseFloat(amountPi),
      amount_rm,
      exchangeRate,
      reason,
      metadata,
      admin_id || 'admin'
    ).run();

    console.log('✅ Refund created:', {
      refund_id,
      order_id,
      amount_pi: parseFloat(amountPi),
      amount_rm,
      user_uid: order.user_uid
    });

    return Response.json({
      success: true,
      refund_id,
      order_id,
      amount_pi: parseFloat(amountPi),
      amount_rm,
      exchange_rate: exchangeRate,
      user_uid: order.user_uid,
      status: 'pending'
    }, { 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('❌ Create refund error:', error);
    
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
