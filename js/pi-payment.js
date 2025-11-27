// js/pi-payment.js
// Pi Network Payment Handler - FINAL VERSION

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

      // Initialize Pi SDK (appId is optional - Pi detects from URL)
      await Pi.init({
        version: "2.0",
        sandbox: true
        // appId: "ceo0513" // Optional - uncomment if needed
      });

      console.log('✅ Pi SDK initialized');

      // Check for incomplete payments
      try {
        const incomplete = await Pi.getIncompletePaymentData();
        if (incomplete && incomplete.payment_id) {
          this.incompletePayment = incomplete;
          console.log('⚠️ Incomplete payment detected:', incomplete);
          setTimeout(() => this.promptIncompletePayment(), 1500);
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
    const orderId = this.incompletePayment.metadata?.order_id || 'Unknown';
    
    const message = 
      `⚠️ PENDING PAYMENT DETECTED\n\n` +
      `Order: ${orderId}\n` +
      `Amount: ${amount} Pi\n\n` +
      `This payment is locked in Pi Network and cannot be reopened here.\n\n` +
      `Your options:\n` +
      `1. Complete it in Pi Mobile App (Go to Payments)\n` +
      `2. Cancel it in our system to place a new order\n` +
      `3. Wait for it to expire (~24 hours)\n\n` +
      `Click OK to CANCEL this payment in our system.\n` +
      `Click Cancel to keep it (you must complete in Pi App).`;
    
    const userWantsToCancel = confirm(message);

    if (userWantsToCancel) {
      console.log('User chose to cancel pending payment');
      await this.cancelPendingPayment();
    } else {
      console.log('User kept the pending payment');
      alert(
        '📱 To complete this payment:\n\n' +
        '1. Open Pi Mobile App\n' +
        '2. Tap "Wallet" → "Payments"\n' +
        '3. Find and complete the pending payment\n\n' +
        'Or wait ~24 hours for it to expire automatically.'
      );
    }
  },

  // Cancel pending payment in YOUR system (not in Pi Network)
  async cancelPendingPayment() {
    if (!this.incompletePayment) return;

    console.log('🔄 Canceling pending payment in our system...');

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: this.incompletePayment.payment_id,
          order_id: this.incompletePayment.metadata?.order_id
        })
      });

      const result = await response.json();

      if (result.success) {
        this.incompletePayment = null;
        alert(
          '✅ Pending payment cancelled in our system.\n\n' +
          'You can now place a new order.\n\n' +
          'Note: The payment may still show in Pi App until it expires.'
        );
      } else {
        throw new Error(result.error || 'Cancel failed');
      }

    } catch (error) {
      console.error('❌ Cancel error:', error);
      alert(`Failed to cancel: ${error.message}`);
    }
  },

  // Create new Pi payment
  async createPayment(orderData) {
    try {
      console.log('🔄 Creating Pi payment for order:', orderData.order_id);

      // 🔐 Authenticate first (critical for payment scope)
      if (typeof PiAuth !== 'undefined' && PiAuth.hasPaymentScope) {
        if (!PiAuth.hasPaymentScope()) {
          console.log('🔐 Authenticating for payment scope...');
          try {
            await PiAuth.authenticate();
            console.log('✅ Authenticated successfully');
          } catch (authErr) {
            console.error('❌ Authentication failed:', authErr);
            throw new Error('Authentication required for payments');
          }
        } else {
          console.log('✅ Already authenticated with payment scope');
        }
      }

      const piAmount = parseFloat(this.rmToPi(orderData.total_amt));

      const paymentData = {
        amount: piAmount,
        memo: `Order ${orderData.order_id} - ${orderData.prod_name.substring(0, 50)}`,
        metadata: {
          order_id: orderData.order_id,
          customer_name: orderData.cus_name,
          total_rm: orderData.total_amt
        }
      };

      console.log('💳 Creating payment:', paymentData);

      // Create payment with callbacks
      const payment = await Pi.createPayment(paymentData, {
        
        // Callback 1: Server approval
        onReadyForServerApproval: async (paymentId) => {
          console.log('📝 Payment ready for approval:', paymentId);
          try {
            await this.approvePayment(paymentId, orderData.order_id);
            console.log('✅ Approved on server');
          } catch (error) {
            console.error('❌ Approval failed:', error);
            throw error;
          }
        },

        // Callback 2: Server completion
        onReadyForServerCompletion: async (paymentId, txid) => {
          console.log('✅ Payment ready for completion:', { paymentId, txid });
          try {
            await this.completePayment(paymentId, txid, orderData.order_id);
            console.log('✅ Completed on server');
            
            // Success - clear cart and redirect
            localStorage.removeItem('cartItems');
            alert('✅ Payment successful! Redirecting to order confirmation...');
            
            setTimeout(() => {
              window.location.href = `/order-success.html?order_id=${orderData.order_id}`;
            }, 1000);
            
          } catch (error) {
            console.error('❌ Completion failed:', error);
            alert(`Payment completion failed: ${error.message}\n\nPlease contact support with Order ID: ${orderData.order_id}`);
            throw error;
          }
        },

        // Callback 3: User cancelled
        onCancel: (paymentId) => {
          console.log('❌ Payment cancelled by user:', paymentId);
          alert('Payment cancelled. You can try again when ready.');
        },

        // Callback 4: Error handling
        onError: (error, payment) => {
          console.error('❌ Payment error:', error);
          
          let errorMsg = error.message || 'Unknown error occurred';
          
          // Handle specific errors
          if (errorMsg.includes('pending payment') || errorMsg.includes('incomplete payment')) {
            errorMsg = 
              '⚠️ You have a pending payment in Pi Network.\n\n' +
              'Options:\n' +
              '• Complete it in Pi Mobile App\n' +
              '• Refresh this page to cancel it\n' +
              '• Wait ~24 hours for it to expire';
          } else if (errorMsg.includes('insufficient')) {
            errorMsg = '💰 Insufficient Pi balance.\n\nPlease add more Pi to your wallet.';
          } else if (errorMsg.includes('payment scope') || errorMsg.includes('no payment scope')) {
            errorMsg = '🔐 Authentication required.\n\nPlease refresh the page and try again.';
          } else if (errorMsg.toLowerCase().includes('undefined')) {
            errorMsg = '⚠️ Connection error.\n\nPlease check your internet and try again.';
          }
          
          alert(`Payment failed:\n\n${errorMsg}`);
        }
      });

      console.log('✅ Payment flow completed:', payment);
      return payment;

    } catch (error) {
      console.error('❌ Create payment error:', error);
      
      // Better error message for user
      let userMsg = error.message;
      if (userMsg.includes('undefined')) {
        userMsg = 'Connection error. Please check your internet and try again.';
      }
      
      throw new Error(userMsg);
    }
  },

  // Approve payment on backend
  async approvePayment(paymentId, orderId) {
    console.log('🔄 Approving payment on server...', { paymentId, orderId });

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, order_id: orderId })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
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
        body: JSON.stringify({ payment_id: paymentId, txid, order_id: orderId })
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      if (!result.success) {
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { 
      PiPayment.initialize(); 
    });
  } else {
    PiPayment.initialize();
  }
}

// Export globally
window.PiPayment
