import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@pantry-host/shared/theme';
import { initDB } from '@/lib/db';
import App from './App';
import './globals.css';

// Initialize theme immediately
initTheme();

// Start PGlite initialization early (non-blocking)
initDB();

// Request persistent storage
if (navigator.storage?.persist) {
  navigator.storage.persist();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
