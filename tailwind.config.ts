/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary (Amber)
        primary: {
          DEFAULT: '#FF6803',
          light: '#FFAC5F',
          dark: '#CC5202',
        },
        
        // Secondary (Dark Brown/Black)
        secondary: {
          DEFAULT: '#0F0703',
          light: '#1A0E09',
          lighter: '#20140D',
        },
        
        // Accents
        accent: {
          mint: '#30FFAC',
          green: '#16F456',
          cyan: '#00E6FF',
          purple: '#8A2BE2',
        },
        
        // Status Colors
        status: {
          paid: '#16F456',
          unpaid: '#FF4D4D',
          partial: '#FFC300',
          pending: '#30FFAC',
          waived: '#8A2BE2',
        },
        
        // Semantic
        success: '#16F456',
        warning: '#FFC300',
        error: '#FF4D4D',
        info: '#30FFAC',
        
        // Text
        'text-primary': '#FFFFFF',
        'text-secondary': '#B8B8B8',
        'text-tertiary': '#7A7A7A',
        
        // Backgrounds
        'bg-primary': '#0F0703',
        'bg-secondary': '#1A0E09',
        'bg-tertiary': '#20140D',
      },
      
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
        'gradient-secondary': 'linear-gradient(135deg, #30FFAC 0%, #16F456 100%)',
        'gradient-accent': 'linear-gradient(135deg, #00E6FF 0%, #8A2BE2 100%)',
        'gradient-warm': 'linear-gradient(135deg, #FF6803 0%, #CC5202 100%)',
        'gradient-glass': 'linear-gradient(135deg, rgba(255, 104, 3, 0.1) 0%, rgba(48, 255, 172, 0.05) 100%)',
        'radial-warm': 'radial-gradient(circle, #FF6803 0%, transparent 70%)',
        'radial-mint': 'radial-gradient(circle, #30FFAC 0%, transparent 70%)',
        'radial-purple': 'radial-gradient(circle, #8A2BE2 0%, transparent 70%)',
      },
      
      boxShadow: {
        'glow-amber': '0 0 30px rgba(255, 104, 3, 0.5)',
        'glow-amber-strong': '0 0 40px rgba(255, 104, 3, 0.7)',
        'glow-mint': '0 0 30px rgba(48, 255, 172, 0.5)',
        'glow-green': '0 0 30px rgba(22, 244, 86, 0.5)',
        'glow-cyan': '0 0 30px rgba(0, 230, 255, 0.5)',
        'glow-purple': '0 0 30px rgba(138, 43, 226, 0.5)',
        'glow-red': '0 0 30px rgba(255, 77, 77, 0.5)',
        'glow-yellow': '0 0 30px rgba(255, 195, 0, 0.5)',
        'card': '0 8px 32px 0 rgba(255, 104, 3, 0.1), inset 0 0 20px rgba(48, 255, 172, 0.05)',
        'card-hover': '0 12px 48px 0 rgba(255, 104, 3, 0.3)',
      },
      
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-in': 'slideIn 0.3s ease-out',
      },
      
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        float: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '33%': { transform: 'translate(30px, -30px)' },
          '66%': { transform: 'translate(-30px, 30px)' },
        },
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}