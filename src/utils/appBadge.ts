/**
 * Utility for handling PWA application badging
 * Uses the Badging API where available
 */

class AppBadge {
    // Check if the Badging API is supported
    private isSupported(): boolean {
        return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
    }

    /**
     * Set the app badge to a specific number
     * @param count The number to display in the badge
     */
    async setBadge(count: number): Promise<void> {
        if (!this.isSupported()) return;

        try {
            if (count > 0) {
                await navigator.setAppBadge(count);
            } else {
                await navigator.clearAppBadge();
            }
        } catch (error) {
            console.error('Error setting app badge:', error);
        }
    }

    /**
     * Clear the app badge
     */
    async clearBadge(): Promise<void> {
        if (!this.isSupported()) return;

        try {
            await navigator.clearAppBadge();
        } catch (error) {
            console.error('Error clearing app badge:', error);
        }
    }
}

export const appBadge = new AppBadge();
