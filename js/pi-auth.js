// pi-auth.js - Add this to your Pi site
// Include this script in all pages that need Pi authentication

(function() {
  'use strict';

  // Pi Auth Manager
  const PiAuth = {
    user: null,
    accessToken: null,

    // Initialize and authenticate user
    async authenticate() {
      try {
        // Check if Pi SDK is loaded
        if (typeof Pi === 'undefined') {
          console.error('Pi SDK not loaded');
          return null;
        }

        // Authenticate with Pi
        const scopes = ['username', 'payments'];
        const authResult = await Pi.authenticate(scopes, onIncompletePaymentFound);
        
        this.user = authResult.user;
        this.accessToken = authResult.accessToken;
        
        // Store in sessionStorage
        sessionStorage.setItem('pi_user', JSON.stringify(this.user));
        sessionStorage.setItem('pi_token', this.accessToken);
        
        console.log('Pi Authentication successful:', this.user);
        return this.user;
        
      } catch (error) {
        console.error('Pi Authentication failed:', error);
        return null;
      }
    },

    // Get current user from session
    getCurrentUser() {
      if (this.user) return this.user;
      
      const storedUser = sessionStorage.getItem('pi_user');
      if (storedUser) {
        this.user = JSON.parse(storedUser);
        this.accessToken = sessionStorage.getItem('pi_token');
        return this.user;
      }
      
      return null;
    },

    // Sign out
    signOut() {
      this.user = null;
      this.accessToken = null;
      sessionStorage.removeItem('pi_user');
      sessionStorage.removeItem('pi_token');
    },

    // Check if user is authenticated
    isAuthenticated() {
      return this.getCurrentUser() !== null;
    }
  };

  // Handle incomplete payments (required by Pi SDK)
  function onIncompletePaymentFound(payment) {
    console.log('Incomplete payment found:', payment);
    // Handle incomplete payment - show UI to complete it
    // You can store this and show a notification
    return Pi.openPaymentDialog(payment.identifier);
  }

  // Auto-authenticate on page load if in Pi Browser
  window.addEventListener('load', async () => {
    // Check if running in Pi Browser
    const isPiBrowser = typeof Pi !== 'undefined';
    
    if (isPiBrowser && !PiAuth.isAuthenticated()) {
      // Show loading indicator
      showPiAuthLoading();
      
      // Authenticate
      const user = await PiAuth.authenticate();
      
      if (user) {
        // Update UI with user info
        updateUIWithPiUser(user);
      } else {
        alert('Pi authentication failed. Please try again.');
      }
      
      hidePiAuthLoading();
    }
  });

  // UI Helper Functions
  function showPiAuthLoading() {
    const loader = document.createElement('div');
    loader.id = 'pi-auth-loader';
    loader.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7); z-index: 9999;
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 18px;
    `;
    loader.innerHTML = '<div>🥧 Connecting to Pi Network...</div>';
    document.body.appendChild(loader);
  }

  function hidePiAuthLoading() {
    const loader = document.getElementById('pi-auth-loader');
    if (loader) loader.remove();
  }

  function updateUIWithPiUser(user) {
    // Update header with Pi username
    const headerTitle = document.querySelector('.header-title');
    if (headerTitle) {
      headerTitle.innerHTML = `☕ CEO Shop <span style="font-size:12px; color:#14b47e;">(${user.username})</span>`;
    }
    
    // Show welcome message
    const container = document.querySelector('.container');
    if (container && !document.getElementById('pi-welcome')) {
      const welcome = document.createElement('div');
      welcome.id = 'pi-welcome';
      welcome.style.cssText = `
        background: linear-gradient(135deg, #7b2cbf 0%, #5a189a 100%);
        color: white; padding: 12px 16px; border-radius: 12px;
        margin-bottom: 16px; text-align: center;
        box-shadow: 0 4px 12px rgba(123,44,191,0.3);
      `;
      welcome.innerHTML = `
        <strong>🥧 Welcome, ${user.username}!</strong><br>
        <small>Pay with Pi • Earn rewards • Join the future</small>
      `;
      container.insertBefore(welcome, container.firstChild);
    }
  }

  // Expose PiAuth globally
  window.PiAuth = PiAuth;

})();
