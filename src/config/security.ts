/**
 * Security Configuration
 * ----------------------
 * This module provides security measures to protect the application.
 * 
 * @license PROPRIETARY - See LICENSE file
 * @copyright Dev_Wishot - @wishotstudio
 * @author Dev_Wishot
 */

// Authorized domains for deployment
export const AUTHORIZED_DOMAINS = [
  'localhost',
  '127.0.0.1',
  // Add your production domain here, e.g.:
  // 'class-dues-tracker.vercel.app',
  // 'your-custom-domain.com',
];

// Environment validation
export const validateEnvironment = (): boolean => {
  const currentHost = window.location.hostname;
  
  // In development, allow localhost
  if (import.meta.env.DEV) {
    return true;
  }
  
  // Check if running on authorized domain
  const isAuthorized = AUTHORIZED_DOMAINS.some(domain => 
    currentHost === domain || currentHost.endsWith(`.${domain}`)
  );
  
  if (!isAuthorized) {
    console.error('⚠️ Unauthorized deployment detected');
    return false;
  }
  
  return true;
};

// Disable developer tools in production (optional, can be removed if not needed)
export const initSecurityMeasures = (): void => {
  if (import.meta.env.PROD) {
    // Disable right-click context menu (optional - can be annoying for users)
    // document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Log warning about unauthorized access
    console.log(
      '%c⚠️ WARNING: This application is proprietary software.',
      'color: red; font-size: 20px; font-weight: bold;'
    );
    console.log(
      '%cUnauthorized copying, modification, or distribution is strictly prohibited.',
      'color: orange; font-size: 14px;'
    );
    console.log(
      '%c© ECE Class Dues Tracker Team. All rights reserved.',
      'color: gray; font-size: 12px;'
    );
    
    // Clear console after delay to hide implementation details
    setTimeout(() => {
      console.clear();
      console.log('%c🔒 Protected Application', 'color: green; font-size: 14px;');
    }, 100);
  }
};

// Watermark for identifying unauthorized copies
export const APP_SIGNATURE = {
  name: 'Class Dues Tracker',
  version: '1.0.0',
  organization: 'ECE Department',
  developer: 'Dev_Wishot',
  twitter: '@wishotstudio',
  buildDate: new Date().toISOString().split('T')[0],
  signature: 'DEV-WISHOT-CDT-2024',
};

// Feature flags for security controls
export const SECURITY_FLAGS = {
  // Enable domain validation
  validateDomain: import.meta.env.PROD,
  // Enable console warnings
  showWarnings: import.meta.env.PROD,
  // Enable rate limiting
  rateLimit: true,
  // Enable session timeout
  sessionTimeout: true,
  sessionTimeoutMinutes: 30,
};

export default {
  AUTHORIZED_DOMAINS,
  validateEnvironment,
  initSecurityMeasures,
  APP_SIGNATURE,
  SECURITY_FLAGS,
};
