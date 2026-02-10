// functions/api/refund/list.js
// FIXED: Use x-admin-token instead of Bearer token

export async function onRequestGet(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  try {
    // ✅ FIXED: Use x-admin-token (matches your other admin endpoints)
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

    // Build query
    let query = `
      SELECT 
        r.*,
        o.cus_name,
        o.prod_name,
        o.total_amt,
        o.phone
      FROM refunds r
      JOIN ceo_orders o ON r.order_id = o.order_id
    `;

    const params = [];

    // Filter by status
    if (status !== 'all') {
      query += ` WHERE r.refund_status = ?`;
      params.push(status);
    }

    // Order by most recent first
    query += ` ORDER BY r.created_at DESC`;

    // Pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    // Execute query
    let stmt = env.DB.prepare(query);
    params.forEach(param => {
      stmt = stmt.bind(param);
    });

    const result = await stmt.all();
    const refunds = result.results || [];

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM refunds`;
    if (status !== 'all') {
      countQuery += ` WHERE refund_status = ?`;
    }

    let countStmt = env.DB.prepare(countQuery);
    if (status !== 'all') {
      countStmt = countStmt.bind(status);
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
