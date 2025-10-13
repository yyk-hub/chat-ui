export async function onRequestPost(context) {
  try {
    const data = await context.request.json();
    const db = context.env.DB; // D1 binding

    // Basic validation
    if (!data.order_id || !data.cus_name || !data.total_amt) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Insert into ceo_orders table
    await db
      .prepare(`INSERT INTO ceo_orders 
        (order_id, cus_name, cus_address, postcode, state_to, country, phone, prod_name, quantity, total_amt, shipping_wt, shipping_cost, pymt_method, pymt_status, courier_name, tracking_link)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        data.order_id,
        data.cus_name,
        data.cus_address,
        data.postcode,
        data.state_to,
        data.country,
        data.phone,
        data.prod_name,
        data.quantity,
        data.total_amt,
        data.shipping_wt,
        data.shipping_cost,
        data.pymt_method,
        data.pymt_status,
        data.courier_name,
        data.tracking_link
      )
      .run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Order error:", err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
      }
