# Admin and accounts

Package B gives admins control over accounts: a people directory, suspension, revoking instructor access, deleting accounts, an audit log, and optional email notifications.

Everything here is under `/api/admin` and requires an ADMIN session (`verifyIdentity` + `requireAdmin`). Every write records a row in the audit log.

## People tab

`GET /api/admin/users?q&role&status&page` returns `{ users, total }`, 50 per page. `q` matches email, full name, or LRN (case-insensitive). Each row has `id, email, full_name, role, status, suspended_reason, enrollment_status, adviser_name, created_at`.

In the admin dashboard, the **People** tab offers search, role and status filters, and per-row actions:

- Suspend or Unsuspend
- Revoke instructor (teachers only)
- Delete

You do not get actions on your own row.

## Suspension

| Endpoint | Body | Result |
|---|---|---|
| `POST /users/:id/suspend` | `{ reason }` (required, at most 300 characters) | `{ user }` |
| `POST /users/:id/unsuspend` | | `{ user }` |

A suspended account (`users.status = 'SUSPENDED'`) is refused by `verifyIdentity` on every protected route with `403 { code: 'ACCOUNT_SUSPENDED', suspended_reason }`. Only `/api/auth/sync` and `/api/auth/me` set `req.allowSuspended`, so the app can still load the profile (which now includes `status` and `suspended_reason`) and show the suspended page.

On the client:

- `accountHome()` returns `/suspended` for suspended accounts, and `ProtectedRoute` redirects there.
- `request()` dispatches the `auth:suspended` window event on `ACCOUNT_SUSPENDED`. `AuthContext` listens and calls `refreshUser`, so a session that was open when the account was suspended moves to the suspended page on its next API call.
- `SuspendedPage` shows the reason, "Contact your school administrator", **Check again**, and **Log out**.

Suspended people receive an `account.suspended` email if email is enabled.

## Revoking instructor access

`POST /users/:id/revoke-instructor` with `{ reason }` returns `{ user, closed_invitations, released_students }`. In one transaction it:

1. sets the role to STUDENT;
2. deactivates all the teacher's class codes;
3. rejects their PENDING and APPROVED enrollment requests with the reason "Your adviser's instructor access ended. Ask your new adviser for a class code.";
4. marks their instructor application REJECTED with "Instructor access revoked: <reason>", so they can apply again.

Lessons, quizzes, and tasks stay in place.

## Deleting an account

`DELETE /users/:id` with `{ confirm_email }` returns `{ id, removed_files }`.

Guards, in order: the account exists (`USER_NOT_FOUND`), it is not your own (`CANNOT_TARGET_SELF`), `confirm_email` matches ignoring case (`EMAIL_MISMATCH`), and it is not the last active admin (`LAST_ADMIN`). Accounts that own teaching content are refused with `409 ACCOUNT_OWNS_CONTENT { content: { lessons, quizzes, tasks, classes } }`; revoke instructor access instead.

Then, in order:

1. Delete the user in Clerk. A Clerk 404 counts as success; any other failure returns `502 CLERK_DELETE_FAILED` and leaves the database untouched.
2. Delete the account's stored files, including chunks in the D1 shards.
3. Remove announcements data if that feature's tables exist.
4. In one transaction, delete quiz attempts and security logs, quiz submissions with their answers and proctoring logs, remedial interventions, mastery rows, interventions, task submissions, read logs, enrollment request, instructor application, unused class codes, and finally the user row.
5. Write the `ACCOUNT_DELETED` audit row. The email is kept in `target_label`.

Because step 1 cannot be undone, a failure after it (a database error) leaves a Clerk-less account. Rerunning the delete works, because a missing Clerk user is treated as success.

## Audit log

Table `admin_audit_log` has no foreign keys, so history outlives the accounts it describes. `GET /audit?action&before&limit` returns `{ entries, next_before }`, newest first; pass `next_before` back as `before` for the next page. The **Activity** tab shows it with a "Load more" button.

Actions: `APPLICATION_APPROVED`, `APPLICATION_RETURNED`, `STORAGE_PURGED`, `INSTRUCTOR_REVOKED`, `ACCOUNT_SUSPENDED`, `ACCOUNT_UNSUSPENDED`, `ACCOUNT_DELETED`.

## Error codes

| Status | Code |
|---|---|
| 404 | `USER_NOT_FOUND` |
| 400 | `REASON_REQUIRED`, `EMAIL_MISMATCH`, `INVALID_FILTER` |
| 403 | `CANNOT_TARGET_SELF`, `ACCOUNT_SUSPENDED` |
| 409 | `NOT_INSTRUCTOR`, `ALREADY_SUSPENDED`, `NOT_SUSPENDED`, `LAST_ADMIN`, `ACCOUNT_OWNS_CONTENT` |
| 502 | `CLERK_DELETE_FAILED` |

## Email notifications

`server/src/services/notifier.js` sends mail through [Resend](https://resend.com). It does nothing unless both `RESEND_API_KEY` and `MAIL_FROM` are set, it never throws, and it never delays a response. On Cloudflare Workers the delivery is handed to `waitUntil` so it finishes after the response.

Emails sent:

| Event | Sent when |
|---|---|
| `instructor_application.approved` / `.returned` | An admin reviews an application |
| `enrollment.approved` / `.rejected` | A teacher decides an enrollment request |
| `performance_task.graded` | A teacher grades a submission |
| `account.suspended` | An admin suspends an account |
| `instructor.revoked` | An admin revokes instructor access |
| `announcement.posted` | Used by the announcements feature when a teacher chooses to email students |

### Turn email on

1. Create a free Resend account and verify a sending domain (Resend only delivers to arbitrary addresses from a verified domain).
2. Create an API key and store it as a secret: `npx wrangler secret put RESEND_API_KEY`.
3. Set the plain variables `MAIL_FROM` (for example `Aralytics <no-reply@your-domain.example>`) and, optionally, `APP_URL` (for example `https://aralytics.example`, used for links in the emails) in `wrangler.jsonc` under `vars`, then deploy.

The free Resend plan fits this app's volume. For local development put the same names in `server/.env`, but only with a test key. Remove `MAIL_FROM` to turn email back off.

### Tests

`notifier.setTransport(fn)` replaces the sender (`fn(messages, settings)` receives an array of `{ from, to, subject, text, html }`) and `await notifier.flush()` waits for pending deliveries.

## Database changes

`initializeAccountAdminTables()` (called from `db:init`) adds `users.status`, `users.suspended_reason`, `users.suspended_at` and creates `admin_audit_log` with two indexes. `schema.mysql.sql` carries the same DDL. Run `db:init` before deploying code that reads `users.status`; the authentication middleware now selects it.
