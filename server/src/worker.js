import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import app from './app.js';

app.locals.env = env;
app.listen(5001);
const handler = httpServerHandler({ port: 5001 });

export default {
  async fetch(request, bindings, context) {
    if (!new URL(request.url).pathname.startsWith('/api/')) {
      return bindings.ASSETS.fetch(request);
    }
    return handler.fetch(request, bindings, context);
  }
};
