// functions/api/products.js

export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 🟢 GET — fetch all products
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        'SELECT * FROM ceo_products ORDER BY created_at DESC'
      ).all();
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 🟢 POST — update product details
    if (request.method === 'POST') {
      const data = await request.json();

      if (!data.prod_id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing product ID' }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      // Admin authentication 
const ADMIN_TOKEN = env.ADMIN_TOKEN || "changeme123";

// Inside POST request block, before running the update query:
const authHeader = request.headers.get("Authorization");
if (!authHeader || authHeader !== `Bearer ${ADMIN_TOKEN}`) {
  return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
    status: 401,
    headers: corsHeaders,
  });
}

      // Build update query dynamically
      const fields = [];
      const values = [];

      if (data.price !== undefined) {
        fields.push('price = ?');
        values.push(data.price);
      }
      if (data.stock !== undefined) {
        fields.push('stock = ?');
        values.push(data.stock);
      }
      if (data.description !== undefined) {
        fields.push('description = ?');
        values.push(data.description);
      }
      if (data.image_url !== undefined) {
        fields.push('image_url = ?');
        values.push(data.image_url);
      }

      if (fields.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No update fields provided' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const query = `UPDATE ceo_products SET ${fields.join(', ')} WHERE prod_id = ?`;
      values.push(data.prod_id);

      await env.DB.prepare(query).bind(...values).run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: corsHeaders,
    });
  } catch (err) {
    console.error('Product API error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
  }
