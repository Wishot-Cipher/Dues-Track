/**
 * Haptic feedback utility for mobile devices.
 * Uses the Vibration API for a premium tactile feel.
 */

export const haptics = {
  /** Light tap — button presses, toggles */
  light() {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  /** Medium tap — confirmations, selections */
  medium() {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },

  /** Heavy tap — destructive actions, errors */
  heavy() {
    if ('vibrate' in navigator) {
      navigator.vibrate(40);
    }
  },

  /** Success pattern — double pulse */
  success() {
    if ('vibrate' in navigator) {
      navigator.vibrate([15, 50, 15]);
    }
  },

  /** Error pattern — triple short pulse */
  error() {
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 30, 30, 30, 30]);
    }
  },

  /** Warning — single longer pulse */
  warning() {
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  },
};

export default haptics;
