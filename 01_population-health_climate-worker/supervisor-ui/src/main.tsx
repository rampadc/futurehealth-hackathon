import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { AccessBoundary } from './AccessBoundary';
import { theme } from './theme';
import '../../ui_design_system/tokens.css';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline /><AccessBoundary>{lock => <App onLockAccess={lock} />}</AccessBoundary></ThemeProvider></React.StrictMode>,
);

// Offline app shell for phones (worker offline state). Production builds only, so Vite's dev server is never cached.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* Offline shell is optional. */ }); });
}
