# Cloudflare deployment

Live site: https://aralytics.cleolyn.dev

The React SPA is served by Workers Static Assets. Express runs through
`cloudflare:node` with `nodejs_compat`. Turso remains the application database,
and Clerk remains the authentication provider.

## Free plan file storage

This account is on Workers Free with no payment method, so R2 is not available and
is not used. Uploaded files are stored as binary chunks in several D1 databases
("shards"), and the metadata (owner, size, status, which lesson or submission it
belongs to) lives in the `files` table in Turso.

How it works:

- The browser reserves a file (`POST /api/files`), uploads it one 1 MiB part per
  request (`PUT /api/files/:id/parts/:n?sig=`), then completes it. A part is one D1
  upsert and makes no Turso call, so a request stays well inside the free plan's
  CPU time (about 10 ms) and the 50-queries-per-invocation limit. Failed parts are
  retried by the client without restarting the file.
- Downloads (`GET /api/files/:id/content?sig=`) stream from D1, reading four chunks
  per query, and support `Range` requests so video seeking and PDF viewers work.
- Both byte routes are answered by `worker.js` before Express runs. They use
  short-lived HMAC links (`?sig=`) because iframes, `<video>`, plain links and the
  offline cache cannot send an Authorization header. The API puts a fresh link in
  `download_url` for each file the signed-in person may read. Links last six hours,
  so revoking access can take up to six hours to reach someone who already holds one.
- A daily cron (`17 3 * * *`) deletes uploads that were never completed or never
  attached to a lesson or submission after 24 hours.
- Each file goes to the shard with the most free space that can hold it. The site
  total is the smaller of 3.5 GB and 450 MB times the number of shards.

Cloudflare Free limits apply (100,000 Worker requests a day, about 17 for a 15 MB
upload; 500 MB per D1 database; 10 databases per account, one of which is already
used by older uploads); exceeding them causes service errors rather than an
automatic upgrade. Do not upgrade Workers or activate R2 without reviewing billing.

### Limits

Defined in `server/src/config/fileLimits.js`; each can be overridden with a Worker
variable (`vars` in `wrangler.jsonc`) or an environment variable.

| Variable | Default |
|---|---|
| `FILES_TEACHER_MAX_FILE` / `FILES_TEACHER_QUOTA` | 15 MB / 1 GB |
| `FILES_STUDENT_MAX_FILE` / `FILES_STUDENT_QUOTA` | 10 MB / 50 MB |
| `FILES_SHARD_CAP_BYTES` | 450 MB per D1 database |
| `FILES_SITE_CAP_BYTES` | 3.5 GB (also limited by shards bound times the shard cap) |
| `FILES_CHUNK_BYTES` | 1 MiB (512 KiB is an option if requests approach the CPU limit; never change it once files exist) |
| `FILES_READ_GROUP` | 4 chunks per download query |

Allowed types: lessons `.pdf .pptx .ppt .mp4 .docx .doc .zip`; submissions add
`.png .jpg .jpeg`; personal files add `.gif .webp`. SVG is never accepted, the
Content-Type is set by the server from the extension, and PDF/Office/ZIP files are
checked for their file signature when the upload completes.

### Create the shards (one time)

`wrangler.jsonc` binds `FILES_DB_1` (the existing `aralytics-uploads` database, which
also still holds older base64 uploads) and `FILES_DB_2` to `FILES_DB_8` with the
placeholder id `TODO-create-with-wrangler`. Create as many as you need (start with
one or two; 8 databases give the full 3.5 GB) and paste each returned id over the
placeholder:

```sh
npx wrangler d1 create aralytics-files-2
npx wrangler d1 create aralytics-files-3
```

Remove the bindings you do not need, or the deploy script will stop on the
placeholder ids. Then set the signing secret and deploy:

```sh
npx wrangler secret put FILE_TOKEN_SECRET   # a long random string, set once
npm run deploy:cloudflare
```

Do not change `FILE_TOKEN_SECRET` casually: doing so invalidates every open
download and upload link until pages are reloaded.

## Deploy again

Install the client and server dependencies, then run from the repository root:

```sh
npm run deploy:cloudflare
```

This builds the frontend, prepares PDFKit's Workers-compatible bundle, initializes
the Turso schema (including the `files` table), applies the D1 migrations to every
`FILES_DB_*` database with `scripts/apply-d1-migrations.cjs`, and deploys the Worker,
cron trigger and custom domain. `node scripts/apply-d1-migrations.cjs --dry-run`
prints the migration commands without running them. Wrangler is pinned to the
Cloudflare account that owns `cleolyn.dev`.

The required secrets are set in Cloudflare: `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and
`FILE_TOKEN_SECRET`. (`JWT_SECRET` is no longer read by the server and can be deleted.)
Use `npx wrangler secret put NAME` to update them. Never commit their values.
The current Clerk keys belong to a development instance. Changing to a Clerk
production instance requires updating both the server secrets and the frontend
publishable key, then rebuilding.

## Checks

```sh
curl https://aralytics.cleolyn.dev/api/health
curl https://aralytics.cleolyn.dev/api/test-db
curl -I https://aralytics.cleolyn.dev/
npm run build:cloudflare && npx wrangler deploy --dry-run --outdir .cloudflare/dry
npm run test:server
```

The server tests run against a disposable local SQLite database and fake D1 shards
(`server/test/file_storage_flow.test.js`); they cover uploads, ranged downloads,
permissions, limits, shard choice, cleanup, the older base64 files and the
local-disk fallback. After deploying, sign in as an admin and open
**Instructor access → Storage** to watch usage per shard and per person, and test one
real upload and download of a lesson file in the browser. A real classroom workflow
on the free plan (especially a 15 MB upload on a slow connection) has not been
exercised yet.
