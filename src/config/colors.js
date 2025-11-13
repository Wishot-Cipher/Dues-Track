/**
 * Design System - Warm Futuristic Amber Theme
 * Inspired by modern fintech with warm glows
 */

export const colors = {
  // Primary Colors (Warm Amber)
  primary: '#FF6803',
  primaryLight: '#FFAC5F',
  primaryDark: '#CC5202',
  
  // Secondary Colors (Deep Espresso)
  secondary: '#0F0703',
  secondaryLight: '#1A0E09',
  secondaryLighter: '#20140D',
  
  // Accent Colors
  accentMint: '#30FFAC',        // Neon Mint - positive actions
  accentGreen: '#16F456',       // Bright Success - paid status
  accentCyan: '#00E6FF',        // Electric Cyan - info
  accentPurple: '#8A2BE2',      // Soft Purple - charts
  
  // Text Colors
  textPrimary: '#FFFFFF',       // Main text
  textSecondary: '#B8B8B8',     // Labels, secondary text
  textTertiary: '#7A7A7A',      // Muted text
  textDisabled: '#4A4A4A',      // Disabled state
  
  // Status Colors (Non-conflicting)
  statusPaid: '#16F456',        // Bright Green
  statusUnpaid: '#FF4D4D',      // Hot Coral Red
  statusPartial: '#FFC300',     // Amber Yellow
  statusPending: '#30FFAC',     // Neon Mint
  statusRejected: '#FF4D4D',    // Red
  statusWaived: '#8A2BE2',      // Purple
  
  // Semantic Colors
  success: '#16F456',
  warning: '#FFC300',
  error: '#FF4D4D',
  info: '#30FFAC',
  
  // Border Colors
  borderLight: 'rgba(255, 255, 255, 0.1)',
  borderMedium: 'rgba(255, 255, 255, 0.2)',
  borderHeavy: 'rgba(255, 255, 255, 0.3)',
  borderPrimary: 'rgba(255, 104, 3, 0.3)',
};

// Gradient Presets
export const gradients = {
  primary: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
  secondary: 'linear-gradient(135deg, #30FFAC 0%, #16F456 100%)',
  accent: 'linear-gradient(135deg, #00E6FF 0%, #8A2BE2 100%)',
  warm: 'linear-gradient(135deg, #FF6803 0%, #CC5202 100%)',
  cool: 'linear-gradient(135deg, #30FFAC 0%, #00E6FF 100%)',
  glass: 'linear-gradient(135deg, rgba(255, 104, 3, 0.1) 0%, rgba(48, 255, 172, 0.05) 100%)',
  radialWarm: 'radial-gradient(circle, #FF6803 0%, transparent 70%)',
  radialMint: 'radial-gradient(circle, #30FFAC 0%, transparent 70%)',
  radialPurple: 'radial-gradient(circle, #8A2BE2 0%, transparent 70%)',
};

// Glow/Shadow Effects
export const glows = {
  amber: '0 0 30px rgba(255, 104, 3, 0.5)',
  amberStrong: '0 0 40px rgba(255, 104, 3, 0.7)',
  mint: '0 0 30px rgba(48, 255, 172, 0.5)',
  green: '0 0 30px rgba(22, 244, 86, 0.5)',
  cyan: '0 0 30px rgba(0, 230, 255, 0.5)',
  purple: '0 0 30px rgba(138, 43, 226, 0.5)',
  red: '0 0 30px rgba(255, 77, 77, 0.5)',
  yellow: '0 0 30px rgba(255, 195, 0, 0.5)',
};

// Glass Morphism Styles
export const glass = {
  light: {
    background: 'rgba(26, 14, 9, 0.6)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    boxShadow: '0 8px 32px 0 rgba(255, 104, 3, 0.1), inset 0 0 20px rgba(48, 255, 172, 0.05)',
  },
  medium: {
    background: 'rgba(32, 20, 13, 0.8)',
    backdropFilter: 'blur(25px)',
    border: '1px solid rgba(255, 104, 3, 0.3)',
    boxShadow: '0 12px 48px 0 rgba(255, 104, 3, 0.3)',
  },
  strong: {
    background: 'rgba(26, 14, 9, 0.95)',
    backdropFilter: 'blur(30px)',
    border: '1px solid rgba(255, 104, 3, 0.4)',
    boxShadow: '0 20px 60px 0 rgba(255, 104, 3, 0.4)',
  },
};

export default { colors, gradients, glows, glass };