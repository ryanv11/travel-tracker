/**
 * main.tsx — React application entry point.
 *
 * Sets up:
 *  - React 18 createRoot
 *  - TanStack Query (React Query) client with sensible defaults
 *  - BrowserRouter for client-side navigation
 *  - Global CSS reset (minimal — no external stylesheet dependency)
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';

/** Global CSS reset injected at runtime to avoid needing an external stylesheet. */
const globalStyle = document.createElement('style');
globalStyle.textContent = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  body { background: #F9FAFB; color: #111827; }
`;
document.head.appendChild(globalStyle);

/** React Query client — 5 minute stale time, 3 retries on failure. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 3,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in index.html');

createRoot(container).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
