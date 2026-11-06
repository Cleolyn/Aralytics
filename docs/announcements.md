# Class announcements

Teachers post announcements to the students they advise. Students read them on a dedicated page and on their dashboard, with unread markers. A teacher can attach one of their own files and can optionally email the class.

## Who sees what

- A teacher sees and manages only their own posts.
- A student sees only the posts of their approved adviser (the teacher whose class code they enrolled with). A student who is not yet approved cannot reach the feed (the usual `ENROLLMENT_REQUIRED` response).
- Admins have no announcement feed (403).
- Posts from another teacher return 404, never 403, so their existence is not revealed.

## Data

Two tables, created by `initializeAnnouncementTables()` in `server/src/services/announcementService.js` (called from `db/init.js`; the MySQL DDL is in `schema.mysql.sql`):

- `announcements`: `id`, `teacher_id`, `title` (1 to 150), `body` (1 to 5000), `pinned`, `file_id`, `created_at`, `updated_at`.
- `announcement_reads`: one row per student and post (`announcement_id`, `user_id`, `read_at`).

Foreign keys cascade, but deletion also removes read rows explicitly in a transaction, because the database may not enforce foreign keys.

## API

All routes are under `/api/announcements` behind `verifyToken`. Errors use `{ success:false, code, message }`.

| Method and path | Who | Body | Response |
|---|---|---|---|
| `GET /?limit=` | teacher (own) or student (adviser's) | | `{ announcements, unread_count }`, pinned first then newest (default 50, max 200) |
| `POST /` | teacher | `{ title, body, pinned?, file_id?, email_students? }` | 201 `{ announcement }` |
| `PUT /:id` | owner | any of the above fields (partial) | `{ announcement }` |
| `DELETE /:id` | owner | | `{ id }` |
| `POST /:id/read` | student | | `{ read_at }` (safe to repeat) |
| `POST /read-all` | student | | `{ count }` |

Codes: `INVALID_ANNOUNCEMENT` (400), `FILE_NOT_FOUND` (400), `ANNOUNCEMENT_NOT_FOUND` (404, also for non-owners and other classes).

Each announcement is `{ id, title, body, pinned, created_at, updated_at, teacher_name, attachment, read }`. `unread_count` counts every unread post of the adviser, regardless of `limit`. Teachers always see `read: true`.

## Attachments

`file_id` must be a `ready` file of purpose `personal` owned by the posting teacher, otherwise 400 `FILE_NOT_FOUND`. Send `file_id: null` on edit to remove it.

File permissions are not changed. When listing, the service already knows the viewer belongs to the author's class, so it signs a short-lived download link for that viewer (`tokens.downloadUrl`). If the teacher later deletes the file, the post stays and `attachment` is `null`. Deleting an announcement keeps the file in My files.

## Email

When `email_students: true` is sent on create (default off), the service calls `notifier.notify(req, 'announcement.posted', { to, teacher_name, title, excerpt })`, where `to` lists the emails of students with an APPROVED enrollment under that teacher's invitations. Failures are logged and never fail the post. Email is a no-op until the notifier is configured with Resend (see the admin and accounts documentation).

## Client

- `/teacher/announcements`: list, New or Edit dialog (pin, file picker over My files, "Email my students" on create), delete confirmation.
- `/student/announcements`: unread markers, open a post to read it (this marks it read), "Mark all as read".
- Student dashboard: a "Class announcements" aside with the latest three and "New" badges. It hides itself if the request fails.
- Navbar: an Announcements link for teachers and students.

## Tests

- `server/test/announcements_flow.test.js`: class isolation, attachments through the byte route, foreign files, ownership, read markers, cleanup and email.
- `client/src/pages/__tests__/AnnouncementsPage.test.jsx`: teacher create, edit and delete; student read markers; dashboard widget.
