// Isolated UI fixture: never imported by the app or included in a production build.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const fixture = resolve('client/test/enrollment-fixtures.jsx');
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.taste-skill/vite-enrollment-cache', optimizeDeps: { entries: ['client/test/enrollment-preview.html'] }, plugins: [
  { name: 'isolated-enrollment-identities', enforce: 'pre', resolveId(source) {
    if (source.endsWith('/context/AuthContext') || source === '@clerk/react') return fixture;
  } }, react()
], server: { port: 3011, host: '127.0.0.1', strictPort: true } });
await server.listen();
console.log('Isolated UI fixture: http://127.0.0.1:3011/client/test/enrollment-preview.html');
