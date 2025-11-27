// ============================================================================
// FILE 2: functions/api/pi/cancel.js - NEW FILE
// ============================================================================

export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { payment_id, order_id } = body;

    console.log('📥 Cancel request:', { payment_id, order_id });

    if (!payment_id) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing payment_id' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find order by payment_id or order_id
    let order;
    if (order_id) {
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE order_id = ? AND pi_payment_id = ?'
      ).bind(order_id, payment_id).first();
    } else {
      order = await env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE pi_payment_id = ?'
      ).bind(payment_id).first();
    }

    if (!order) {
      console.log('⚠️ No order found with this payment_id');
      // Still return success - payment might be orphaned
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Payment cancelled (no associated order found)',
        payment_id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('✅ Order found:', order);

    // Update order status to Cancelled
    const updateResult = await env.DB.prepare(`
      UPDATE ceo_orders
      SET order_status = 'Cancelled',
          pi_payment_id = NULL,
          pi_txid = NULL
      WHERE order_id = ?
    `).bind(order.order_id).run();

    console.log('✅ Order cancelled:', updateResult);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Payment cancelled successfully',
      order_id: order.order_id,
      payment_id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('❌ Cancel error:', err);
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
