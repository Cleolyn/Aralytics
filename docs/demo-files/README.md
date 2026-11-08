# Demo files

Files to upload by hand when testing Aralytics with the [demo accounts](../demo-accounts/README.md). Everything here is made up for testing. It is not official DepEd material.

Regenerate with `python scripts/demo-files/generate.py` (needs `pip install python-docx python-pptx reportlab pillow openpyxl`). Names, sections and tasks come from the demo roster, so they always match the accounts.

> **Which accounts can sign in.** The development Clerk instance holds at most 100 users, so only 99 of the 157 demo accounts have a real login. Every featured account in the [accounts list](../demo-accounts/README.md) (admin, the three instructors, the applicant, each section's `-01`, `-19`, `-26`, `-31` students and the pending, returned and new students) can sign in. Many of the other students exist only in the database.

## Instructors (`instructors/`)

One folder per approved instructor. Sign in as that instructor (see the accounts list; on the development Clerk instance the email code for `+clerk_test` addresses is `424242`).

| File | Where to use it | What to check |
| --- | --- | --- |
| Lesson module (`.pdf`) | **Lessons → Add lesson** | Upload progress, title taken from the file name, learners in the class can open it |
| `Presentasyon - … .pptx` | **Lessons → Add lesson** | Non-PDF lesson opens as a download |
| `Worksheet - … .docx` | **Lessons → Add lesson**, or attach to an announcement | Learners download the blank workbook, answer it, and hand it in (see students below) |
| `Rubrik - … .pdf` | **Announcements** attachment, or **My files** | Attachment link works for learners |
| `Announcement attachment - … .pdf` | **Announcements → New announcement** (pick it from My files) | Learners see it on their dashboard and Announcements page |
| `Lesson pack (…).zip` | **Lessons → Add lesson** | ZIP is accepted and downloads intact |
| `Class record - … .xlsx` | Any upload | Should be **refused** ("Unsupported file type"). Spreadsheets are not an allowed type |

| Instructor | Classes | Code |
| --- | --- | --- |
| Cleo Ponce | 10-Rizal, 10-Bonifacio | `RIZALAP26A` |
| Ramon Magsaysay | 10-Luna | `LUNAMAB26B` |
| Trinidad Tecson | 10-Mabini | `MABINIAP26` |

## Students (`students/<section>/<account key> - <name>/`)

Every enrolled demo student (and the pending and returned ones) has three files tied to their own adviser's worksheet and task:

| File | Where to use it | What to check |
| --- | --- | --- |
| `<Name> - Workbook - … .docx` | **Activities → task → Submit**, or **My files** | The answered workbook. Answer quality follows the account's tier: `-01` (needs practice) answers poorly, `-19` (mastered) answers well, others vary. Good for practising grading |
| `<Name> - <task title>.pdf` | **Activities → that task → Submit** | Task output (action plan, audit report or source matrix). Teacher grades it in **Gradebook → Tasks** |
| `<Name> - Photo-essay larawan 1.jpg` | **Activities → photo task**, or **My files** | Image submissions are accepted and open for the teacher |

Students `-31` to `-35` have no submissions yet, so they are the best accounts for a clean submit-then-grade run.

## Edge cases (`edge-cases/`)

| File | Expected result |
| --- | --- |
| `notes-plain-text.txt` | Refused: unsupported file type |
| `spreadsheet-not-allowed.xlsx` | Refused: unsupported file type |
| `fake-module.pdf` (text renamed to `.pdf`) | Refused after upload: content does not match the type |
| `empty-file.pdf` | Refused: empty file |
| Long Unicode file name (`Ñ`, `ü`, em dash) | Accepted; the name shows correctly in lists and downloads |

Over-limit files are not committed. Run `python scripts/demo-files/generate.py --oversize` to write a 16 MB teacher file and an 11 MB student file to `output/demo-oversize/`. Limits are 15 MB per file for instructors and 10 MB for students.
