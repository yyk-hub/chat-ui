// functions/api/admin/exchange-rate.js
// Admin API for managing Pi exchange rates

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT rate, updated_at FROM exchange_rate WHERE currency = 'PI' LIMIT 1"
    ).all();

    // No rate in DB → fallback
    if (!results || results.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          rate: 1.0,
          currency: 'PI',
          fallback: true,
          reason: 'no_rate_in_db'
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    // Normal case
    return new Response(
      JSON.stringify({
        success: true,
        rate: results[0].rate,
        currency: 'PI',
        updated_at: results[0].updated_at
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300"
        }
      }
    );

  } catch (error) {
    console.error('Exchange rate fetch error:', error);

    // DB error → fallback
    return new Response(
      JSON.stringify({
        success: false,
        rate: 1.0,
        currency: 'PI',
        fallback: true,
        reason: 'db_error'
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}
