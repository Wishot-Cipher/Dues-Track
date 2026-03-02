/**
 * App Badge Utility
 * Sets the app icon badge for PWA to show pending payment count
 * Uses the Badging API (Chrome/Edge) with fallback
 */

// Type for Navigator with optional Badging API methods
type BadgingNavigator = {
  setAppBadge?: (count: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

class AppBadge {
  private supported: boolean;
  private nav: BadgingNavigator;

  constructor() {
    this.nav = navigator as unknown as BadgingNavigator;
    this.supported = typeof this.nav.setAppBadge === 'function';
    console.log('🏷️ App Badge API supported:', this.supported);
  }

  /**
   * Set the app badge count
   * @param count Number to show on badge (0 clears the badge)
   */
  async setBadge(count: number): Promise<boolean> {
    if (!this.supported || !this.nav.setAppBadge || !this.nav.clearAppBadge) {
      console.log('🏷️ App Badge not supported in this browser');
      return false;
    }

    try {
      if (count > 0) {
        await this.nav.setAppBadge(count);
        console.log('🏷️ App badge set to:', count);
      } else {
        await this.nav.clearAppBadge();
        console.log('🏷️ App badge cleared');
      }
      return true;
    } catch (err) {
      console.error('🏷️ Failed to set app badge:', err);
      return false;
    }
  }

  /**
   * Clear the app badge
   */
  async clearBadge(): Promise<boolean> {
    return this.setBadge(0);
  }

  /**
   * Check if badge API is supported
   */
  isSupported(): boolean {
    return this.supported;
  }
}

export const appBadge = new AppBadge();
export default appBadge;
