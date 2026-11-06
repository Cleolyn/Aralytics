# Aralytics — Ponce AP10 Learning Hub

A web-based LMS, assessment engine, and automated intervention system for **DepEd Araling Panlipunan 10 (Kontemporaryong Isyu)**, aligned with the **ILAW Framework** — *Intentions, Learning Experiences, Assessment, Ways Forward*.

- **Teachers** manage classes and enrollment codes, publish, edit, archive and delete lessons, quizzes and performance tasks, post class announcements, grade performance tasks, review proctoring flags, act on remediation recommendations, and export gradebooks (XLSX) and DepEd monitoring reports (PDF).
- **Learners** join a class with an adviser-issued code, see their adviser's lessons (with offline downloads), quizzes, tasks and announcements, take proctored quizzes, submit performance tasks, and follow suggested practice.
- **The admin** approves instructor applications, manages people (suspend, revoke instructor access, delete accounts), reviews an activity log, and watches file storage. Instructors and learners each have a private **My files** space.
- **Email notifications** (optional, free Resend plan) tell people about application decisions, enrollment decisions, grades, suspensions and announcements. Email stays off until a key is configured.

Every quiz submission is graded against the server answer key and immediately updates the gradebook, competency mastery, and remediation queue.

---

## Contents

- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation and setup](#installation-and-setup)
- [Running the app](#running-the-app)
- [Database](#database)
- [Testing](#testing)
- [Script reference](#script-reference)
- [Deploying](#deploying)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Project status](#project-status)
- [Further documentation](#further-documentation)

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Client | React 18, React Router 7, Vite 6, PWA service worker |
| API | Node.js, Express 5 |
| Authentication | [Clerk](https://clerk.com) (Google and verified email) |
| Database | SQLite (default, via Node's built-in `node:sqlite`), Turso/libSQL, or MySQL |
| Reports | SheetJS (`xlsx`), PDFKit |

The repository is an **npm workspaces** monorepo: one `npm install` at the root installs both packages.

## Project structure

```text
.
├── client/                    React PWA (Vite)
│   ├── public/                Static assets, manifest, service worker (sw.js)
│   ├── src/
│   │   ├── components/        Shared UI (layout, navigation, dialogs, illustrations)
│   │   ├── context/           AuthContext (Clerk session + account sync)
│   │   ├── hooks/             Data-loading hooks
│   │   ├── pages/             Route screens; large pages are folders (index.jsx + parts)
│   │   │   └── __tests__/     Component tests (Vitest + Testing Library)
│   │   ├── routes/            AppRoutes (role-based routing)
│   │   ├── services/          API client and account sync
│   │   ├── test/              Shared test setup and render helpers
│   │   └── utils/             Auth flow, learning, files, device storage, offline helpers
│   ├── test/                  Auth-flow test + optional browser regression harness
│   └── vite.config.js         Dev server (port 3000) proxies /api → :5001
├── server/                    Express REST API
│   ├── resources/materials/   Older lesson files served at /api/materials/download/:file (signed link or sign-in)
│   ├── uploads/               Local-disk uploads: files/ (current) and performance-tasks/ (older), git-ignored, back this up
│   ├── src/
│   │   ├── app.js             Express app (middleware + routes)
│   │   ├── server.js          Entry point: load .env, init database, listen
│   │   ├── worker.js          Cloudflare Workers entry (wraps app.js)
│   │   ├── config/            Database adapter (sqlite | turso | mysql)
│   │   ├── controllers/       Request handlers
│   │   ├── db/                Schema init, MySQL schema, demo/test seeds
│   │   ├── middleware/        Clerk auth, role guards, error handler
│   │   ├── routes/            Route definitions under /api
│   │   └── services/          Analytics, enrollment, answer grading
│   └── test/                  Test suites + runner (test/run.js)
├── docs/                      Brand, auth/enrollment, Cloudflare deployment, design refs, sample reports
├── scripts/                   dev.js (API + client together), prepare-worker.cjs (Workers build)
└── wrangler.jsonc             Cloudflare Workers configuration
```

## Prerequisites

- **Node.js 22.13 or newer** (local SQLite uses Node's built-in `node:sqlite` module). Check with `node -v`.
- **npm 10+** (bundled with Node).
- **A Clerk account** — free at [dashboard.clerk.com](https://dashboard.clerk.com). Sign-in does not work without it.
- *Optional:* a [Turso](https://turso.tech) database or a MySQL 8 server if you don't want local SQLite.

## Installation and setup

### 1. Clone and install

```bash
git clone <repository-url> aralytics
cd aralytics
npm install
```

This installs dependencies for both `server/` and `client/`.

### 2. Create a Clerk application

1. In the [Clerk dashboard](https://dashboard.clerk.com), create an application.
2. Under **User & authentication**, enable **Google** and **Email** sign-in, and require **email verification**. Disable phone, username, and other social providers.
3. Under **Paths / Redirect URLs**, allow `/sso-callback` and your app origin (`http://localhost:3000` for development).
4. Copy the **Publishable key** (`pk_…`) and **Secret key** (`sk_…`) from **API keys**.

The full Clerk checklist for production is in [docs/enrollment-and-auth.md](docs/enrollment-and-auth.md).

### 3. Configure environment variables

```bash
cp server/.env.example server/.env
# Optional — the client falls back to server/.env if this file is missing:
cp client/.env.example client/.env
```

Edit `server/.env`:

| Variable | Required | Description |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (`sk_…`). |
| `CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (`pk_…`). |
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes* | Same publishable key for the client. *Can live in `client/.env` instead. |
| `PORT` | No | API port (default `5001`). The Vite proxy expects `5001`. |
| `DB_DIALECT` | No | `sqlite` (default), `turso`, or `mysql`. |
| `DB_SQLITE_PATH` | No | SQLite file, relative to `server/` (default `aralytics.sqlite`). |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | For Turso | libSQL URL and token. If the URL is set and `DB_DIALECT` is not, Turso is used. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | For MySQL | MySQL connection. |
| `CORS_ORIGIN` | No | Comma-separated allowed origins (default: all). Set this in production. |

> `.env` files are git-ignored. Never commit real keys.

### 4. Start the app

```bash
npm run dev
```

- Client: <http://localhost:3000>
- API health check: <http://localhost:5001/api/health>

On first start the API creates all tables and seeds the AP10 curriculum (quarters, topics, ILAW competencies). It does **not** create demo accounts.

### 5. Create the admin, then approve instructors

Accounts are created the first time someone signs in through Clerk, and every new account is a **student**. Roles come only from the Aralytics database (Clerk metadata is ignored):

| Role | How it is granted | Workspace |
| --- | --- | --- |
| `STUDENT` | Automatically on first sign-in | `/student/*` after joining a class |
| `TEACHER` | An admin approves the person's instructor application | `/teacher/*` |
| `ADMIN` | `npm run admin:grant` (server CLI) | `/admin` |

**Make the first admin.** Have the person sign in once, then run against the target database (`server/.env`):

```bash
npm run admin:grant -- admin@example.com           # preview
npm run admin:grant -- admin@example.com --apply   # make the change
```

`ADMIN` replaces the account's previous role. Admins verify instructors; they don't use the teacher or student workspaces.

**Instructors apply; the admin approves.**
1. The instructor chooses **I am a Teacher** on the home page (`/login?role=TEACHER`). Existing instructors go straight to the teacher workspace; new ones sign up and land on the instructor application (`/instructor/apply`) instead of the class-code screen, where they submit their name, school, position, mobile number, and optional employee ID. (The onboarding screen also links to the application.)
2. The admin reviews it under **Instructor access** (`/admin`) and either approves it (the account becomes a teacher) or returns it with a reason. A returned applicant can correct the details and resubmit.

Accounts enrolled as students in a class can't apply; instructors should use a separate account.

### 6. Enroll students

1. As a teacher, open **Classes** and generate a class code (school year + section names). The code is shown **once** — copy it.
2. Students sign up with Google or email, enter the code, then fill in LRN, name, mobile, and section.
3. The teacher approves the request; the student can then access lessons and assessments.

## Running the app

| Command | What it does |
| --- | --- |
| `npm run dev` | API (auto-restart on change) + Vite client together. Ctrl+C stops both. |
| `npm run dev:server` | API only, on port 5001. |
| `npm run dev:client` | Client only, on port 3000 (needs the API for `/api`). |
| `npm run build` | Production build of the client to `client/dist/`. |
| `npm start` | API in production mode (no watcher). |

## Database

The API talks to the database through one adapter (`server/src/config/database.js`), so the same code runs on all three dialects.

**SQLite (default).** No setup needed; the file `server/aralytics.sqlite` is created on first start. Back it up together with `server/uploads/`. Database files are git-ignored.

**Turso.** Create a database, then set `DB_DIALECT=turso`, `TURSO_DATABASE_URL`, and `TURSO_AUTH_TOKEN`.

**MySQL.** Create the database, load `server/src/db/schema.mysql.sql`, then set `DB_DIALECT=mysql` and the `DB_*` connection variables.

### Initialize or seed manually

```bash
npm run db:init     # create/upgrade tables and seed the curriculum (also runs on API start)
npm run db:seed     # add demo data for local development (SQLite only)
npm run db:samples  # db:seed + regenerate the example reports in docs/sample-outputs/
```

`db:seed` adds demo teachers, eight learners in 10-Rizal and 10-Bonifacio, a CBDRRM quiz covering all six question formats, graded attempts in every mastery tier, proctoring flags, remedial materials, interventions, and performance tasks. It is meant for exploring the dashboards and analytics locally. Demo records have no passwords and can't be signed into; sign in with your own Clerk account and they appear in your teacher views.

The seed refuses to write to Turso or MySQL unless you pass `--allow-remote` (`npm run db:seed --workspace server -- --allow-remote`). Don't seed a school's live database.

### Lesson files

Teachers upload lesson files from **Lessons → Add lesson**, or add HTTPS links instead. Learners upload task submissions from **Activities**, and every teacher and learner has a personal **My files** page.

Uploads are chunked: the browser reserves the file (`POST /api/files`), sends it in 1 MiB parts (`PUT /api/files/:id/parts/:n`), then completes it. Bytes are stored in Cloudflare D1 shards on the Worker, or on local disk (`server/uploads/files/`, or `FILES_LOCAL_ROOT`) in ordinary Node development. Nothing is public: files open from short-lived signed links (`?sig=`, valid six hours) that the API adds to lessons and submissions as `download_url`, only for people allowed to read them (the lesson's teacher and that teacher's approved learners; the submitting learner and their teacher or the task's creator; owner only for personal files; admins can read and delete).

Default limits (override with the `FILES_*` variables in `server/.env.example`, or Worker vars on Cloudflare; all in `server/src/config/fileLimits.js`):

| | Per file | Total per person |
|---|---|---|
| Teachers | 15 MB | 1 GB |
| Learners | 10 MB | 50 MB |

The whole site is capped at the smaller of 3.5 GB and 450 MB times the number of bound D1 shards. Base64 uploads are no longer accepted; older base64 files keep working through signed links. Set `FILE_TOKEN_SECRET` on any production host: the server refuses to sign links in production without it.

## Testing

```bash
npm test             # server suites, then client tests
npm run test:server  # server only
npm run test:client  # client only (auth flow + component tests)
npm run test:watch --workspace client   # component tests in watch mode
```

**Client component tests** live in `client/src/**/*.test.{js,jsx}` and run in jsdom with [Vitest](https://vitest.dev) and [Testing Library](https://testing-library.com). They render real pages inside a router with the API mocked, and assert what users see and what is sent to the API: filters and URL state, dialogs, uploads, saved drafts and quiz sessions, offline handling, and error messages. Run them before and after changing a page.

The server runner (`server/test/run.js`) always creates a **fresh temporary SQLite database**, seeds the demo fixtures, runs each suite, and deletes it afterward. It ignores the database settings in `server/.env`, so tests never touch Turso, MySQL, or your working database.

Run selected suites by name:

```bash
npm test --workspace server -- enrollment_flow srs_compliance
```

**Optional live HTTP checks.** `redesign_flow` can also exercise a running API (create a learner, upload a document, grade it, submit a quiz). Start the API against a separate, disposable database first, then:

```bash
ARALYTICS_TEST_URL=http://127.0.0.1:5001 ARALYTICS_DISPOSABLE_DB=yes npm run test:redesign --workspace server
```

**Browser regression harness (optional).** See [docs/enrollment-and-auth.md](docs/enrollment-and-auth.md#verification). Screenshots are written to `.taste-skill/` (git-ignored).

## Script reference

Root scripts (run from the repository root):

| Script | Description |
| --- | --- |
| `dev` | Run API and client together |
| `dev:server` / `dev:client` | Run one side only |
| `start` | Start the API without a file watcher |
| `build` / `preview` | Build / preview the production client |
| `db:init` / `db:seed` / `db:samples` | Database setup and demo data |
| `admin:grant` | Give an existing account the ADMIN role (`-- <email> [--apply]`) |
| `test` / `test:server` / `test:client` | Test suites |
| `build:cloudflare` | Client build + Workers module shims (`.cloudflare/`) |
| `deploy:cloudflare` | Build, init the Turso schema, apply D1 migrations to every file shard, and deploy the Worker |

Any workspace script can be run directly with `npm run <script> --workspace server` or `--workspace client`.

## Deploying

### Cloudflare Workers (current production)

The live site runs on Cloudflare Workers: the SPA is served as static assets and Express runs via `nodejs_compat`, with Turso as the database and sharded D1 databases for uploaded files (no R2 needed). After `npm install` and `npx wrangler login`:

```bash
npm run deploy:cloudflare
```

Secrets (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `FILE_TOKEN_SECRET`) are set with `npx wrangler secret put NAME`. Free-plan limits, storage details, and post-deploy checks are in [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md). To check the bundle without deploying: `npm run build:cloudflare && npx wrangler deploy --dry-run`.

### Any Node host

1. Build the client: `npm run build`. Serve `client/dist/` as a static single-page app (fallback all routes to `index.html`).
2. Run the API with `npm start` and production environment variables (use a production Clerk instance, set `NODE_ENV=production` and `CORS_ORIGIN`).
3. Route `/api/*` on the client's origin to the API (reverse proxy or platform rewrite). The Express app does not serve the client build.
4. Register the production origin and `/sso-callback` in Clerk.
5. Persist and back up the database and `server/uploads/`. Set `FILE_TOKEN_SECRET` (a long random string) so signed file links work in production.

The enrollment code-attempt limiter is in-memory and per process; use a shared limiter before running multiple API instances.

## How it works

### Access boundaries

- **Admin** (`/admin`): reviews instructor applications; the **People** tab suspends and unsuspends accounts, revokes instructor access and deletes accounts (typed-email confirmation; accounts that still own lessons, quizzes or tasks cannot be deleted); the **Activity** tab is a read-only audit log of every admin action; the **Storage** tab shows file usage. See [docs/admin-and-accounts.md](docs/admin-and-accounts.md).
- **Teacher:** curriculum, quizzes, gradebook, proctoring audit trail, proficiency profiling, remediation decisions, XLSX/PDF exports, class codes and enrollment approvals, and class announcements. Only the creator (or an admin) can edit, archive or delete a quiz or task. Graded work is never destroyed: quizzes that students have taken can only be archived. See [docs/teaching-content.md](docs/teaching-content.md).
- **Student:** sees only the lessons, quizzes, tasks and announcements of their approved adviser. Students can read only their own records; every learning API requires an approved enrollment.
- **Suspended accounts** get `403 ACCOUNT_SUSPENDED` from every private API and see an "Account suspended" page with the admin's reason.
- Every private API verifies the Clerk session and requires a verified primary email.

### Announcements

Teachers post from **Announcements**: title, message, optional pin, an optional attachment from **My files**, and an optional email to the class. Learners see the latest three on their dashboard and the full list with unread markers on their Announcements page. See [docs/announcements.md](docs/announcements.md).

### Offline behavior (PWA)

- **Works offline:** explicitly downloaded same-origin lesson files and the learner's cached reading logs (synced when back online).
- **Online only:** quizzes, proctoring, grading, submissions, and exports. Account and assessment APIs are never cached.
- Offline data is stored per learner; don't use a shared browser profile for private sessions.

### Assessments and proctoring

Quizzes support six formats: multiple choice, true/false, identification (with accepted aliases), matching, situational, and PISA-style data analysis. The runner saves answers and the deadline per learner on the device, blocks repeat submissions, and keeps the timer running through connection loss. Tab switches and window blur are logged; reaching the quiz's limit flags the attempt.

### Analytics and intervention engine

| Endpoint (teacher only) | Purpose |
| --- | --- |
| `GET /api/analytics/proficiency` | Cohort mastery per competency: **Mastered** ≥ 85%, **Developing** 70–84%, **Needs Intervention** < 70% |
| `GET /api/analytics/remediation-queue` | Learners below 70% with recommended remedial materials |
| `POST /api/analytics/intervention/:id/action` | `APPROVE`, `MODIFY` (choose a different material), or `OVERRIDE` |
| `GET /api/analytics/quizzes/:quiz_id/item-analysis` | Difficulty (P) and discrimination (D) indices per item |
| `GET /api/analytics/export/xlsx` | Master gradebook workbook |
| `GET /api/analytics/export/pdf` | DepEd monitoring report |

Example outputs are in [docs/sample-outputs/](docs/sample-outputs/).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Sign-in is unavailable … publishable key is missing" | Set `VITE_CLERK_PUBLISHABLE_KEY` in `client/.env` or `server/.env`, then restart `npm run dev`. |
| `No such built-in module: node:sqlite` | Upgrade to Node.js 22.13+. |
| "Could not connect to the account service" | The API isn't running or isn't on port 5001. Check <http://localhost:5001/api/health>. |
| An instructor only sees student screens | Their application hasn't been approved yet. An admin approves it at `/admin`. |
| Nobody can open `/admin` | No admin exists yet (for example after a database reset). Run `npm run admin:grant -- <email> --apply`. |
| `EADDRINUSE` on 3000 or 5001 | Another process is using the port. Stop it or change `PORT` (and the proxy target in `client/vite.config.js`). |
| Lesson shows "File missing" | Upload the file again from **Lessons**, or link an HTTPS resource. |
| A learner sees no lessons, quizzes or tasks | Their class request isn't approved yet, or their adviser has no content yet. Learners only see their own adviser's content. |
| "Account suspended" | An admin suspended the account. An admin can unsuspend it from **People**. |
| A quiz can't be deleted | Students have already taken it. Archive it instead; grades are kept. |
| No emails arrive | Email is off until `RESEND_API_KEY` and `MAIL_FROM` are set. See [docs/admin-and-accounts.md](docs/admin-and-accounts.md). |

## Project status

The full feature list, a done/missing checklist, and prioritized recommendations are in **[docs/project-status.pdf](docs/project-status.pdf)** (November 2026). The main gaps right now:

- Clerk still uses development (test) keys; move to a production instance.
- Email notifications are built but off until a Resend key and a verified sending domain are set up.
- A learner can belong to only one class, and the interface is English only.
- No CI, lint, rate limiting, automated backups, or end-to-end tests yet.
- File storage is capped at about 3.5 GB by the free Cloudflare plan.

## Further documentation

- [docs/project-status.pdf](docs/project-status.pdf) — feature list, checklist, gaps and recommendations
- [docs/teaching-content.md](docs/teaching-content.md) — editing, archiving and deleting quizzes and tasks; adviser-scoped student content
- [docs/admin-and-accounts.md](docs/admin-and-accounts.md) — People and Activity tabs, suspension, revoking access, account deletion, email notifications
- [docs/announcements.md](docs/announcements.md) — class announcements, attachments, read markers
- [docs/enrollment-and-auth.md](docs/enrollment-and-auth.md) — Clerk configuration, enrollment flow, rollout notes, verification
- [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md) — Workers deployment, sharded D1 file storage, free-plan limits
- [docs/brand.md](docs/brand.md) — design system: palette, typography, voice
- [docs/design/](docs/design/) — design reference screens
- [docs/sample-outputs/](docs/sample-outputs/) — example XLSX/PDF/JSON outputs
