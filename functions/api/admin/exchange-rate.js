// functions/api/admin/exchange-rate.js
// Admin API for managing Pi exchange rates - FINAL VERSION

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

// ✅ Authentication helper
function checkAuth(request, env) {
  const token = request.headers.get('x-admin-token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return false;
  }
  return true;
}

// ============================================
// GET: Get current exchange rate
// ============================================
export async function onRequestGet({ env, request }) {
  // ✅ Authenticate
  if (!checkAuth(request, env)) {
    return json({ success: false, error: 'Unauthorized' }, 403);
  }

  try {
    // ✅ Always get LATEST rate with ORDER BY
    const { results } = await env.DB.prepare(
      "SELECT rate, updated_at FROM exchange_rate WHERE currency = 'PI' ORDER BY updated_at DESC LIMIT 1"
    ).all();
    
    if (!results || results.length === 0) {
      return json({
        success: false,
        rate: 1.0,
        currency: "PI",
        fallback: true,
        error: "No rate found in database"
      });
    }
    
    return json({
      success: true,
      rate: results[0].rate,
      pi_per_myr: parseFloat((1 / results[0].rate).toFixed(8)),
      updated_at: results[0].updated_at
    });
  } catch (err) {
    console.error("GET exchange-rate error:", err);
    return json({ success: false, error: "Database error", details: err.message }, 500);
  }
}

// ============================================
// POST: Update rate or get history
// ============================================
export async function onRequestPost({ env, request }) {
  // ✅ Authenticate
  if (!checkAuth(request, env)) {
    return json({ success: false, error: 'Unauthorized' }, 403);
  }

  try {
    const body = await request.json();
    
    // ==========================
    // 📜 GET HISTORY
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
          pi_per_myr: parseFloat((1 / r.rate).toFixed(8)),
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
        return json({ success: false, error: "Invalid rate. Must be greater than 0." }, 400);
      }
      
      // Get old rate for logging
      const { results: oldResults } = await env.DB.prepare(
        "SELECT rate FROM exchange_rate WHERE currency = 'PI' ORDER BY updated_at DESC LIMIT 1"
      ).all();
      const oldRate = oldResults[0]?.rate;
      
      // ✅ INSERT new rate (keeps history, doesn't overwrite)
      await env.DB.prepare(
        "INSERT INTO exchange_rate (currency, rate) VALUES ('PI', ?)"
      ).bind(rate).run();
      
      console.log(`💱 Exchange rate updated: ${oldRate} → ${rate}`);
      
      return json({
        success: true,
        message: `Exchange rate updated to ${rate} MYR per Pi`,
        old_rate: oldRate,
        new_rate: rate
      });
    }
    
    return json({ success: false, error: "Invalid action. Use 'update' or 'history'." }, 400);
    
  } catch (err) {
    console.error("POST exchange-rate error:", err);
    return json({ success: false, error: "Server error", details: err.message }, 500);
  }
}

// ============================================
// OPTIONS: CORS preflight
// ============================================
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-token"
    }
  });
}
