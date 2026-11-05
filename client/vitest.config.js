import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component tests (jsdom + Testing Library). Kept separate from vite.config.js so
// tests never depend on Clerk keys or the dev-server proxy.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    restoreMocks: true,
    testTimeout: 15000
  }
});
