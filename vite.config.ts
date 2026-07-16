/**
 * Vite configuration for Travel Tracker frontend.
 *
 * Entry point: src/frontend/main.tsx
 * Build output: dist/ (served by Express in production / Electron)
 * Dev server: http://localhost:5173 (proxies API calls to Express at :3001)
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

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

  // OP-11: `vite preview` (used by the CI E2E job — see playwright.config.ts) does NOT
  // inherit `server.proxy`; it is a separate config block. Without this, every /api and
  // /geo request from the built app would 404 under `vite preview`.
  preview: {
    port: 5173,
    host: '0.0.0.0',
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
