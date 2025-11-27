// js/pi-payment.js
// Pi Network Payment Handler - Official Implementation with Fixed Cancel

const PiPayment = {
  PI_EXCHANGE_RATE: 2.0,
  API_BASE_URL: window.location.origin,
  incompletePayment: null,
  isInitialized: false,
  isAuthenticated: false,

  // Convert RM to Pi
  rmToPi(rmAmount) {
    return (rmAmount / this.PI_EXCHANGE_RATE).toFixed(2);
  },

  // Initialize Pi SDK
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing Pi Payment System...');

      if (typeof Pi === 'undefined') {
        console.error('❌ Pi SDK not loaded');
        return false;
      }

      // Initialize Pi SDK
      await Pi.init({
        version: "2.0",
        sandbox: true
      });

      console.log('✅ Pi SDK initialized');

      // Authenticate with payments scope
      await this.authenticateWithPayments();

      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('❌ Pi initialization error:', error);
      return false;
    }
  },

  // Authenticate with payments scope - OFFICIAL PATTERN
  async authenticateWithPayments() {
    if (this.isAuthenticated) {
      console.log('✅ Already authenticated');
      return;
    }

    try {
      console.log('🔐 Authenticating with payment scope...');

      // Authenticate the user, and get permission to request payments from them:
      const scopes = ['payments'];

      // Read more about this callback in the SDK reference:
      function onIncompletePaymentFound(payment) {
        console.log('⚠️ Incomplete payment found:', payment);
        console.log('Payment structure:', JSON.stringify(payment, null, 2));
        
        PiPayment.incompletePayment = payment;
        
        // Prompt user about incomplete payment
        setTimeout(() => PiPayment.promptIncompletePayment(), 1000);
      }

      await Pi.authenticate(scopes, onIncompletePaymentFound).then(function(auth) {
        console.log(`✅ Hi there! You're ready to make payments!`);
        PiPayment.isAuthenticated = true;
        return auth;
      }).catch(function(error) {
        console.error('❌ Authentication error:', error);
        throw error;
      });

    } catch (error) {
      console.error('❌ Authentication failed:', error);
      throw error;
    }
  },

  // Prompt user about incomplete payment
  async promptIncompletePayment() {
    if (!this.incompletePayment) return;

    // Log the full payment object to debug
    console.log('Full incomplete payment object:', this.incompletePayment);

    // Extract payment details - OFFICIAL: field is 'identifier'
    const paymentId = this.incompletePayment.identifier; // Official PaymentDTO field
    const amount = this.incompletePayment.amount || 'unknown';
    const orderId = this.incompletePayment.metadata?.order_id || 'Unknown';
    
    console.log('Extracted values:', { paymentId, amount, orderId });

    // Check if we have a valid payment ID
    if (!paymentId) {
      console.error('❌ No payment_id found in incomplete payment object');
      alert(
        '⚠️ PENDING PAYMENT DETECTED\n\n' +
        `Amount: ${amount} Pi\n\n` +
        'However, we cannot identify this payment.\n\n' +
        'Please complete or reject it in Pi Mobile App:\n' +
        '1. Open Pi Mobile App\n' +
        '2. Go to Wallet → Payments\n' +
        '3. Complete or reject the pending payment'
      );
      return;
    }
    
    const message = 
      `⚠️ PENDING PAYMENT DETECTED\n\n` +
      `Order: ${orderId}\n` +
      `Amount: ${amount} Pi\n` +
      `Payment ID: ${paymentId}\n\n` +
      `This payment is locked in Pi Network.\n\n` +
      `Options:\n` +
      `• Cancel it here (place new order)\n` +
      `• Complete it in Pi Mobile App\n` +
      `• Wait ~24 hours for expiry\n\n` +
      `Click OK to CANCEL this payment.`;
    
    const userWantsToCancel = confirm(message);

    if (userWantsToCancel) {
      console.log('User chose to cancel pending payment');
      await this.cancelPendingPayment(paymentId, orderId);
    } else {
      console.log('User kept the pending payment');
      alert(
        '📱 TO COMPLETE PENDING PAYMENT:\n\n' +
        '1. Open Pi Mobile App\n' +
        '2. Go to Wallet → Payments\n' +
        '3. Complete the pending payment\n\n' +
        'Payment expires in ~24 hours.'
      );
    }
  },

  // Cancel pending payment in our system
  async cancelPendingPayment(paymentId, orderId) {
    console.log('🔄 Canceling payment...', { paymentId, orderId });

    if (!paymentId) {
      alert('❌ Cannot cancel: Payment ID is missing.');
      return;
    }

    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          order_id: orderId || null
        })
      });

      const result = await response.json();

      if (result.success) {
        this.incompletePayment = null;
        alert(
          '✅ PAYMENT CANCELLED\n\n' +
          'Pending payment cancelled in our system.\n' +
          'You can now place a new order.\n\n' +
          '⚠️ It may still show in Pi App until expiry.'
        );
      } else {
        throw new Error(result.error || 'Cancel failed');
      }

    } catch (error) {
      console.error('❌ Cancel error:', error);
      alert(`Failed to cancel: ${error.message}`);
    }
  },

  // Create new Pi payment - OFFICIAL PATTERN
  async createPayment(orderData) {
    try {
      console.log('🔄 Creating Pi payment for order:', orderData.order_id);

      // Ensure authenticated with payment scope
      if (!this.isAuthenticated) {
        console.log('🔐 Need to authenticate first...');
        await this.authenticateWithPayments();
      }

      const piAmount = parseFloat(this.rmToPi(orderData.total_amt));

      // Official Pi SDK createPayment pattern
      Pi.createPayment({
        // Amount of π to be paid:
        amount: piAmount,
        
        // An explanation of the payment - will be shown to the user:
        memo: `Order ${orderData.order_id} - ${orderData.prod_name.substring(0, 50)}`,
        
        // An arbitrary developer-provided metadata object - for your own usage:
        metadata: {
          order_id: orderData.order_id,
          customer_name: orderData.cus_name,
          total_rm: orderData.total_amt
        }
      }, {
        // Callbacks you need to implement - read more about those in the detailed docs:
        
        onReadyForServerApproval: (paymentId) => {
          console.log('📝 Payment ready for approval:', paymentId);
          this.approvePayment(paymentId, orderData.order_id)
            .then(() => console.log('✅ Approved'))
            .catch(error => {
              console.error('❌ Approval failed:', error);
              throw error;
            });
        },

        onReadyForServerCompletion: (paymentId, txid) => {
          console.log('✅ Payment ready for completion:', { paymentId, txid });
          this.completePayment(paymentId, txid, orderData.order_id)
            .then(() => {
              console.log('✅ Completed on server');
              
              // Success!
              localStorage.removeItem('cartItems');
              alert('✅ Payment successful!\n\nRedirecting...');
              
              setTimeout(() => {
                window.location.href = `/order-success.html?order_id=${orderData.order_id}`;
              }, 1000);
            })
            .catch(error => {
              console.error('❌ Completion failed:', error);
              alert(
                `Payment completion failed: ${error.message}\n\n` +
                `Contact support with Order ID: ${orderData.order_id}`
              );
              throw error;
            });
        },

        onCancel: (paymentId) => {
          console.log('❌ Payment cancelled by user:', paymentId);
          alert('Payment cancelled.\n\nYou can try again when ready.');
        },

        onError: (error, payment) => {
          console.error('❌ Payment error:', error);
          console.log('Payment object:', payment);
          
          let errorMsg = error.message || 'Unknown error occurred';
          
          if (errorMsg.includes('pending payment') || errorMsg.includes('incomplete payment')) {
            errorMsg = 
              '⚠️ PENDING PAYMENT EXISTS\n\n' +
              'You have a pending payment.\n\n' +
              'Options:\n' +
              '• Refresh page to cancel it\n' +
              '• Complete in Pi Mobile App\n' +
              '• Wait ~24 hours for expiry';
              
          } else if (errorMsg.includes('insufficient')) {
            errorMsg = '💰 INSUFFICIENT BALANCE\n\nAdd more Pi to your wallet.';
            
          } else if (errorMsg.includes('payment scope') || errorMsg.includes('no payment scope')) {
            errorMsg = '🔐 AUTHENTICATION REQUIRED\n\nRefresh page and try again.';
            
          } else if (errorMsg.toLowerCase().includes('undefined')) {
            errorMsg = '⚠️ CONNECTION ERROR\n\nCheck your internet.';
          }
          
          alert(`Payment Failed\n\n${errorMsg}`);
        }
      });

      console.log('✅ Payment creation initiated');

    } catch (error) {
      console.error('❌ Create payment error:', error);
      
      let userMsg = error.message;
      if (userMsg.includes('undefined')) {
        userMsg = 'Connection error. Please try again.';
      }
      
      throw new Error(userMsg);
    }
  },

  // Approve payment on backend
  async approvePayment(paymentId, orderId) {
    console.log('🔄 Approving on server...', { paymentId, orderId });

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

      console.log('✅ Approved:', result);
      return result;

    } catch (error) {
      console.error('❌ Approve error:', error);
      throw error;
    }
  },

  // Complete payment on backend
  async completePayment(paymentId, txid, orderId) {
    console.log('🔄 Completing on server...', { paymentId, txid, orderId });

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

      console.log('✅ Completed:', result);
      return result;

    } catch (error) {
      console.error('❌ Complete error:', error);
      throw error;
    }
  }
};

// Auto-initialize when Pi SDK loads
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
window.PiPayment = PiPayment;
