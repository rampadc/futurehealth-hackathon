import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  plugins: [react()],
  // HEAT_UI_PORT and HEAT_API_URL let a second checkout run beside the default ports.
  server: { host: '127.0.0.1', port: Number(env.HEAT_UI_PORT ?? 5174), strictPort: true, proxy: { '/api': env.HEAT_API_URL ?? 'http://127.0.0.1:8001' },
    // Design tokens live in ../ui_design_system (shared with the wireframes).
    // Relative entries resolve from the Vite root (this folder).
    fs: { allow: ['.', '../ui_design_system'] } },
  test: { environment: 'jsdom', setupFiles: ['./src/testSetup.ts'] },
});
