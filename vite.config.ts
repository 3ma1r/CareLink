import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const unusedJspdfOptionalModule = fileURLToPath(
  new URL('./src/reports/jspdf-optional.ts', import.meta.url),
)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      manifest: {
        name: 'CareLink — Care, connected.',
        short_name: 'CareLink',
        description: 'CareLink brings patient wearable updates to caregivers.',
        theme_color: '#061822',
        background_color: '#061822',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        dontCacheBustURLsMatching: /[.-][a-zA-Z0-9_-]{8}\.(js|css|woff2)$/,
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  resolve: {
    // CareLink builds reports with jsPDF's text/vector APIs only. Keep its unused
    // HTML/SVG converters resolvable without shipping their optional dependencies.
    alias: {
      canvg: unusedJspdfOptionalModule,
      html2canvas: unusedJspdfOptionalModule,
      dompurify: unusedJspdfOptionalModule,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          maps: ['leaflet'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: { port: 3000 },
})
