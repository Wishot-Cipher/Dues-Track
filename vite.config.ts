import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'app-icon.png'],
      manifest: {
        name: 'Payvexo - By Wishot',
        short_name: 'Payvexo',
        description: 'Modern payment & dues management platform. Track payments, manage dues, and stay organized.',
        theme_color: '#FF6803',
        background_color: '#0F0703',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        categories: ['finance', 'education', 'utilities'],
        icons: [
          {
            src: '/app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/app-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/app-icon.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/app-icon.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024 // 5MB limit
      },
      devOptions: {
        enabled: false // Disable in dev for faster reload
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 1455,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  // Production Build Optimizations & Protection
  build: {
    // Minify with terser for better obfuscation
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug'], // Remove specific functions
        passes: 2, // Multiple compression passes
      },
      mangle: {
        // Mangle variable and function names (but NOT properties - breaks React/framer-motion)
        toplevel: true,
        // IMPORTANT: Do NOT mangle properties - it breaks React, framer-motion, and other libraries
        // that rely on specific property names like ._owner, .$$typeof, etc.
      },
      format: {
        comments: false, // Remove all comments
      },
    },
    // Split code for better caching
    rollupOptions: {
      output: {
        // Obfuscate chunk file names
        chunkFileNames: 'assets/[hash].js',
        entryFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
        // Manual chunk splitting to hide module structure
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          ui: ['framer-motion', 'lucide-react'],
          data: ['@supabase/supabase-js'],
        },
      },
    },
    // Increase chunk size warning threshold
    chunkSizeWarningLimit: 1000,
    // Source maps - disable in production for security
    sourcemap: false,
  },
  // Environment variable prefix for safety
  envPrefix: 'VITE_',
})