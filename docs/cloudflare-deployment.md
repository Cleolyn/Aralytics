# Cloudflare deployment

Live site: https://aralytics.cleolyn.dev

The React SPA is served by Workers Static Assets. Express runs through
`cloudflare:node` with `nodejs_compat`. Turso remains the application database,
and Clerk remains the authentication provider.

## Free plan storage

This account was verified as Workers Free before deployment. R2 was deliberately
not activated because it requires a subscription with possible usage charges.
Uploads use the `UPLOADS_DB` D1 binding instead. File content is base64 encoded
and split into 256 KiB text chunks, committed together in one D1 batch. Existing
performance-task files were copied and verified against their local originals.

Cloudflare Free plan limits apply; exceeding them causes service errors rather
than automatically upgrading the plan. Do not upgrade Workers or activate R2
without reviewing billing. D1 has a 500 MB limit per database on Free, within the
account-wide storage allowance; base64 adds roughly one third to file sizes.

The storage helper also supports an `UPLOADS` R2 binding if explicitly configured
in the future, and falls back to local disk during ordinary Node development.

## Deploy again

Install the client and server dependencies, then run from the repository root:

```sh
npm run deploy:cloudflare
```

This builds the frontend, prepares PDFKit's Workers-compatible bundle, initializes
the Turso schema, applies D1 migrations, and deploys the Worker and custom domain.
Wrangler is pinned to the Cloudflare account that owns `cleolyn.dev`.

The required secrets are set in Cloudflare: `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `CLERK_PUBLISHABLE_KEY`, and `CLERK_SECRET_KEY`. (`JWT_SECRET`
is no longer read by the server and can be deleted.)
Use `npx wrangler secret put NAME` to update them. Never commit their values.
The current Clerk keys belong to a development instance. Changing to a Clerk
production instance requires updating both the server secrets and the frontend
publishable key, then rebuilding.

## Checks

```sh
curl https://aralytics.cleolyn.dev/api/health
curl https://aralytics.cleolyn.dev/api/test-db
curl -I https://aralytics.cleolyn.dev/
node --test server/test/upload_storage.test.js
```

The local verification covered a 5 MB D1 upload round trip, deletion, atomic
replacement, local-disk fallback, and PDF generation within the Workers runtime.
Live verification covered API health, Turso connectivity, SPA deep links,
signed-out API protection, homepage rendering, and the sign-in page. An actual
signed-in classroom workflow was not exercised.
