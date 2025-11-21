// pi-auth.js - Fixed version
// Only authenticates when needed, not on page load

(function() {
  'use strict';

  const PiAuth = {
    user: null,
    accessToken: null,
    scopes: null,

    // Authenticate user (call this before payment)
    async authenticate() {
      try {
        if (typeof Pi === 'undefined') {
          console.error('Pi SDK not loaded');
          throw new Error('Pi SDK not available');
        }

        console.log('🔐 Authenticating with Pi...');
        
        // Request username and payments scope
        const authResult = await Pi.authenticate(
          ['username', 'payments'], 
          onIncompletePaymentFound
        );
        
        this.user = authResult.user;
        this.accessToken = authResult.accessToken;
        this.scopes = authResult.scopes;
        
        // Store in sessionStorage
        sessionStorage.setItem('pi_user', JSON.stringify(this.user));
        sessionStorage.setItem('pi_token', this.accessToken);
        sessionStorage.setItem('pi_scopes', JSON.stringify(this.scopes));
        
        console.log('✅ Authentication successful');
        console.log('User:', this.user.username);
        console.log('Scopes:', this.scopes);
        
        return authResult;
        
      } catch (error) {
        console.error('❌ Authentication failed:', error);
        throw error;
      }
    },

    // Get current user from session
    getCurrentUser() {
      if (this.user) return this.user;
      
      const storedUser = sessionStorage.getItem('pi_user');
      if (storedUser) {
        this.user = JSON.parse(storedUser);
        this.accessToken = sessionStorage.getItem('pi_token');
        
        const storedScopes = sessionStorage.getItem('pi_scopes');
        if (storedScopes) {
          this.scopes = JSON.parse(storedScopes);
        }
        
        return this.user;
      }
      
      return null;
    },

    // Check if user has payment scope
    hasPaymentScope() {
      if (!this.scopes && sessionStorage.getItem('pi_scopes')) {
        this.scopes = JSON.parse(sessionStorage.getItem('pi_scopes'));
      }
      return this.scopes && this.scopes.includes('payments');
    },

    // Sign out
    signOut() {
      this.user = null;
      this.accessToken = null;
      this.scopes = null;
      sessionStorage.removeItem('pi_user');
      sessionStorage.removeItem('pi_token');
      sessionStorage.removeItem('pi_scopes');
    },

    // Check if authenticated
    isAuthenticated() {
      return this.getCurrentUser() !== null;
    }
  };

  // Handle incomplete payments
  function onIncompletePaymentFound(payment) {
    console.log('⚠️ Incomplete payment found:', payment);
    // Show dialog to complete
    const complete = confirm(
      `You have an incomplete payment of ${payment.amount} Pi.\n\n` +
      `Would you like to complete it now?`
    );
    
    if (complete) {
      return Pi.openPaymentDialog(payment.identifier);
    }
  }

  // Expose PiAuth globally
  window.PiAuth = PiAuth;
  
  // DO NOT auto-authenticate on page load
  // Let the payment flow handle authentication when needed
  console.log('✅ PiAuth loaded (auth will happen on payment)');

})();
