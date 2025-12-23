// ============================================
// STEP 2: Create API Endpoint
// File: functions/api/exchange-rate.js
// ============================================

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT rate FROM exchange_rate WHERE currency = 'PI' ORDER BY updated_at DESC LIMIT 1"
    ).all();
    
    if (results && results.length > 0) {
      return new Response(
        JSON.stringify({ 
          rate: results[0].rate,
          currency: 'PI',
          updated_at: new Date().toISOString()
        }),
        { 
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=300" // Cache for 5 minutes
          } 
        }
      );
    } else {
      // No rate found, return fallback
      return new Response(
        JSON.stringify({ rate: 1.0, fallback: true }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error('Exchange rate fetch error:', error);
    // Return fallback on error
    return new Response(
      JSON.stringify({ rate: 1.0, fallback: true, error: error.message }),
      { 
        status: 200, // Return 200 so frontend doesn't break
        headers: { "Content-Type": "application/json" } 
      }
    );
  }
}


