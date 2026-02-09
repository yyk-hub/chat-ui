// functions/api/refund/status.js
// Get refund status and details

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  try {
    const url = new URL(request.url);
    const refund_id = url.searchParams.get('refund_id');

    if (!refund_id) {
      return Response.json({
        success: false,
        error: 'Missing refund_id parameter'
      }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Get refund with order details
    const refund = await env.DB.prepare(`
      SELECT 
        r.*,
        o.cus_name,
        o.prod_name,
        o.total_amt,
        o.order_status
      FROM refunds r
      JOIN ceo_orders o ON r.order_id = o.order_id
      WHERE r.refund_id = ?
    `).bind(refund_id).first();

    if (!refund) {
      return Response.json({
        success: false,
        error: 'Refund not found'
      }, { 
        status: 404, 
        headers: corsHeaders 
      });
    }

    // Format response
    return Response.json({
      success: true,
      refund: {
        refund_id: refund.refund_id,
        order_id: refund.order_id,
        user_uid: refund.user_uid,
        
        // Amounts
        amount_pi: parseFloat(refund.amount),
        amount_rm: refund.amount_rm,
        exchange_rate: refund.exchange_rate,
        
        // Details
        memo: refund.memo,
        metadata: refund.metadata ? JSON.parse(refund.metadata) : {},
        
        // Payment info
        payment_identifier: refund.payment_identifier,
        recipient_address: refund.recipient_address,
        txid: refund.txid,
        
        // Status
        refund_status: refund.refund_status,
        error_message: refund.error_message,
        retry_count: refund.retry_count,
        
        // Timestamps
        created_at: refund.created_at,
        initiated_at: refund.initiated_at,
        completed_at: refund.completed_at,
        
        // Order info
        order: {
          customer_name: refund.cus_name,
          product: refund.prod_name,
          order_total: refund.total_amt,
          order_status: refund.order_status
        },
        
        // Admin
        processed_by: refund.processed_by
      }
    }, { 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('❌ Get refund status error:', error);
    
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
