import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initTheme } from '@pantry-host/shared/theme';
import App from './App';
import './globals.css';

initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
