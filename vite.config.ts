/**
 * Vite configuration for Travel Tracker frontend.
 *
 * Entry point: src/frontend/main.tsx
 * Build output: dist/ (served by Express in production / Electron)
 * Dev server: http://localhost:5173 (proxies API calls to Express at :3001)
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  // Root of the Vite project — index.html lives here
  root: '.',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },

  server: {
    port: 5173,
    host: '0.0.0.0',
    // Proxy /api and /geo requests to the Express backend during development.
    // This avoids CORS issues and mirrors the production configuration where
    // Express serves both the static frontend and the API.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/geo': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
