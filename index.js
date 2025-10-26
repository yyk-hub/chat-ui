```javascript
export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/api/orders') {
      // GET: Fetch orders by phone number
      if (request.method === 'GET') {
        const phone = url.searchParams.get('phone');
        if (!phone) {
          return new Response(JSON.stringify({ error: 'Phone number required' }), {
            status: 400,
            headers: corsHeaders
          });
        }

        try {
          const { results } = await env.DB.prepare(
            `SELECT order_id, prod_name, total_amt, courier_name, tracking_link, order_status, created_at
             FROM ceo_orders WHERE phone = ?`
          ).bind(phone).all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // POST: Create a new order
      if (request.method === 'POST') {
        try {
          const order = await request.json();
          const {
            order_id = 'ORD' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            cus_name = '',
            cus_address = '',
            postcode = '',
            state_to = '',
            country = '',
            phone = '',
            prod_name = '',
            quantity = 0,
            total_amt = 0,
            shipping_wt = 0,
            state_from = '',
            shipping_method = '',
            shipping_cost = 0,
            delivery_eta = '',
            pymt_method = '',
            order_status = 'Pending Payment',
            courier_name = '',
            tracking_link = '',
            created_at = new Date().toISOString()
          } = order;

          await env.DB.prepare(
            `INSERT INTO ceo_orders (
              order_id, cus_name, cus_address, postcode, state_to, country, phone,
              prod_name, quantity, total_amt, shipping_wt, state_from, shipping_method,
              shipping_cost, delivery_eta, pymt_method, order_status, courier_name,
              tracking_link, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            order_id,
            cus_name,
            cus_address,
            postcode,
            state_to,
            country,
            phone,
            prod_name,
            quantity,
            total_amt,
            shipping_wt,
            state_from,
            shipping_method,
            shipping_cost,
            delivery_eta,
            pymt_method,
            order_status,
            courier_name,
            tracking_link,
            created_at
          ).run();

          return new Response(JSON.stringify({ success: true, order_id }), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }

      // PATCH: Update an existing order
      if (request.method === 'PATCH') {
        try {
          const { order_id, shipping_method, courier_name, shipping_cost, total_amt } = await request.json();
          if (!order_id) {
            return new Response(JSON.stringify({ error: 'Missing order_id' }), {
              status: 400,
              headers: corsHeaders
            });
          }

          // Validate if order exists
          const { results } = await env.DB.prepare(
            `SELECT order_id FROM ceo_orders WHERE order_id = ?`
          ).bind(order_id).all();

          if (!results || results.length === 0) {
            return new Response(JSON.stringify({ error: 'Order not found' }), {
              status: 404,
              headers: corsHeaders
            });
          }

          await env.DB.prepare(
            `UPDATE ceo_orders
             SET shipping_method = ?, courier_name = ?, shipping_cost = ?, total_amt = ?, created_at = ?
             WHERE order_id = ?`
          ).bind(
            shipping_method || '',
            courier_name || '',
            shipping_cost || 0,
            total_amt || 0,
            new Date().toISOString(),
            order_id
          ).run();

          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: corsHeaders
          });
        }
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: corsHeaders
    });
  }
};
