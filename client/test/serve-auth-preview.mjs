import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: '.taste-skill/vite-auth-cache', optimizeDeps: { entries: ['client/test/auth-preview.html'] },
  define: { 'import.meta.env.VITE_CLERK_PUBLISHABLE_KEY': JSON.stringify('pk_test_isolated_fixture') },
  plugins: [{ name: 'isolated-clerk-adapter', enforce: 'pre', configureServer(vite) {
    vite.middlewares.use((req, _res, next) => {
      if (req.headers.accept?.includes('text/html') && !req.url.startsWith('/client/')) req.url = '/client/test/auth-preview.html';
      next();
    });
  }, resolveId(source) {
    if (source === '@clerk/react') return resolve('client/test/auth-clerk-fixture.jsx');
  } }, react()],
  server: { host: '127.0.0.1', port: 3013, strictPort: true }
});
await server.listen(); console.log('Auth fixture ready: http://127.0.0.1:3013/client/test/auth-preview.html');
