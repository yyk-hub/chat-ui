// ===== Shipping Cost Calculator =====
function calculateShipping(state, weight) {
  const sabahRates = [10, 11, 12, 13, 15];
  const otherRates = [20, 27, 35, 44, 52];
  const kg = Math.ceil(weight);
  const index = Math.min(kg, 5) - 1;
  if (state === "Sabah") return sabahRates[index];
  return otherRates[index];
}

// ===== Handle POST: Create Order =====
export async function onRequestPost(context) {
  const { request, env } = context;
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const order = await request.json();
    
    // Validate
    if (!order.order_id || !order.cus_name || !order.prod_name) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
// 🟢 Step 1: Lookup product weight from ceo_products
    const prodQuery = await env.DB.prepare(
      `SELECT weight FROM ceo_products WHERE prod_name = ?`
    ).bind(order.prod_name).first();

    const weight = prodQuery ? prodQuery.weight : (order.shipping_wt || 1);

    // 🟢 Step 2: Calculate shipping cost
    const shippingCost = calculateShipping(order.state_to || 'Sabah', weight);

    // 🟢 Step 3: Default ETA
    const deliveryETA = order.delivery_eta || '3 working days';
    
    // Insert into D1
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
      order.shipping_wt,
      order.state_from || 'Sabah',
      order.shipping_method || 'Pos Laju',
      order.shipping_cost || 0,
      order.delivery_eta || '3 working days',
      order.pymt_method,
      order.pymt_status,
      order.courier_name || 'Pos Laju',
      order.tracking_link
    ).run();

    return new Response(
      JSON.stringify({ success: true, order_id: order.order_id }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (err) {
    console.error('Order save error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
}

// Handle GET requests (retrieve orders)
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

// Handle OPTIONS (CORS preflight)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
      }
