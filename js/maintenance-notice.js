// maintenance-notice.js
// Centralized maintenance notice system
// Usage: Include this script in any page that should show maintenance notices

(function() {
  'use strict';
  
  const MAINTENANCE_API = '/api/admin/maintenance-notice';
  
  // CSS for maintenance notice
  const styles = `
    .maintenance-notice {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9999;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      animation: slideDown 0.3s ease;
    }
    
    .maintenance-notice.info {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
    }
    
    .maintenance-notice.warning {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: white;
    }
    
    .maintenance-notice.error {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      color: white;
    }
    
    .maintenance-notice.success {
      background: linear-gradient(135deg, #10b981, #059669);
      color: white;
    }
    
    .notice-content {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      line-height: 1.4;
    }
    
    .notice-icon {
      font-size: 20px;
      flex-shrink: 0;
    }
    
    .notice-text strong {
      font-weight: 600;
      display: block;
      margin-bottom: 2px;
    }
    
    .notice-close {
      background: rgba(255,255,255,0.2);
      border: none;
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
      flex-shrink: 0;
      transition: background 0.2s ease;
    }
    
    .notice-close:hover {
      background: rgba(255,255,255,0.3);
    }
    
    .notice-hidden {
      display: none;
    }
    
    @keyframes slideDown {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    body.notice-active {
      padding-top: 70px;
    }
  `;
  
  // Inject CSS
  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }
  
  // Create notice HTML
  function createNoticeElement() {
    const notice = document.createElement('div');
    notice.id = 'maintenanceNotice';
    notice.className = 'maintenance-notice notice-hidden';
    notice.innerHTML = `
      <div class="notice-content">
        <span class="notice-icon">🔧</span>
        <div class="notice-text">
          <strong id="noticeTitle">Loading...</strong>
          <span id="noticeMessage"></span>
        </div>
      </div>
      <button class="notice-close" onclick="window.closeMaintenanceNotice()" title="Dismiss">×</button>
    `;
    document.body.insertBefore(notice, document.body.firstChild);
    return notice;
  }
  
  // Load notice settings from backend
  async function loadNoticeSettings() {
    try {
      const res = await fetch(MAINTENANCE_API);
      
      if (!res.ok) {
        console.warn('Failed to load maintenance notice settings');
        return null;
      }
      
      const data = await res.json();
      
      if (data.success && data.notice) {
        return data.notice;
      }
      
      return null;
    } catch (err) {
      console.error('Error loading maintenance notice:', err);
      return null;
    }
  }
  
  // Show notice
  function showNotice(settings) {
    if (!settings || !settings.enabled) {
      return;
    }
    
    const notice = document.getElementById('maintenanceNotice');
    if (!notice) return;
    
    // Set type class
    notice.className = `maintenance-notice ${settings.type || 'info'}`;
    
    // Set content
    const icon = notice.querySelector('.notice-icon');
    const title = document.getElementById('noticeTitle');
    const message = document.getElementById('noticeMessage');
    
    if (icon) icon.textContent = settings.icon || '🔧';
    if (title) title.textContent = settings.title || 'Notice';
    if (message) message.textContent = settings.message || '';
    
    // Show notice
    notice.classList.remove('notice-hidden');
    document.body.classList.add('notice-active');
  }
  
  // Close notice (public function)
  window.closeMaintenanceNotice = function() {
    const notice = document.getElementById('maintenanceNotice');
    if (notice) {
      notice.classList.add('notice-hidden');
      document.body.classList.remove('notice-active');
    }
  };
  
  // Initialize on DOM ready
  function init() {
    injectStyles();
    createNoticeElement();
    
    loadNoticeSettings().then(settings => {
      if (settings) {
        showNotice(settings);
      }
    });
  }
  
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
