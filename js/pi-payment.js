// js/pi-payment.js
// Pi Network Payment Handler

const PiPayment = {
  PI_EXCHANGE_RATE: 2.0,
  API_BASE_URL: window.location.origin,
  incompletePayment: null,
  isInitialized: false,

  // Convert RM to Pi
  rmToPi(rmAmount) {
    return (rmAmount / this.PI_EXCHANGE_RATE).toFixed(2);
  },

  // Initialize Pi SDK and check for incomplete payments
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing Pi Payment System...');

      if (typeof Pi === 'undefined') {
        console.error('❌ Pi SDK not loaded');
        return false;
      }

      // Initialize Pi SDK with payments scope
      await Pi.init({
  version: "2.0",
  appId: "ceo0513",
  scopes: ["payments"],
  sandbox: true
  });

      console.log('✅ Pi SDK initialized');

      // Check for incomplete payments
      try {
        const incomplete = await Pi.getIncompletePaymentData();
        
        if (incomplete && incomplete.payment_id) {
          this.incompletePayment = incomplete;
          console.log('⚠️ Incomplete payment detected:', incomplete);
          
          // Prompt user about incomplete payment
          setTimeout(() => this.promptIncompletePayment(), 1000);
        } else {
          console.log('✅ No incomplete payments');
        }
      } catch (err) {
        console.log('No incomplete payment check available:', err.message);
      }

      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('❌ Pi initialization error:', error);
      return false;
    }
  },

  // Prompt user about incomplete payment
  async promptIncompletePayment() {
    if (!this.incompletePayment) return;

    const amount = this.incompletePayment.amount || 'unknown';
    
    const userChoice = confirm(
      `You have an incomplete payment of ${amount} Pi.\n\n` +
      `Would you like to complete it now?\n\n` +
      `Click OK to complete, or Cancel to dismiss.`
    );

    if (userChoice) {
      console.log('User chose to complete incomplete payment');
      await this.resumeIncompletePayment();
    } else {
      console.log('User dismissed incomplete payment');
      this.incompletePayment = null;
      alert('Incomplete payment dismissed. You can proceed with a new order.');
    }
  },

  // Resume incomplete payment
  async resumeIncompletePayment() {
    if (!this.incompletePayment) {
      console.error('No incomplete payment to resume');
      return;
    }

    console.log('🔄 Resuming incomplete payment:', this.incompletePayment);

    try {
      const paymentId = this.incompletePayment.payment_id;
      const orderId = this.incompletePayment.metadata?.order_id || 'UNKNOWN';

      // Re-open the payment dialog for incomplete payment
      // FIXED: Correct spelling of openPaymentDialog
      const payment = await Pi.openPaymentDialog(paymentId);

      console.log('Payment dialog closed:', payment);

      if (payment && payment.txid) {
        // Payment completed, process it
        await this.completePayment(payment.payment_id, payment.txid, orderId);
        
        this.incompletePayment = null;
        
        alert('✅ Payment completed successfully!');
        window.location.href = `/order-success.html?order_id=${orderId}`;
        
      } else {
        console.log('Payment not completed');
        alert('Payment was not completed. Please try again.');
      }

    } catch (error) {
      console.error('❌ Resume payment error:', error);
      alert(`Failed to resume payment: ${error.message}`);
    }
  },

  // Create new Pi payment
  async createPayment(orderData) {
    try {
      console.log('🔄 Creating Pi payment for order:', orderData.order_id);

      const piAmount = parseFloat(this.rmToPi(orderData.total_amt));

      // Prepare payment data
      const paymentData = {
        amount: piAmount,
        memo: `Order ${orderData.order_id} - ${orderData.prod_name.substring(0, 50)}`,
        metadata: {
          order_id: orderData.order_id,
          customer_name: orderData.cus_name,
          total_rm: orderData.total_amt
        }
      };

      console.log('Payment data:', paymentData);

      // Create payment with callbacks
      const payment = await Pi.createPayment(paymentData, {
        
        // Callback 1: Server needs to approve payment
        onReadyForServerApproval: async (paymentId) => {
          console.log('📝 Payment ready for approval:', paymentId);
          
          try {
            await this.approvePayment(paymentId, orderData.order_id);
            console.log('✅ Payment approved on server');
          } catch (error) {
            console.error('❌ Approval failed:', error);
            throw error;
          }
        },

        // Callback 2: Server needs to complete payment
        onReadyForServerCompletion: async (paymentId, txid) => {
          console.log('✅ Payment ready for completion:', { paymentId, txid });
          
          try {
            await this.completePayment(paymentId, txid, orderData.order_id);
            console.log('✅ Payment completed on server');
            
            // Clear cart and redirect
            localStorage.removeItem('cartItems');
            
            alert('✅ Payment successful! Redirecting to order confirmation...');
            
            setTimeout(() => {
              window.location.href = `/order-success.html?order_id=${orderData.order_id}`;
            }, 1000);
            
          } catch (error) {
            console.error('❌ Completion failed:', error);
            alert(`Payment completion failed: ${error.message}`);
            throw error;
          }
        },

        // Callback 3: User cancelled payment
        onCancel: (paymentId) => {
          console.log('❌ Payment cancelled by user:', paymentId);
          alert('Payment cancelled. You can try again when ready.');
        },

        // Callback 4: Payment error
        onError: (error, payment) => {
          console.error('❌ Payment error:', error);
          
          let errorMsg = error.message || 'Unknown error occurred';
          
          // Handle specific error cases
          if (errorMsg.includes('pending payment')) {
            errorMsg = 'You have a pending payment. Please complete it first or wait for it to expire.';
          } else if (errorMsg.includes('insufficient')) {
            errorMsg = 'Insufficient Pi balance. Please add more Pi to your wallet.';
          }
          
          alert(`Payment failed: ${errorMsg}`);
        }
      });

      console.log('Payment flow completed:', payment);
      return payment;

    } catch (error) {
      console.error('❌ Create payment error:', error);
      throw error;
    }
  },

  // Approve payment on backend
  async approvePayment(paymentId, orderId) {
    console.log('🔄 Approving payment on server...', { paymentId, orderId });

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          order_id: orderId
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('❌ Approval failed:', result);
        throw new Error(result.error || 'Approval failed');
      }

      console.log('✅ Payment approved on server:', result);
      return result;

    } catch (error) {
      console.error('❌ Approve payment error:', error);
      throw error;
    }
  },

  // Complete payment on backend
  async completePayment(paymentId, txid, orderId) {
    console.log('🔄 Completing payment on server...', { paymentId, txid, orderId });

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          txid: txid,
          order_id: orderId
        })
      });

      const result = await response.json();

      if (!result.success) {
        console.error('❌ Completion failed:', result);
        throw new Error(result.error || 'Completion failed');
      }

      console.log('✅ Payment completed on server:', result);
      return result;

    } catch (error) {
      console.error('❌ Complete payment error:', error);
      throw error;
    }
  }
};

// Auto-initialize when Pi SDK is available
if (typeof Pi !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      PiPayment.initialize();
    });
  } else {
    PiPayment.initialize();
  }
}

// Export for use in checkout.html
window.PiPayment = PiPayment;
