// Update js/pi-payment.js
// Pi Network Payment Handler - Version 13 - Final Fixed
// Last Updated: 2024-12-21

const PiPayment = {
  PI_EXCHANGE_RATE: 1.0, // Fallback default
  API_BASE_URL: window.location.origin,
  incompletePayment: null,
  isInitialized: false,
  isAuthenticated: false,

  // NEW: Method to set exchange rate
  setExchangeRate(rate) {
    if (rate && rate > 0) {
      this.PI_EXCHANGE_RATE = rate;
      console.log('💱 Exchange rate updated:', rate);
    }
  },

  // Convert RM to Pi (8 decimal places for precision)
  rmToPi(rmAmount) {
    return (rmAmount / this.PI_EXCHANGE_RATE).toFixed(8);
  },

  // Initialize Pi SDK - Sandbox detection is REQUIRED
  async initialize() {
    if (this.isInitialized) {
      console.log('⏭️ Already initialized');
      return true;
    }

    try {
      console.log('🔄 Initializing Pi Payment System...');
      
      // Detect sandbox vs production based on hostname
      // Sandbox URL: chat-ui-30l.pages.dev
      // Production URL: ceo-9xi.pages.dev
      const isSandbox = window.location.hostname === 'chat-ui-30l.pages.dev' ||
                        window.location.hostname === 'localhost' ||
                        window.location.hostname.includes('127.0.0.1') ||
                        window.location.search.includes('sandbox=true');
      
      console.log('🔍 Environment:', {
        hostname: window.location.hostname,
        mode: isSandbox ? 'SANDBOX' : 'PRODUCTION'
      });

      if (typeof Pi === 'undefined') {
        console.error('❌ Pi SDK not loaded');
        return false;
      }

      // Initialize Pi SDK with explicit sandbox mode
      await Pi.init({
        version: "2.0",
        sandbox: isSandbox
      });

      console.log(`✅ Pi SDK initialized in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);
      console.log('⏳ Authentication will happen when user initiates payment');

      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('❌ Pi initialization error:', error);
      
      if (error.message?.includes('timed out')) {
        alert(
          '⚠️ CONNECTION TIMEOUT\n\n' +
          'Cannot connect to Pi Network.\n\n' +
          'Please ensure:\n' +
          '• Opened in Pi Browser\n' +
          '• Stable internet connection\n' +
          '• Pi Browser is updated'
        );
      }
      
      return false;
    }
  },

  // Authenticate with payments scope - ONLY WHEN NEEDED
  async authenticateWithPayments() {
    if (this.isAuthenticated) {
      console.log('✅ Already authenticated');
      return;
    }

    try {
      console.log('🔐 Authenticating with payment scope...');

      const scopes = ['payments'];

      // Callback for incomplete payments
      function onIncompletePaymentFound(payment) {
        console.log('⚠️ Incomplete payment found:', payment);
        PiPayment.incompletePayment = payment;
        setTimeout(() => PiPayment.promptIncompletePayment(), 1000);
      }

      const auth = await Pi.authenticate(scopes, onIncompletePaymentFound);
      
      console.log('✅ Authentication successful! Ready for payments.');
      PiPayment.isAuthenticated = true;
      
      return auth;

    } catch (error) {
      console.error('❌ Authentication failed:', error);
      throw error;
    }
  },

  // Prompt user about incomplete payment
  async promptIncompletePayment() {
    if (!this.incompletePayment) return;

    const paymentId = this.incompletePayment.identifier;
    const amount = this.incompletePayment.amount || 'unknown';
    const orderId = this.incompletePayment.metadata?.order_id || 'Unknown';
    const hasTxid = this.incompletePayment.transaction?.txid;
    const isDeveloperCompleted = this.incompletePayment.status?.developer_completed;
    
    console.log('Payment details:', { paymentId, amount, orderId, hasTxid, isDeveloperCompleted });

    if (!paymentId) {
      alert('⚠️ Cannot process incomplete payment.\n\nPlease complete it in Pi Mobile App.');
      return;
    }

    if (isDeveloperCompleted) {
      alert('This payment is already completed on Pi Network.\n\nSyncing...');
      if (hasTxid) await this.completePayment(paymentId, hasTxid, orderId);
      this.incompletePayment = null;
      return;
    }
    
    let message;
    if (hasTxid) {
      message = 
        `⚠️ INCOMPLETE PAYMENT\n\n` +
        `Order: ${orderId}\n` +
        `Amount: ${amount} Pi\n` +
        `Status: Transaction submitted ✅\n\n` +
        `Click OK to complete it now.`;
    } else {
      message = 
        `⚠️ PENDING PAYMENT\n\n` +
        `Order: ${orderId}\n` +
        `Amount: ${amount} Pi\n\n` +
        `This payment blocks new orders.\n\n` +
        `OK = Cancel it\n` +
        `Cancel = Keep it`;
    }
    
    if (confirm(message)) {
      if (hasTxid) {
        await this.completeIncompletePayment(paymentId, hasTxid, orderId);
      } else {
        await this.cancelPendingPayment(paymentId, orderId);
      }
    } else {
      alert('📱 Complete in Pi Mobile App:\nWallet → Payments');
    }
  },

  // Complete incomplete payment
  async completeIncompletePayment(paymentId, txid, orderId) {
    try {
      await this.approvePayment(paymentId, orderId).catch(() => {});
      await this.completePayment(paymentId, txid, orderId);
      
      this.incompletePayment = null;
      alert(`✅ Payment completed!\n\nOrder: ${orderId}`);
      
      setTimeout(() => {
        window.location.href = `/order-success.html?order_id=${orderId}`;
      }, 2000);
    } catch (error) {
      alert(`❌ Failed: ${error.message}`);
    }
  },

  // Cancel pending payment
  async cancelPendingPayment(paymentId, orderId) {
    try {
      const response = await fetch(`${this.API_BASE_URL}/api/pi/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_id: paymentId, order_id: orderId })
      });

      const result = await response.json();
      if (result.success) {
        this.incompletePayment = null;
        alert('✅ Payment cancelled in our system.\n\nYou can place a new order.');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      alert(`Failed to cancel: ${error.message}`);
    }
  },

  // Create new Pi payment
  async createPayment(orderData) {
    try {
      console.log('🔄 Creating Pi payment for order:', orderData.order_id);

      // Authenticate ONLY when creating payment (not on page load)
      if (!this.isAuthenticated) {
        console.log('🔐 Authenticating now...');
        await this.authenticateWithPayments();
      }

      const piAmount = parseFloat(this.rmToPi(orderData.total_amt));

      console.log('💳 Payment details:', {
        amount: piAmount,
        order_id: orderData.order_id
      });

      // Create payment
      Pi.createPayment({
        amount: piAmount,
        memo: `Order ${orderData.order_id} - ${orderData.prod_name.substring(0, 50)}`,
        metadata: {
          order_id: orderData.order_id,
          customer_name: orderData.cus_name,
          total_rm: orderData.total_amt
        }
      }, {
        onReadyForServerApproval: (paymentId) => {
          console.log('📝 Approving:', paymentId);
          this.approvePayment(paymentId, orderData.order_id)
            .then(() => console.log('✅ Approved'))
            .catch(err => console.error('❌ Approval failed:', err));
        },

onReadyForServerApproval: (paymentId) => {
  console.log('📝 Approving:', paymentId);
  this.approvePayment(paymentId, orderData.order_id)
    .then(() => console.log('✅ Approved'))
    .catch(err => console.error('❌ Approval failed:', err));
},

onReadyForServerCompletion: (paymentId, txid) => {
  console.log('✅ Completing:', paymentId, txid);
  this.completePayment(paymentId, txid, orderData.order_id)
    .then(() => {
      localStorage.removeItem('cartItems');
      
      const piAmount = orderData.pi_amount || (orderData.total_amt / this.PI_EXCHANGE_RATE).toFixed(8);
      const whatsappMsg = encodeURIComponent(
        `🎉 Pi Payment Completed!\n\n` +
        `Order ID: ${orderData.order_id}\n` +
        `Customer: ${orderData.cus_name}\n` +
        `Phone: ${orderData.phone}\n` +
        `Total: RM ${orderData.total_amt.toFixed(2)}\n` +
        `Pi Paid: π ${parseFloat(piAmount).toString()}\n` +
        `Transaction: ${txid}\n\n` +
        `Delivery:\n${orderData.cus_address}\n${orderData.postcode} ${orderData.state_to}\n\n` +
        `Products:\n${orderData.prod_name}\n\n` +
        `✅ Payment verified on Pi Blockchain`
      );
      
      // Store order ID
      sessionStorage.setItem('completedOrderId', orderData.order_id);
      
      // Show alert
      alert('✅ Payment Successful!\n\nRedirecting to WhatsApp...');
      
      // ✅ Direct assignment (not blocked)
      window.location.assign(`https://wa.me/60168101358?text=${whatsappMsg}`);
    })
    .catch(err => {
      alert('Payment completion failed: ' + err.message);
    });
},

onCancel: (paymentId) => {
  console.log('❌ Cancelled:', paymentId);
  alert('Payment cancelled.');
},

        onError: (error, payment) => {
          console.error('❌ Payment error:', error);
          
          let msg = error.message || 'Unknown error';
          if (msg.includes('pending payment')) {
            msg = '⚠️ You have a pending payment.\n\nRefresh page to cancel it.';
          } else if (msg.includes('insufficient')) {
            msg = '💰 Insufficient Pi balance.';
          } else if (msg.includes('payment scope')) {
            msg = '🔐 Authentication required.\n\nRefresh page.';
          }
          
          alert(`Payment Failed\n\n${msg}`);
        }
      });

    } catch (error) {
      console.error('❌ Create payment error:', error);
      throw error;
    }
  },

  // Approve payment on backend
  async approvePayment(paymentId, orderId) {
    const response = await fetch(`${this.API_BASE_URL}/api/pi/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: paymentId, order_id: orderId })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Approval failed');
    return result;
  },

  // Complete payment on backend
  async completePayment(paymentId, txid, orderId) {
    const response = await fetch(`${this.API_BASE_URL}/api/pi/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_id: paymentId, txid, order_id: orderId })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Completion failed');
    return result;
  }
};

// Auto-initialize with delay
if (typeof Pi !== 'undefined') {
  const initDelay = 1500; // Wait for checkout.html to finish
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => PiPayment.initialize(), initDelay);
    });
  } else {
    setTimeout(() => PiPayment.initialize(), initDelay);
  }
}

// Export globally
window.PiPayment = PiPayment;
