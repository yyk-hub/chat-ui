// functions/api/refund/cleanup.js
// Clean up stuck A2U payments on Pi Platform

export async function onRequestPost(context) {
  const { request, env } = context;
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
  };

  try {
    const adminToken = request.headers.get('x-admin-token');
    if (!adminToken || adminToken !== env.ADMIN_TOKEN) {
      return Response.json({ 
        success: false, 
        error: 'Unauthorized' 
      }, { 
        status: 403, 
        headers: corsHeaders 
      });
    }

    console.log('🧹 Checking for stuck A2U payments...');

    // Get incomplete server payments from Pi Platform
    const incompleteResponse = await fetch(
      'https://api.minepi.com/v2/payments/incomplete_server_payments',
      {
        headers: {
          'Authorization': `Key ${env.PI_API_KEY}`
        }
      }
    );

    if (!incompleteResponse.ok) {
      const errorText = await incompleteResponse.text();
      console.error('❌ Failed to get incomplete payments:', errorText);
      return Response.json({
        success: false,
        error: `Failed to get incomplete payments: ${errorText}`
      }, { status: 500, headers: corsHeaders });
    }

    const data = await incompleteResponse.json();
    const incompletePayments = data.incomplete_server_payments || [];

    console.log(`Found ${incompletePayments.length} incomplete payments:`, 
      incompletePayments.map(p => ({
        id: p.identifier,
        amount: p.amount,
        status: p.status,
        has_tx: !!p.transaction
      }))
    );

    if (incompletePayments.length === 0) {
      return Response.json({
        success: true,
        message: 'No incomplete payments found',
        payments: []
      }, { headers: corsHeaders });
    }

    // Process each incomplete payment
    const results = [];
    
    for (const payment of incompletePayments) {
      const paymentId = payment.identifier;
      const hasTxid = !!payment.transaction?.txid;
      const txid = payment.transaction?.txid;
      
      console.log(`Processing payment ${paymentId}:`, {
        has_txid: hasTxid,
        developer_approved: payment.status?.developer_approved,
        developer_completed: payment.status?.developer_completed
      });

      try {
        if (hasTxid && !payment.status?.developer_completed) {
          // Has txid but not completed - complete it
          console.log(`✅ Completing payment ${paymentId} with txid ${txid}`);
          
          const completeResponse = await fetch(
            `https://api.minepi.com/v2/payments/${paymentId}/complete`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Key ${env.PI_API_KEY}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ txid })
            }
          );

          if (completeResponse.ok) {
            const completed = await completeResponse.json();
            results.push({
              payment_id: paymentId,
              action: 'completed',
              txid,
              success: true
            });
            
            // Update our database if we have this refund
            await env.DB.prepare(`
              UPDATE refunds 
              SET txid = ?,
                  refund_status = 'completed',
                  completed_at = unixepoch()
              WHERE payment_identifier = ?
            `).bind(txid, paymentId).run();
            
          } else {
            const errorText = await completeResponse.text();
            console.error(`❌ Failed to complete ${paymentId}:`, errorText);
            results.push({
              payment_id: paymentId,
              action: 'complete_failed',
              error: errorText,
              success: false
            });
          }
          
        } else if (!hasTxid) {
          // No txid - cancel it
          console.log(`❌ Cancelling payment ${paymentId} (no transaction)`);
          
          const cancelResponse = await fetch(
            `https://api.minepi.com/v2/payments/${paymentId}/cancel`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Key ${env.PI_API_KEY}`,
                'Content-Type': 'application/json'
              }
            }
          );

          if (cancelResponse.ok) {
            results.push({
              payment_id: paymentId,
              action: 'cancelled',
              reason: 'No blockchain transaction',
              success: true
            });
            
            // Update our database
            await env.DB.prepare(`
              UPDATE refunds 
              SET refund_status = 'cancelled',
                  error_message = 'Cancelled - no blockchain transaction created'
              WHERE payment_identifier = ?
            `).bind(paymentId).run();
            
          } else {
            const errorText = await cancelResponse.text();
            console.error(`❌ Failed to cancel ${paymentId}:`, errorText);
            results.push({
              payment_id: paymentId,
              action: 'cancel_failed',
              error: errorText,
              success: false
            });
          }
        }
      } catch (err) {
        console.error(`❌ Error processing ${paymentId}:`, err);
        results.push({
          payment_id: paymentId,
          action: 'error',
          error: err.message,
          success: false
        });
      }
    }

    return Response.json({
      success: true,
      message: `Processed ${results.length} incomplete payments`,
      results,
      total_incomplete: incompletePayments.length
    }, { headers: corsHeaders });

  } catch (error) {
    console.error('❌ Cleanup error:', error);
    
    return Response.json({
      success: false,
      error: error.message
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-admin-token',
    },
  });
}
