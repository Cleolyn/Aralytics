import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const clientEnv = loadEnv(mode, process.cwd(), '');
  const serverEnv = loadEnv(mode, path.resolve(process.cwd(), '../server'), '');
  const publishableKey =
    clientEnv.VITE_CLERK_PUBLISHABLE_KEY ||
    clientEnv.CLERK_PUBLISHABLE_KEY ||
    serverEnv.VITE_CLERK_PUBLISHABLE_KEY ||
    serverEnv.CLERK_PUBLISHABLE_KEY ||
    '';

  return {
    plugins: [react()],
    envPrefix: ['VITE_'],
    define: {
      'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify(publishableKey),
      'process.env': {
        VITE_CLERK_PUBLISHABLE_KEY: publishableKey,
        CLERK_PUBLISHABLE_KEY: publishableKey
      }
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5001',
          changeOrigin: true
        }
      }
    }
  };
});
