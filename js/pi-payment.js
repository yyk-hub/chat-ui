// js/pi-payment.js
// Pi Network Payment Handler - Official Implementation with Fixed Cancel

const PiPayment = {
  PI_EXCHANGE_RATE: 2.0,
  API_BASE_URL: window.location.origin,
  incompletePayment: null,
  isInitialized: false,
  isAuthenticated: false,

  // Convert RM to Pi (8 decimal places for precision)
  rmToPi(rmAmount) {
    return (rmAmount / this.PI_EXCHANGE_RATE).toFixed(8);
  },

  // Initialize Pi SDK
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🔄 Initializing Pi Payment System...');
      
      // Detect if we're in sandbox or production
      const isSandbox = window.location.hostname.includes('sandbox') || 
                        window.location.search.includes('sandbox=true') ||
                        window.location.hostname === 'localhost';
      
      console.log('Environment:', {
        hasPiSDK: typeof Pi !== 'undefined',
        inIframe: window.self !== window.top,
        location: window.location.href,
        isSandbox: isSandbox
      });

      if (typeof Pi === 'undefined') {
        console.error('❌ Pi SDK not loaded');
        return false;
      }

      // Initialize Pi SDK with correct mode
      console.log(`Calling Pi.init with sandbox=${isSandbox}...`);
      await Pi.init({
        version: "2.0",
        sandbox: isSandbox  // Dynamic based on environment
      });

      console.log('✅ Pi SDK initialized in', isSandbox ? 'SANDBOX' : 'PRODUCTION', 'mode');

      // Authenticate with payments scope
      await this.authenticateWithPayments();

      this.isInitialized = true;
      return true;

    } catch (error) {
      console.error('❌ Pi initialization error:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack
      });
      
      // Show user-friendly error
      if (error.message?.includes('timed out')) {
        alert(
          '⚠️ CONNECTION TIMEOUT\n\n' +
          'Cannot connect to Pi Network.\n\n' +
          'Please ensure:\n' +
          '1. You opened this app through Pi Browser\n' +
          '2. You have a stable internet connection\n' +
          '3. Pi Browser is updated to latest version'
        );
      }
      
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

      // NOTE: Pi.init() should already be called in initialize()
      // Do NOT call Pi.init() here again!

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

      const auth = await Pi.authenticate(scopes, onIncompletePaymentFound);
      console.log(`✅ Hi there! You're ready to make payments!`);
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

    console.log('Full incomplete payment object:', this.incompletePayment);

    const paymentId = this.incompletePayment.identifier;
    const amount = this.incompletePayment.amount || 'unknown';
    const orderId = this.incompletePayment.metadata?.order_id || 'Unknown';
    const hasTxid = this.incompletePayment.transaction?.txid;
    const isDeveloperCompleted = this.incompletePayment.status?.developer_completed;
    
    console.log('Payment details:', { 
      paymentId, 
      amount, 
      orderId, 
      hasTxid,
      isDeveloperCompleted,
      status: this.incompletePayment.status 
    });

    // Check if we have a payment ID
    if (!paymentId) {
      alert('⚠️ Cannot process incomplete payment.\n\nPlease complete it in Pi Mobile App.');
      return;
    }

    // If already completed on Pi side but not in our system
    if (isDeveloperCompleted) {
      alert('This payment is already completed on Pi Network.\n\nSyncing with our system...');
      
      if (hasTxid) {
        await this.completePayment(paymentId, hasTxid, orderId);
      }
      
      this.incompletePayment = null;
      return;
    }
    
    // Build message based on transaction status
    let message;
    
    if (hasTxid) {
      // User submitted blockchain transaction but developer didn't complete
      message = 
        `⚠️ INCOMPLETE PAYMENT\n\n` +
        `Order: ${orderId}\n` +
        `Amount: ${amount} Pi\n` +
        `Status: Transaction submitted ✅\n\n` +
        `You made the blockchain transaction,\n` +
        `but it wasn't completed on our end.\n\n` +
        `Click OK to complete it now.`;
    } else {
      // Payment created but no blockchain transaction yet
      message = 
        `⚠️ PENDING PAYMENT\n\n` +
        `Order: ${orderId}\n` +
        `Amount: ${amount} Pi\n` +
        `Status: No blockchain transaction\n\n` +
        `This payment is blocking new orders.\n\n` +
        `Options:\n` +
        `OK = Cancel it (place new order)\n` +
        `Cancel = Keep it (complete in Pi App)`;
    }
    
    const userConfirmed = confirm(message);

    if (userConfirmed) {
      if (hasTxid) {
        // Complete the payment with existing txid
        console.log('Completing incomplete payment with txid:', hasTxid);
        await this.completeIncompletePayment(paymentId, hasTxid, orderId);
      } else {
        // Cancel in our system
        console.log('Cancelling payment without txid');
        await this.cancelPendingPayment(paymentId, orderId);
      }
    } else {
      console.log('User chose to keep the pending payment');
      alert(
        '📱 TO COMPLETE THIS PAYMENT:\n\n' +
        '1. Open Pi Mobile App\n' +
        '2. Go to Wallet → Payments\n' +
        '3. Find and complete this payment\n\n' +
        'Until completed, you cannot place new orders.\n' +
        'Payment expires in ~24 hours.'
      );
    }
  },

  // Complete an incomplete payment that has a txid
  async completeIncompletePayment(paymentId, txid, orderId) {
    console.log('🔄 Completing incomplete payment...', { paymentId, txid, orderId });

    try {
      // First, try to approve it (might already be approved)
      try {
        console.log('Attempting to approve payment...');
        await this.approvePayment(paymentId, orderId);
        console.log('✅ Payment approved');
      } catch (approveErr) {
        console.log('⚠️ Approval note:', approveErr.message);
        // Continue anyway - might already be approved or approval not needed
      }

      // Now complete it with the existing txid
      console.log('Completing payment with txid:', txid);
      const result = await this.completePayment(paymentId, txid, orderId);
      console.log('✅ Complete result:', result);
      
      this.incompletePayment = null;
      
      alert(
        '✅ PAYMENT COMPLETED!\n\n' +
        'Your incomplete payment has been processed.\n' +
        'You can now place new orders.\n\n' +
        `Order ID: ${orderId}`
      );
      
      // Redirect to order page
      setTimeout(() => {
        if (orderId && orderId !== 'Unknown') {
          window.location.href = `/order-success.html?order_id=${orderId}`;
        } else {
          window.location.reload();
        }
      }, 2000);

    } catch (error) {
      console.error('❌ Complete incomplete payment error:', error);
      
      // Show detailed error to help debug
      let errorMsg = error.message || 'Unknown error';
      
      // Check for specific error types
      if (errorMsg.includes('Server error: 500')) {
        errorMsg = 
          'Server error while completing payment.\n\n' +
          'Possible causes:\n' +
          '• Missing environment variables\n' +
          '• Pi API key invalid\n' +
          '• Wallet secret incorrect\n\n' +
          'Check server logs for details.';
      } else if (errorMsg.includes('Pi complete failed')) {
        errorMsg = 
          'Pi Network rejected the completion.\n\n' +
          'This usually means:\n' +
          '• Transaction ID (txid) is invalid\n' +
          '• Payment already completed\n' +
          '• App wallet secret incorrect';
      }
      
      alert(
        `❌ Failed to complete payment\n\n${errorMsg}\n\n` +
        `Payment ID: ${paymentId}\n` +
        `Transaction ID: ${txid}\n\n` +
        'Please contact support with this information.'
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
              
              // Show success message
              alert('✅ Payment successful!\n\nYour order has been placed.');
              
              // Try to redirect, with fallback
              setTimeout(() => {
                try {
                  // Try normal redirect first
                  window.location.href = `/order-success.html?order_id=${orderData.order_id}`;
                } catch (e) {
                  // If redirect fails in iframe, try parent window
                  try {
                    window.top.location.href = `/order-success.html?order_id=${orderData.order_id}`;
                  } catch (e2) {
                    // If both fail, just reload to clear state
                    console.log('Redirect blocked, reloading page');
                    window.location.reload();
                  }
                }
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

// Auto-initialize when Pi SDK loads - with proper timing
if (typeof Pi !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { 
      // Wait a bit for checkout.html detection to complete first
      setTimeout(() => PiPayment.initialize(), 1500);
    });
  } else {
    // Document already loaded
    setTimeout(() => PiPayment.initialize(), 1500);
  }
}

// Export globally
window.PiPayment = PiPayment;
