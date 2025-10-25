export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const order = await request.json();

    // Validate required fields
    if (!order.order_id || !order.cus_name || !order.prod_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert into D1
    await env.DB.prepare(`
      INSERT INTO ceo_orders (
        order_id, cus_name, cus_address, postcode, state_to, country, phone,
        prod_name, quantity, total_amt, shipping_wt,
        state_from, shipping_method, shipping_cost, delivery_eta,
        pymt_method, order_status, courier_name, tracking_link
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      order.order_id,
      order.cus_name,
      order.cus_address,
      order.postcode,
      order.state_to,
      order.country || 'Malaysia',
      order.phone,
      order.prod_name,
      order.quantity || 1,
      order.total_amt,
      order.shipping_wt || 1,
      order.state_from || 'Sabah',
      order.shipping_method || 'Standard Courier',
      order.shipping_cost || 0,
      order.delivery_eta || '1–4 days',
      order.pymt_method || 'FPX',
      order.order_status || 'Pending Payment',
      order.courier_name || 'City-Link',
      order.tracking_link || ''
    ).run();

    return new Response(
      JSON.stringify({ success: true, order_id: order.order_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Order save error:', err.stack || err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestGet(context) {
  const { env, request } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const url = new URL(request.url);
    const phone = url.searchParams.get('phone');
    let query;

    if (phone) {
      query = env.DB.prepare(
        'SELECT * FROM ceo_orders WHERE phone = ? ORDER BY created_at DESC'
      ).bind(phone);
    } else {
      query = env.DB.prepare(
        'SELECT * FROM ceo_orders ORDER BY created_at DESC LIMIT 10'
      );
    }

    const { results } = await query.all();
    return new Response(JSON.stringify(results), { headers: corsHeaders });

  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
                                    }
