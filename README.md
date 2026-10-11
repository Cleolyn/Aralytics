# Aralytics (Ponce AP10 Learning Hub)

The interface uses a brown and cream Araling Panlipunan theme, open sections, readable tables, and English-led Taglish. See [brand.md](brand.md) for the design system.

Learners use **Overview → Lessons → Activities → My Progress**. Teachers use **Overview → Classes → Lessons → Assessments → Gradebook → Reports**. Practice and learner support are linked from the relevant progress and review screens. Public pages include landing, login, registration, and help.

### Redesign behavior

- Teacher and learner routes remain separate. Overview counts, grades, and reading progress use real authenticated records.
- Quiz answers are graded against the server answer key. The focused runner saves answers and the deadline per learner on the device, supports review, and blocks repeat submissions. Internet is required to load and submit quizzes; the timer continues through connection loss.
- Performance tasks accept actual PDF/DOCX documents up to 5 MB. Uploaded files live in `server/uploads/performance-tasks/` (ignored by Git); only the submitting learner and authenticated teachers can download them. Back up this directory alongside the database.
- Teacher feedback appears in the learner’s progress and activity detail. Suggested practice uses the same records teachers review.
- Lesson files in `server/resources/materials/` are shared public curriculum resources. The initial sample filenames do **not** include actual lesson documents; missing files show a clear message. Add real files or link accessible HTTPS resources from **Lessons → Add resource**. External resources open online; explicit offline downloads support same-origin files.
- Offline reading logs and catalogs are stored per learner. An unexpired cached profile permits offline lesson navigation; online access still uses server authentication. Do not use a shared browser profile for private learning sessions.
- The current curriculum is AP10; the redesign does not add Grade 7–9 curriculum content. Class visibility follows the existing school-wide teacher model.

### Validate the redesign

```bash
npm run build
DB_SQLITE_PATH=/private/tmp/aralytics-check.sqlite npm test
```

The full suite creates assessment fixtures before running analytics checks. For optional HTTP checks, start the API with a **separate disposable SQLite database**, initialize it, and run `npm run seed-users` with that same `DB_SQLITE_PATH`. Then:

```bash
ARALYTICS_TEST_URL=http://127.0.0.1:5001 ARALYTICS_DISPOSABLE_DB=yes npm run test:redesign
```

The optional HTTP checks create a test learner, upload a document, grade it, and submit a quiz. Never run them against your working school database. The normal redesign checks cover six question formats, duplicate/unknown answers, and private API cache isolation without an API server.

A web-based LMS, assessment engine, and automated intervention system for **DepEd Araling Panlipunan 10 (Kontemporaryong Isyu)** built under the **ANTIGRAVITY-LOOP** architecture and strictly aligned with the **ILAW Framework** (*Intentions, Learning Experiences, Assessment, Ways Forward*).

---

## 🏛️ System Core Realities & Boundaries

1. **Shared Learner Database:**
   - Instructional materials, assessment quiz engine, proctoring security watchdog, and remedial intervention modules all read and write to a unified relational database.
   - Every quiz submission instantly calculates score metrics, updates class gradebooks, evaluates competency mastery, and triggers remedial recommendations without manual re-encoding.
2. **Access Control (RBAC):**
   - **Teacher Role:** Manage curriculum, publish quizzes, monitor live proctoring flags, view master gradebooks, and export to **SheetJS (.xlsx)** and **PDFKit (.pdf)**.
   - **Student Role:** Browse offline-cacheable instructional materials, take secured proctored assessments, view instant mastery breakdown, and complete remedial tasks in Ways Forward.
3. **PWA Hybrid Access Boundary:**
   - **Offline-capable:** Explicit same-origin lesson downloads via Service Workers (`/sw.js`). Viewing a file does not download it for offline use. Account, assessment, grading, and submission APIs are never cached.
   - **Strictly online:** Quiz delivery, focus/tab-switch security monitoring, and live gradebook recording.
4. **ILAW Framework Alignment:**
   - **I - Intentions (Layunin):** MELC competency standards & learning objectives.
   - **L - Learning Experiences (Karanasan):** Interactive modules, slide decks, and video lessons.
   - **A - Assessment (Pagtataya):** Secured assessments with proctoring watchdogs.
   - **W - Ways Forward (Pagsulong):** Automated remedial interventions triggered when score < 75%.

---

## 🚀 Quick Start Guide

### 1. Requirements
- Node.js (v18+)
- npm (v9+)

### 2. Run Database Setup & Development Servers
In the project root directory:

```bash
# Initialize and seed DepEd AP10 curriculum, users, and quizzes
npm run init-db

# Run Express API Server (Port 5001)
npm run server

# Run React PWA Client (Port 3000)
npm run client

# Run Complete Verification Test Suite
npm test
```

Or start both in tandem:
```bash
npm run dev
```

Visit the client at: `http://localhost:3000`  
API health check at: `http://localhost:5001/api/health`

---

## 🔑 Demo Access Credentials

| Role | Email / Identifier | Password | Access Highlights |
| :--- | :--- | :--- | :--- |
| **Teacher (Coordinator)** | `teacher@ponce.edu.ph` (or `EMP-2026-001`) | `TeacherPass123!` | Dashboard, Proctoring Flags, Master Gradebook, Proficiency Profiling, Remediation Decisions, XLSX/PDF Exports |
| **Student (Juan Dela Cruz)** | `juan.delacruz@student.deped.gov.ph` (or `123456789012`) | `StudentPass123!` | Section 10-Rizal, Offline Materials Hub, Proctored Quiz, Ways Forward |

---

## 📊 Analytics & DepEd Reporting Engine (`INTERVENTION-ANALYTICS-ENGINE`)
1. **Proficiency Profiling Aggregator (`GET /api/analytics/proficiency`):**
   - Aggregates cohort scores across MELC competencies and classifies into 3 tiers:
     - **Mastered:** &ge; 85%
     - **Developing:** 70% – 84%
     - **Needs Intervention:** &lt; 70%
2. **Remediation Routing Queue (`GET /api/analytics/remediation-queue`):**
   - Automatically queues students scoring &lt; 70% alongside recommended competency remedial materials.
3. **Teacher Decision Hooks (`POST /api/analytics/intervention/:id/action`):**
   - Supports 1-click **"APPROVE"**, **"MODIFY"** (select from available competency remedial materials), and **"OVERRIDE"** (custom exempt / completed status).
4. **Automated Exporters (`/api/analytics/export/xlsx` & `/api/analytics/export/pdf`):**
   - **SheetJS (.xlsx):** Includes Student Name, Competency Mastery Flags, Tab-Switch Audit Warnings, Raw Scores, and Assigned Interventions.
   - **PDFKit (.pdf):** Official DepEd monitoring layout with cohort distribution statistics and signature lines.

