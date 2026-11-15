import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { AccessBoundary } from './AccessBoundary';
import { theme } from './theme';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline /><AccessBoundary>{lock => <App onLockAccess={lock} />}</AccessBoundary></ThemeProvider></React.StrictMode>,
);
