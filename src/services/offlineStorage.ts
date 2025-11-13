// Offline data persistence service
const STORAGE_KEYS = {
  PENDING_PAYMENTS: 'offline_pending_payments',
  CACHED_PAYMENT_TYPES: 'cached_payment_types',
  CACHED_DASHBOARD_DATA: 'cached_dashboard_data',
  LAST_SYNC: 'last_sync_timestamp'
};

export interface PendingPayment {
  id: string;
  payment_type_id: string;
  amount: number;
  transaction_ref: string;
  notes: string | null;
  payment_method: string;
  created_at: string;
  student_id: string;
  receipt_file?: File;
}

class OfflineStorageService {
  // Save pending payment for later submission
  savePendingPayment(payment: PendingPayment): void {
    try {
      const pending = this.getPendingPayments();
      pending.push(payment);
      localStorage.setItem(STORAGE_KEYS.PENDING_PAYMENTS, JSON.stringify(pending));
      console.log('💾 Payment saved for offline submission');
    } catch (error) {
      console.error('Error saving pending payment:', error);
    }
  }

  // Get all pending payments
  getPendingPayments(): PendingPayment[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PENDING_PAYMENTS);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error getting pending payments:', error);
      return [];
    }
  }

  // Remove a pending payment after successful submission
  removePendingPayment(id: string): void {
    try {
      const pending = this.getPendingPayments();
      const filtered = pending.filter(p => p.id !== id);
      localStorage.setItem(STORAGE_KEYS.PENDING_PAYMENTS, JSON.stringify(filtered));
      console.log('✅ Pending payment removed after sync');
    } catch (error) {
      console.error('Error removing pending payment:', error);
    }
  }

  // Clear all pending payments
  clearPendingPayments(): void {
    localStorage.removeItem(STORAGE_KEYS.PENDING_PAYMENTS);
  }

  // Cache payment types for offline viewing
  cachePaymentTypes(data: unknown): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CACHED_PAYMENT_TYPES, JSON.stringify(data));
      this.updateLastSync();
    } catch (error) {
      console.error('Error caching payment types:', error);
    }
  }

  getCachedPaymentTypes(): unknown | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CACHED_PAYMENT_TYPES);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached payment types:', error);
      return null;
    }
  }

  // Cache dashboard data
  cacheDashboardData(data: unknown): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CACHED_DASHBOARD_DATA, JSON.stringify(data));
      this.updateLastSync();
    } catch (error) {
      console.error('Error caching dashboard data:', error);
    }
  }

  getCachedDashboardData(): unknown | null {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CACHED_DASHBOARD_DATA);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Error getting cached dashboard data:', error);
      return null;
    }
  }

  // Update last sync timestamp
  updateLastSync(): void {
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  }

  getLastSync(): string | null {
    return localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
  }

  // Clear all offline data
  clearAllOfflineData(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    console.log('🗑️ All offline data cleared');
  }

  // Check if data is stale (older than 24 hours)
  isDataStale(): boolean {
    const lastSync = this.getLastSync();
    if (!lastSync) return true;

    const lastSyncTime = new Date(lastSync).getTime();
    const now = Date.now();
    const hoursSinceSync = (now - lastSyncTime) / (1000 * 60 * 60);

    return hoursSinceSync > 24;
  }
}

export const offlineStorage = new OfflineStorageService();
