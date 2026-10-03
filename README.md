# Aralytics (Ponce AP10 Learning Hub)

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
   - **Offline-capable:** Local caching via Service Workers (`/sw.js`) using `CacheFirst` and `StaleWhileRevalidate` for previously viewed PPT, PDF, DOCX, and MP4 materials.
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

