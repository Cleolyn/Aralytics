import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import app from './app.js';
import fileContent from './services/fileContent.js';
import { cleanupStale } from './services/fileService.js';

app.locals.env = env;
app.listen(5001);
const handler = httpServerHandler({ port: 5001 });

export default {
  async fetch(request, bindings, context) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) {
      return bindings.ASSETS.fetch(request);
    }
    // File bytes bypass Express so uploads and downloads stay streamed and cheap.
    if (fileContent.match(pathname, request.method)) {
      return fileContent.handle(request, bindings);
    }
    return handler.fetch(request, bindings, context);
  },

  // Daily cron (see "triggers" in wrangler.jsonc): remove abandoned and unattached uploads.
  async scheduled(_controller, bindings, context) {
    context.waitUntil(cleanupStale(bindings, Date.now()));
  }
};
