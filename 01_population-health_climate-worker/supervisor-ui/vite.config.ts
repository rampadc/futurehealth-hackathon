import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:8001' },
    // Design tokens live in ../ui_design_system (shared with the wireframes).
    // Relative entries resolve from the Vite root (this folder).
    fs: { allow: ['.', '../ui_design_system'] } },
  test: { environment: 'jsdom', setupFiles: ['./src/testSetup.ts'] },
});
