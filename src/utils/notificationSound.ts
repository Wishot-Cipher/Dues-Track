/**
 * Notification Sound Utility
 * Generates pleasant notification sounds using Web Audio API
 */

class NotificationSound {
  private audioContext: AudioContext | null = null;

  constructor() {
    // Don't create AudioContext in constructor - wait for user interaction
  }

  /**
   * Initialize or resume the AudioContext
   * Must be called after user interaction (click, touch, etc.)
   */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    try {
      if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioContext = new AudioContextClass();
      }

      // Resume if suspended (happens on page load before user interaction)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      return this.audioContext;
    } catch {
      return null;
    }
  }

  /**
   * Play a pleasant notification sound
   * @param type - Type of notification (success, info, warning)
   */
  play(type: 'success' | 'info' | 'warning' = 'info') {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Create oscillator for the tone
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      // Set frequencies based on notification type
      const frequencies = {
        success: [523.25, 659.25], // C5 to E5 (happy sound)
        info: [523.25, 587.33],    // C5 to D5 (neutral sound)
        warning: [493.88, 440.00], // B4 to A4 (attention sound)
      };

      const [freq1, freq2] = frequencies[type];

      // Create a pleasant two-tone notification sound
      oscillator.frequency.setValueAtTime(freq1, now);
      oscillator.frequency.setValueAtTime(freq2, now + 0.1);

      // Smooth volume envelope
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01);
      gainNode.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.3);

      // Play the sound
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } catch {
      // Sound failed silently
    }
  }

  /**
   * Play a modern "ding" sound for new notifications
   */
  playDing() {
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Create a bell-like sound using multiple oscillators
      const frequencies = [800, 1000, 1200];
      
      frequencies.forEach((freq, index) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = freq;
        oscillator.type = 'sine';

        // Stagger the start times slightly for a richer sound
        const startTime = now + (index * 0.02);
        
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15 / (index + 1), startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);

        oscillator.start(startTime);
        oscillator.stop(startTime + 0.4);
      });
    } catch {
      // Sound failed silently
    }
  }
}

// Export singleton instance
export const notificationSound = new NotificationSound();
