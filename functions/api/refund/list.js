// functions/api/refund/list.js
// FIXED: Proper parameter binding for D1

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  try {
    // Auth check
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

    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'all';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    // ✅ FIXED: Build query with proper binding
    let query;
    let stmt;
    
    if (status !== 'all') {
      // Query WITH status filter
      query = `
        SELECT 
          r.*,
          o.cus_name,
          o.prod_name,
          o.total_amt,
          o.phone
        FROM refunds r
        JOIN ceo_orders o ON r.order_id = o.order_id
        WHERE r.refund_status = ?
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;
      stmt = env.DB.prepare(query).bind(status, limit, offset);
    } else {
      // Query WITHOUT status filter
      query = `
        SELECT 
          r.*,
          o.cus_name,
          o.prod_name,
          o.total_amt,
          o.phone
        FROM refunds r
        JOIN ceo_orders o ON r.order_id = o.order_id
        ORDER BY r.created_at DESC
        LIMIT ? OFFSET ?
      `;
      stmt = env.DB.prepare(query).bind(limit, offset);
    }

    const result = await stmt.all();
    const refunds = result.results || [];

    // Get total count
    let countQuery;
    let countStmt;
    
    if (status !== 'all') {
      countQuery = `SELECT COUNT(*) as total FROM refunds WHERE refund_status = ?`;
      countStmt = env.DB.prepare(countQuery).bind(status);
    } else {
      countQuery = `SELECT COUNT(*) as total FROM refunds`;
      countStmt = env.DB.prepare(countQuery);
    }

    const countResult = await countStmt.first();
    const totalCount = countResult?.total || 0;

    // Format refunds
    const formattedRefunds = refunds.map(r => ({
      refund_id: r.refund_id,
      order_id: r.order_id,
      customer_name: r.cus_name,
      product: r.prod_name,
      amount_pi: parseFloat(r.amount),
      amount_rm: r.amount_rm,
      refund_status: r.refund_status,
      created_at: r.created_at,
      completed_at: r.completed_at,
      payment_identifier: r.payment_identifier,
      txid: r.txid,
      error_message: r.error_message,
      processed_by: r.processed_by
    }));

    return Response.json({
      success: true,
      refunds: formattedRefunds,
      count: formattedRefunds.length,
      total: totalCount,
      limit,
      offset,
      filter: status
    }, { 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('❌ List refunds error:', error);
    
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
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    },
  });
}
