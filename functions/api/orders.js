// === FINAL: functions/api/orders.js ===
export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const order = await request.json();
    if (!order.order_id || !order.cus_name || !order.prod_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    await env.DB.prepare(`
      INSERT INTO ceo_orders (
        order_id, cus_name, cus_address, postcode, state_to, country, phone,
        prod_name, quantity, total_amt, shipping_wt,
        state_from, shipping_method, shipping_cost, delivery_eta,
        pymt_method, order_status, courier_name, tracking_link
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
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

export async function onRequestPut(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    const { order_id } = context.params;
    const updates = await request.json();
    if (!order_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // === 1. Fetch current order for recalculation ===
    const { results: [order] } = await env.DB.prepare(
      'SELECT total_amt, shipping_wt, state_to, shipping_method FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).all();
    if (!order) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    // === 2. Apply customer updates (safe defaults) ===
    const newState = updates.state_to ?? order.state_to;
    const newMethod = updates.shipping_method ?? order.shipping_method;
    // === 3. Recalculate shipping cost ===
    const subTotal = parseFloat(order.total_amt); // total_amt = subTotal + old shipping
    const weight = parseFloat(order.shipping_wt) || 1;
    const shipping = calculateShippingCost(subTotal, newState, weight, newMethod);
    updates.shipping_cost = shipping.cost; // Backend enforces correct cost
    // === 4. Build update query ===
    const fields = [];
    const values = [];
    const allowed = ['cus_name', 'cus_address', 'postcode', 'state_to', 'shipping_method', 'shipping_cost'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }
    if (fields.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid updates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    values.push(order_id);
    const query = `UPDATE ceo_orders SET ${fields.join(', ')} WHERE order_id = ?`;
    const result = await env.DB.prepare(query).bind(...values).run();
    if (result.changes === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true, message: 'Order updated' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('PUT error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}

// === SHIPPING CALCULATION (Same as frontend) ===
function calculateShippingCost(subTotal, state, weight, method) {
  const isSabah = state === "Sabah";
  const isPickup = method === "pickup" || method.includes("Pickup");
  if (subTotal >= 500 && !isPickup) {
    return { cost: 0, note: "Express Free Shipping" };
  }
  if (isPickup) {
    return { cost: 0, note: "Self Pickup" };
  }
  const cost = 10; // Flat RM10
  return { cost, note: `Standard Courier (${isSabah ? 'Sabah' : 'Other'})` };
}
