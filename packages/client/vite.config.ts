import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** Dev: allow ngrok / custom Host header. Override via VITE_ALLOWED_HOSTS (comma-separated). */
function resolveAllowedHosts(): true | string[] {
  const raw = process.env.VITE_ALLOWED_HOSTS?.trim();
  if (!raw) return true;
  const hosts = raw.split(',').map((h) => h.trim()).filter(Boolean);
  return hosts.length > 0 ? hosts : true;
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      minify: false,
      manifest: {
        name: 'Roads Tour',
        short_name: 'RoadsTour',
        description: 'Guidage GPS convoi automobile',
        theme_color: '#D14F8B',
        background_color: '#F1F1F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: resolveAllowedHosts(),
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
