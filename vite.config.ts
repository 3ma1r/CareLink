import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'CareLink — Care, connected.',
        short_name: 'CareLink',
        description: 'Caregiver monitoring prototype · Demo sample data',
        theme_color: '#007b78',
        background_color: '#f4f8f8',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        dontCacheBustURLsMatching: /[.-][a-zA-Z0-9_-]{8}\.(js|css|woff2)$/,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], maps: ['leaflet'] } } },
  },
  server: { port: 3000 },
})
