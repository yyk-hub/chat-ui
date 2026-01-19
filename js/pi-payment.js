// Pi Network Payment Handler - Version 17 - Proper SDK Flow
// Last Updated: 2025-01-18
// Follows official Pi SDK payment flow documentation

const PiPayment = {
  PI_EXCHANGE_RATE: 1.0, // Fallback default
  API_BASE_URL: window.location.origin,
  incompletePayment: null,
  isInitialized: false,
  isAuthenticated: false,

  setExchangeRate(rate) {
    if (rate && rate > 0) {
      this.PI_EXCHANGE_RATE = rate;
      console.log('💱 Exchange rate updated:', rate);
    }
  },

  rmToPi(rmAmount) {
    return (rmAmount / this.PI_EXCHANGE_RATE).toFixed(8);
  },

  resetButton() {
    const btn = document.getElementById('confirmBtn');
    if (!btn) return;
    
    console.log('🔄 Resetting confirm button...');
    btn.disabled = false;
    btn.textContent = '☑️ Confirm Pi Order';
    btn.style.opacity = '1';
    btn.style.cursor = 'pointer';
    btn.style.background = '#14b47e';
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

      await Pi.init({
        version: "2.0",
        sandbox: isSandbox
      });

      console.log(`✅ Pi SDK initialized in ${isSandbox ? 'SANDBOX' : 'PRODUCTION'} mode`);
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

  async authenticateWithPayments() {
    if (this.isAuthenticated) {
      console.log('✅ Already authenticated');
      return;
    }

    try {
      console.log('🔐 Authenticating with payment scope...');

      const scopes = ['payments'];

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
      this.resetButton();
      throw error;
    }
  },

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

      if (!this.isAuthenticated) {
        console.log('🔐 Authenticating now...');
        await this.authenticateWithPayments();
      }

      const piAmount = parseFloat(this.rmToPi(orderData.total_amt));

      console.log('💳 Payment details:', {
        amount: piAmount,
        order_id: orderData.order_id
      });

      // PHASE I: Payment Creation and Server-Side Approval
      Pi.createPayment({
        amount: piAmount,
        memo: `Order ${orderData.order_id} - ${orderData.prod_name.substring(0, 50)}`,
        metadata: {
          order_id: orderData.order_id,
          customer_name: orderData.cus_name,
          total_rm: orderData.total_amt
        }
      }, {
        // PHASE I - Step 2: SDK passes PaymentID to app for server approval
        onReadyForServerApproval: (paymentId) => {
          console.log('📝 PHASE I: onReadyForServerApproval - PaymentID:', paymentId);
          
          // PHASE I - Step 3: Send PaymentID to our server
          // PHASE I - Step 4: Our server calls Pi /approve API
          this.approvePayment(paymentId, orderData.order_id)
            .then(() => {
              console.log('✅ PHASE I Complete: Payment approved by server');
              // PHASE II now happens automatically (user interaction + blockchain tx)
            })
            .catch(err => {
              console.error('❌ Server approval failed:', err);
            });
        },

        // PHASE III - Step 1: SDK passes TxID to app for server completion
        onReadyForServerCompletion: (paymentId, txid) => {
          console.log('🎯 PHASE III: onReadyForServerCompletion - TxID:', txid);
          
          // PHASE III - Step 2: Send TxID to our server
          // PHASE III - Step 3: Our server calls Pi /complete API
          this.completePayment(paymentId, txid, orderData.order_id)
            .then(() => {
              console.log('✅ PHASE III Complete: Payment acknowledged by server');
              
              // PHASE III - Step 4: Payment flow will close automatically
              // After /complete returns 200, Pi SDK closes the wallet
              
              // Prepare order data for the next page
              localStorage.removeItem('cartItems');
              localStorage.setItem('orderPlaced', `${orderData.order_id}_${Date.now()}`);
              localStorage.setItem('lastOrderPhone', orderData.phone);
              
              const piAmount = orderData.pi_amount || (orderData.total_amt / this.PI_EXCHANGE_RATE).toFixed(8);
              const whatsappMessage = 
                `🎉 Pi Payment Completed!\n\n` +
                `Order ID: ${orderData.order_id}\n` +
                `Customer: ${orderData.cus_name}\n` +
                `Phone: ${orderData.phone}\n` +
                `Total: RM ${orderData.total_amt.toFixed(2)}\n` +
                `Pi Paid: π ${parseFloat(piAmount).toString()}\n` +
                `Transaction: ${txid}\n\n` +
                `Delivery:\n${orderData.cus_address}\n${orderData.postcode} ${orderData.state_to}\n\n` +
                `Products:\n${orderData.prod_name}\n\n` +
                `✅ Payment verified on Pi Blockchain`;
              
              sessionStorage.setItem('piPaymentSuccess', JSON.stringify({
                order_id: orderData.order_id,
                whatsapp_message: whatsappMessage,
                timestamp: Date.now()
              }));
              
              // Store redirect target - will be handled after wallet closes
              sessionStorage.setItem('piPaymentComplete', orderData.order_id);
              
              console.log('💡 Data saved. Pi SDK will close wallet automatically.');
              console.log('🔜 Redirect will happen when wallet closes and page becomes visible.');
            })
            .catch(err => {
              console.error('❌ Server completion failed:', err);
              alert('Payment completion failed: ' + err.message);
              this.resetButton();
            });
        },

        onCancel: (paymentId) => {
          console.log('❌ Payment cancelled by user:', paymentId);
          
          fetch(`${this.API_BASE_URL}/api/pi/cancel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              payment_id: paymentId, 
              order_id: orderData.order_id 
            })
          })
          .then(res => res.json())
          .then(data => console.log('Cancel response:', data))
          .catch(err => console.error('Cancel notification failed:', err));
          
          this.resetButton();
          alert('Payment cancelled.\n\nYou can try again.');
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
          this.resetButton();
        }
      });

    } catch (error) {
      console.error('❌ Create payment error:', error);
      this.resetButton();
      throw error;
    }
  },

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
  const initDelay = 1500;
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => PiPayment.initialize(), initDelay);
    });
  } else {
    setTimeout(() => PiPayment.initialize(), initDelay);
  }
}

// ✅ CRITICAL: Handle navigation after Pi SDK closes the wallet
// According to Pi docs: "The payment flow closes. Your app is now visible to the user again."
// This happens AFTER /complete returns 200
if (typeof document !== 'undefined') {
  console.log('🔧 Setting up Pi payment completion handlers...');
  
  let redirecting = false; // Prevent duplicate redirects
  
  // Listen for when the page becomes visible (wallet closed)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || redirecting) return;
    
    const completedOrderId = sessionStorage.getItem('piPaymentComplete');
    if (completedOrderId) {
      console.log('👁️ Page visible again - wallet closed by Pi SDK');
      console.log('🔄 Preparing to redirect...');
      
      redirecting = true;
      sessionStorage.removeItem('piPaymentComplete');
      
      // Reset button IMMEDIATELY
      const btn = document.getElementById('confirmBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '☑️ Confirm Pi Order';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.background = '#14b47e';
        console.log('✅ Button reset');
      }
      
      // Show loading message
      if (typeof showToast === 'function') {
        showToast('✅ Payment successful! Loading order...', 'success', 2000);
      }
      
      // Navigate immediately (don't wait)
      console.log('🔄 Redirecting to order page NOW...');
      window.location.href = `/order.html?success=1&order_id=${completedOrderId}`;
    }
  });
  
  // Backup: Also check on window focus (some browsers don't fire visibilitychange)
  let focusHandled = false;
  window.addEventListener('focus', () => {
    if (focusHandled || redirecting) return;
    
    const completedOrderId = sessionStorage.getItem('piPaymentComplete');
    if (completedOrderId) {
      console.log('🎯 Window focused - wallet closed');
      
      focusHandled = true;
      redirecting = true;
      sessionStorage.removeItem('piPaymentComplete');
      
      // Reset button
      const btn = document.getElementById('confirmBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = '☑️ Confirm Pi Order';
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.style.background = '#14b47e';
        console.log('✅ Button reset (focus)');
      }
      
      console.log('🔄 Redirecting to order page NOW (focus)...');
      window.location.href = `/order.html?success=1&order_id=${completedOrderId}`;
    }
  });
  
  // Additional safety: Check for stuck payment on page load
  window.addEventListener('load', () => {
    setTimeout(() => {
      if (redirecting) return;
      
      const completedOrderId = sessionStorage.getItem('piPaymentComplete');
      if (completedOrderId) {
        console.log('⚠️ Found completed payment on page load - redirecting...');
        
        redirecting = true;
        sessionStorage.removeItem('piPaymentComplete');
        
        window.location.href = `/order.html?success=1&order_id=${completedOrderId}`;
      }
    }, 1000);
  });
}

// Export globally
window.PiPayment = PiPayment;
