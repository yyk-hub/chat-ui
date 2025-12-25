// functions/api/admin/exchange-rate.js
// Admin API for managing Pi exchange rates

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestGet({ env, request }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT rate, updated_at FROM exchange_rate WHERE currency = 'PI' LIMIT 1"
    ).all();

    if (!results || results.length === 0) {
      return json({
        success: false,
        rate: 1.0,
        currency: "PI",
        fallback: true
      });
    }

    return json({
      success: true,
      rate: results[0].rate,
      pi_per_myr: (1 / results[0].rate).toFixed(8),
      updated_at: results[0].updated_at
    });

  } catch (err) {
    console.error("GET exchange-rate error:", err);
    return json({ success: false, error: "db_error" });
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const body = await request.json();

    // ==========================
    // 📜 HISTORY
    // ==========================
    if (body.action === "history") {
      const { results } = await env.DB.prepare(
        `SELECT rate, updated_at
         FROM exchange_rate
         WHERE currency = 'PI'
         ORDER BY updated_at DESC
         LIMIT 20`
      ).all();

      return json({
        success: true,
        history: results.map(r => ({
          rate: r.rate,
          pi_per_myr: (1 / r.rate).toFixed(8),
          updated_at: r.updated_at
        }))
      });
    }

    // ==========================
    // 💾 UPDATE RATE
    // ==========================
    if (body.action === "update") {
      const rate = Number(body.rate);
      if (!rate || rate <= 0) {
        return json({ success: false, error: "invalid_rate" }, 400);
      }

      // SQLite UNIQUE(currency) → UPDATE, NOT INSERT
      await env.DB.prepare(
        `UPDATE exchange_rate
         SET rate = ?, updated_at = CURRENT_TIMESTAMP
         WHERE currency = 'PI'`
      ).bind(rate).run();

      return json({
        success: true,
        message: "Exchange rate updated",
        new_rate: rate
      });
    }

    return json({ success: false, error: "unknown_action" }, 400);

  } catch (err) {
    console.error("POST exchange-rate error:", err);
    return json({ success: false, error: "server_error" }, 500);
  }
}
