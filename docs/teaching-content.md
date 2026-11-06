# Teaching content: edit, delete, archive, and adviser scope

This covers how teachers change quizzes and class tasks after creating them, and which lessons, quizzes, and tasks a student can see.

## Gradebook data is never destroyed

| | Quiz | Class task (performance task) |
| --- | --- | --- |
| No attempts or submissions | Edit anything, or delete | Edit anything, or delete |
| Attempts or submissions exist | Questions, topic, and passing score lock. Title, instructions, time limit, and tab-switch limit stay editable. Delete is refused; archive instead. | Points, topic, and quarter lock. Title, instructions, grading guide, and due date stay editable. |
| Ungraded submissions only | n/a | Delete with `?force=1` removes the submissions and their uploaded files. Plain delete is refused. |
| Any graded submission | n/a | Delete is refused (even with `force`); archive instead. |

An *attempt* on a quiz is any row in `quiz_submissions` (any status) or `quiz_attempts`. The count is of distinct students, so one student who produced rows in both tables counts once.

Archiving sets `archived_at` and, for quizzes, `is_published = 0`, so the existing publish checks also block new attempts. Restoring clears `archived_at` and, for quizzes, publishes the quiz again.

## Endpoints

All require a signed-in `TEACHER` or `ADMIN`. Only the creator or an admin may act; anyone else gets 403 `NOT_OWNER`. Missing records give 404 `QUIZ_NOT_FOUND` or `TASK_NOT_FOUND`. Errors use `{ success: false, code, message }`; some carry extra fields shown below.

| Method and path | Success | Errors |
| --- | --- | --- |
| `PUT /api/quizzes/:id` (partial) | `{ quiz }` with `attempt_count` | 409 `QUIZ_LOCKED { locked_fields }`, 400 `INVALID_INPUT` |
| `DELETE /api/quizzes/:id` | `{ id }` (questions are deleted first) | 409 `QUIZ_HAS_ATTEMPTS { attempts }` |
| `POST /api/quizzes/:id/archive`, `/restore` | `{ quiz }` | |
| `PUT /api/performance-tasks/:id` | `{ task }` | 409 `TASK_LOCKED { locked_fields }` |
| `DELETE /api/performance-tasks/:id[?force=1]` | `{ id, removed_files }` | 409 `TASK_HAS_SUBMISSIONS { submissions, graded }`, 409 `TASK_HAS_GRADES { submissions, graded }` |
| `POST /api/performance-tasks/:id/archive`, `/restore` | `{ task }` | |

A locked field is only reported when its value actually changes, so a client may resend the unchanged topic or passing score.

Deleting a task cleans up in order: each submission's files (`deleteForSubmission`), any remaining `files` rows with that `task_id`, then the submissions, then the task. Foreign keys are not relied on, because it is unclear whether Turso enforces them.

`GET /api/quizzes` and `GET /api/quizzes/:id` now return `attempt_count` and `archived_at` for teachers. Teacher lists include archived items; the client hides them behind a "Show archived" toggle.

## Adviser scope for students

A student only sees content whose `created_by` is their approved adviser (`fileService.approvedAdviser`). With no adviser, lists are empty and single items return 404. This applies to:

- Lessons: `GET /api/materials`, `GET /api/materials/:id`, `GET /api/student/lessons`.
- Quizzes: list, get, `POST /api/student/quizzes/start`, `POST /api/submissions/start`, `POST /api/student/quizzes/submit`, `POST /api/submissions/submit`, and `POST /api/assessment/submit`.
- Class tasks: list, get, and submit (`/api/performance-tasks/:id/submit` and `/api/student/performance-tasks/:id/submit`).
- The student dashboard feed (`/api/student/dashboard`).

Students also never see archived quizzes or tasks. Submitting an archived task returns 409 `TASK_ARCHIVED`. Submitting a quiz that was archived mid-attempt returns 409 `QUIZ_ARCHIVED`. A quiz that is unpublished or archived now returns 404 from `GET /api/quizzes/:id` for students.

Teacher and admin views are unchanged: they see every teacher's lessons, quizzes, and tasks. Admins now get the teacher view of the quiz list (including unpublished quizzes and correct answers) rather than the student one.

Existing lessons, quizzes, and tasks stay with the teacher who created them. If a student changes adviser, the old teacher's content disappears from their view and the new adviser's appears; their old scores remain in the gradebook.

## Interface

- `/teacher/assessments`: Edit, Archive/Restore, and Delete appear only on rows you created (or for admins). A "Show archived" toggle reveals archived rows, marked "Archived".
- Delete asks for confirmation. If the server refuses because of attempts or grades, the dialog offers "Archive instead"; for a task with ungraded submissions it also offers "Delete submissions too".
- Editing a quiz opens `/teacher/quizzes/:id/edit`, the same editor as creation with the saved values. It does not use or clear the device-local draft. When students have already attempted the quiz, a notice explains the lock, and the question editor, topic, and passing score are disabled.
- Editing a task reuses the create dialog; topic and points lock once students have submitted.

## Database

`archived_at TIMESTAMP NULL` is added to `quizzes` and `performance_tasks` by `initializeTeachingContentColumns()` (run from `db:init`), and listed at the end of `server/src/db/schema.mysql.sql`. Existing rows start unarchived. No data migration is needed.

## Tests

- Server: `server/test/teaching_content_flow.test.js`.
- Client: `AssessmentsPage.test.jsx` and the edit-mode cases in `QuizManager.test.jsx`.
- Existing suites that called controllers directly as an unenrolled demo student now enroll that student with the seeded teacher first (`server/test/helpers/enrollDemo.js`), because the adviser rule applies.
