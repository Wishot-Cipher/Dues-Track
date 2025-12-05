/**
 * Notification Sound Utility
 * Generates pleasant notification sounds using Web Audio API
 * Enhanced for reliable playback across all browsers
 */

class NotificationSound {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private pendingResume: Promise<void> | null = null;
  private initAttempts = 0;
  private maxInitAttempts = 5;

  constructor() {
    // Set up initialization on first user interaction
    if (typeof window !== 'undefined') {
      const initHandler = () => {
        this.initialize();
      };
      
      // Add listeners for all common user interactions
      const events = ['click', 'touchstart', 'keydown', 'mousedown', 'pointerdown'];
      events.forEach(event => {
        document.addEventListener(event, initHandler, { passive: true, capture: true });
      });

      // Also try to initialize immediately if document is already interactive
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        // Delay slightly to ensure browser is ready
        setTimeout(() => this.initialize(), 100);
      }
    }
  }

  /**
   * Initialize the AudioContext
   * Must be called after user interaction
   */
  initialize(): void {
    if (this.isInitialized || typeof window === 'undefined') return;
    
    this.initAttempts++;
    
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      if (!this.audioContext) {
        this.audioContext = new AudioContextClass();
      }
      
      // Resume immediately if suspended
      if (this.audioContext.state === 'suspended') {
        this.pendingResume = this.audioContext.resume().then(() => {
          this.isInitialized = true;
          console.log('🔊 Audio context initialized and ready');
        }).catch(() => {
          // Will retry on next interaction
          if (this.initAttempts < this.maxInitAttempts) {
            this.isInitialized = false;
          }
        });
      } else if (this.audioContext.state === 'running') {
        this.isInitialized = true;
        console.log('🔊 Audio context already running');
      }
    } catch (e) {
      console.warn('Failed to initialize AudioContext:', e);
    }
  }

  /**
   * Force initialize - call this when you need to ensure audio is ready
   * Returns true if audio is ready to play
   */
  async forceInit(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    
    this.initialize();
    
    if (this.pendingResume) {
      try {
        await this.pendingResume;
      } catch {
        // Ignore
      }
    }
    
    return this.isReady();
  }

  /**
   * Ensure AudioContext is ready to play sounds
   */
  private async ensureContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;

    try {
      // Initialize if not done yet
      if (!this.isInitialized || !this.audioContext) {
        this.initialize();
      }

      if (!this.audioContext) {
        console.warn('AudioContext not available');
        return null;
      }

      // Wait for any pending resume
      if (this.pendingResume) {
        try {
          await this.pendingResume;
        } catch {
          // Continue anyway
        }
        this.pendingResume = null;
      }

      // Resume if suspended - this is common after page becomes visible again
      if (this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
          console.log('🔊 Audio context resumed from suspended state');
        } catch (e) {
          console.warn('Failed to resume AudioContext:', e);
          return null;
        }
      }

      if (this.audioContext.state !== 'running') {
        console.warn('AudioContext not in running state:', this.audioContext.state);
        return null;
      }

      return this.audioContext;
    } catch (e) {
      console.warn('AudioContext error:', e);
      return null;
    }
  }

  /**
   * Play a pleasant notification sound
   * @param type - Type of notification (success, info, warning)
   */
  async play(type: 'success' | 'info' | 'warning' = 'info'): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx) {
      console.warn('Cannot play notification sound - audio context not ready');
      return;
    }

    try {
      console.log(`🔊 Playing ${type} notification sound`);
      const now = ctx.currentTime;

      // Create oscillator for the tone
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Set frequencies based on notification type
      const frequencies = {
        success: [659.25, 783.99], // E5 to G5 (happy ascending)
        info: [523.25, 659.25],    // C5 to E5 (neutral)
        warning: [440.00, 392.00], // A4 to G4 (attention descending)
      };

      const [freq1, freq2] = frequencies[type];

      // Create a pleasant two-tone notification sound
      oscillator.frequency.setValueAtTime(freq1, now);
      oscillator.frequency.setValueAtTime(freq2, now + 0.15);

      // Louder volume envelope for better noticeability
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.6, now + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.5, now + 0.15);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

      // Play the sound
      oscillator.start(now);
      oscillator.stop(now + 0.45);
    } catch (e) {
      console.warn('Failed to play notification sound:', e);
    }
  }

  /**
   * Play a modern "ding" sound for new notifications
   * This is a louder, more noticeable bell-like sound
   */
  async playDing(): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx) {
      console.warn('Cannot play ding sound - audio context not ready');
      return;
    }

    try {
      console.log('🔔 Playing ding notification sound');
      const now = ctx.currentTime;

      // Create a pleasant bell-like sound using harmonics
      const baseFreq = 880; // A5
      const harmonics = [1, 2, 3, 4, 5]; // More harmonics for richer sound
      
      harmonics.forEach((harmonic) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = baseFreq * harmonic;
        oscillator.type = 'sine';

        // Louder volume that decreases for higher harmonics
        const volume = 0.4 / (harmonic * harmonic);
        
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        oscillator.start(now);
        oscillator.stop(now + 0.6);
      });

      // Add a second "ding" for emphasis (like a doorbell)
      setTimeout(() => {
        void this.playSecondDing();
      }, 180);
    } catch (e) {
      console.warn('Failed to play ding sound:', e);
    }
  }

  /**
   * Second part of the ding sound (slightly higher pitch)
   */
  private async playSecondDing(): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const baseFreq = 1046.50; // C6
      const harmonics = [1, 2, 3];

      harmonics.forEach((harmonic) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = baseFreq * harmonic;
        oscillator.type = 'sine';

        const volume = 0.35 / (harmonic * harmonic);

        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        oscillator.start(now);
        oscillator.stop(now + 0.5);
      });
    } catch {
      // Silently fail
    }
  }

  /**
   * Check if audio is ready to play
   */
  isReady(): boolean {
    return this.isInitialized && this.audioContext?.state === 'running';
  }
}

// Export singleton instance
export const notificationSound = new NotificationSound();
