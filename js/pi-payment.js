// pi-payment.js - Fixed version with authentication

const PiPayment = {
  exchangeRate: 2.0, // 1 Pi = RM 2.00

  // Convert RM to Pi
  rmToPi(rmAmount) {
    return (rmAmount / this.exchangeRate).toFixed(2);
  },

  // Create Pi payment with authentication
  async createPayment(orderData) {
    try {
      console.log('💰 Creating Pi payment...');
      
      // STEP 1: Authenticate first (if not already)
      if (!PiAuth.hasPaymentScope()) {
        console.log('🔐 Need authentication...');
        try {
          await PiAuth.authenticate();
          console.log('✅ Authenticated successfully');
        } catch (authErr) {
          console.error('❌ Authentication failed:', authErr);
          throw new Error('Authentication cancelled or failed');
        }
      } else {
        console.log('✅ Already authenticated');
      }
      
      // STEP 2: Create payment
      const piAmount = this.rmToPi(orderData.total_amt);
      console.log(`Creating payment: ${piAmount} Pi (RM ${orderData.total_amt})`);
      
      const paymentData = {
        amount: parseFloat(piAmount),
        memo: `CEO Products - Order ${orderData.order_id}`,
        metadata: {
          order_id: orderData.order_id,
          products: orderData.prod_name,
          customer: orderData.cus_name,
          phone: orderData.phone,
          rm_amount: orderData.total_amt
        }
      };

      const payment = Pi.createPayment(paymentData, {
        // Payment ready for backend approval
        onReadyForServerApproval: async (paymentId) => {
          console.log('💳 Payment created:', paymentId);
          console.log('Sending to backend for approval...');
          
          try {
            const result = await this.approvePaymentOnBackend(paymentId, orderData);
            console.log('✅ Backend approval result:', result);
            return result;
          } catch (err) {
            console.error('❌ Backend approval failed:', err);
            throw err;
          }
        },
        
        // Payment completed on blockchain
        onReadyForServerCompletion: async (paymentId, txid) => {
          console.log('🎉 Payment confirmed on blockchain!');
          console.log('Payment ID:', paymentId);
          console.log('Transaction ID:', txid);
          
          try {
            const result = await this.completePaymentOnBackend(paymentId, txid, orderData);
            console.log('✅ Backend completion result:', result);
            
            if (result.success) {
              // Clear cart
              localStorage.removeItem("cartItems");
              localStorage.setItem('orderPlaced', btoa(orderData.order_id));
              
              // Show success
              alert(`✅ Payment successful!\n\nOrder ${orderData.order_id} confirmed.`);
              
              // Redirect to orders page
              window.location.href = 'order.html';
            }
            
            return result;
          } catch (err) {
            console.error('❌ Backend completion failed:', err);
            alert('Payment processed but order update failed. Contact support with Order ID: ' + orderData.order_id);
            throw err;
          }
        },
        
        // Payment cancelled
        onCancel: (paymentId) => {
          console.log('❌ Payment cancelled by user');
          alert('Payment was cancelled. Your order is saved, you can try again.');
          
          // Re-enable button
          const btn = document.getElementById('confirmBtn');
          if (btn) {
            btn.disabled = false;
            btn.textContent = '🥧 Pay with Pi Network';
          }
        },
        
        // Payment error
        onError: (error, payment) => {
          console.error('❌ Payment error:', error);
          alert('Payment failed: ' + (error.message || 'Unknown error'));
          
          // Re-enable button
          const btn = document.getElementById('confirmBtn');
          if (btn) {
            btn.disabled = false;
            btn.textContent = '🥧 Pay with Pi Network';
          }
        }
      });

      console.log('✅ Payment dialog opened');
      return payment;

    } catch (error) {
      console.error('❌ Create payment failed:', error);
      throw error;
    }
  },

  // Backend approval
  async approvePaymentOnBackend(paymentId, orderData) {
    try {
      console.log('Calling /api/pi/approve...');
      
      const response = await fetch('/api/pi/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          order_id: orderData.order_id
        })
      });

      if (!response.ok) {
        throw new Error(`Approval failed: HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Backend approval response:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Approval failed');
      }
      
      return result;

    } catch (error) {
      console.error('Backend approval error:', error);
      throw error;
    }
  },

  // Complete payment on backend
  async completePaymentOnBackend(paymentId, txid, orderData) {
    try {
      console.log('Calling /api/pi/complete...');
      
      const response = await fetch('/api/pi/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          txid: txid,
          order_id: orderData.order_id
        })
      });

      if (!response.ok) {
        throw new Error(`Completion failed: HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('Backend completion response:', result);
      
      if (!result.success) {
        throw new Error(result.error || 'Completion failed');
      }
      
      return result;

    } catch (error) {
      console.error('Backend completion error:', error);
      throw error;
    }
  }
};

// Expose globally
window.PiPayment = PiPayment;
console.log('✅ PiPayment loaded');
