// functions/api/orders.js
export async function onRequestPost(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  try {
    let order;
    try {
      order = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    let query;
    let params = [];

    if (phone) {
      query = `SELECT * FROM ceo_orders WHERE phone = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [phone, limit, offset];
    } else {
      query = `SELECT * FROM ceo_orders ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params = [limit, offset];
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return new Response(JSON.stringify(results), { headers: corsHeaders });

  } catch (err) {
    console.error('GET error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  };
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    // parse order_id from URL path as Cloudflare Pages single-file functions don't populate context.params
    const url = new URL(request.url);
    // expected path like /api/orders/ORD12345
    const pathParts = url.pathname.split('/').filter(Boolean);
    const last = pathParts[pathParts.length - 1] || '';
    // if last part is "orders" (no id), try query param
    const order_id = (last && last.toLowerCase() !== 'orders') ? last : url.searchParams.get('order_id');

    // parse body with safe handling
    let updates;
    try {
      updates = await request.json();
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!order_id) {
      return new Response(JSON.stringify({ success: false, error: 'Missing order_id in URL or query' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // === 1. Fetch current order for recalculation (include shipping_cost) ===
    const { results } = await env.DB.prepare(
      'SELECT total_amt, shipping_wt, state_to, shipping_method, shipping_cost FROM ceo_orders WHERE order_id = ?'
    ).bind(order_id).all();

    const order = results && results[0];
    if (!order) {
      return new Response(JSON.stringify({ success: false, error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // === 2. Compute subtotal (assume total_amt includes shipping_cost)
    const oldTotal = parseFloat(order.total_amt) || 0;
    const oldShipping = parseFloat(order.shipping_cost) || 0;
    const subTotal = Math.max(0, oldTotal - oldShipping);

    // === 3. Apply customer/admin updates (safe defaults) ===
    const newState = updates.state_to ?? order.state_to;
    const newMethod = updates.shipping_method ?? order.shipping_method;

    // === 4. Recalculate shipping cost if relevant ===
    const weight = parseFloat(order.shipping_wt) || 1;
    const shippingCalc = calculateShippingCost(subTotal, newState, weight, newMethod);
    // enforce backend shipping cost
    updates.shipping_cost = shippingCalc.cost;

    // === 5. Build update query; allow admin updates including order_status & tracking_link & courier_name ===
    const fields = [];
    const values = [];
    const allowed = ['cus_name', 'cus_address', 'postcode', 'state_to', 'shipping_method', 'shipping_cost', 'order_status', 'tracking_link', 'courier_name'];

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(updates[key]);
      }
    }

    if (fields.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No valid updates provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    values.push(order_id);
    const query = `UPDATE ceo_orders SET ${fields.join(', ')} WHERE order_id = ?`;
    const result = await env.DB.prepare(query).bind(...values).run();

    // D1 returns .changes in result sometimes; treat 0 as no-op
    if (!result || result.changes === 0) {
      // still treat as success if query ran but nothing changed (avoid false negatives)
      // but return success: true with info
      return new Response(JSON.stringify({ success: true, message: 'No rows changed (either same data or update applied previously)' }), {
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
  const isPickup = (method || '').toLowerCase().includes("pickup");
  if ((parseFloat(subTotal) || 0) >= 500 && !isPickup) {
    return { cost: 0, note: "Express Free Shipping" };
  }
  if (isPickup) {
    return { cost: 0, note: "Self Pickup" };
  }
  const cost = 10; // Flat RM10
  return { cost, note: `Standard Courier (${isSabah ? 'Sabah' : 'Other'})` };
}
