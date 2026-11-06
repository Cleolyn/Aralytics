/**
 * Express application (no network listener). Imported by server.js and by tests.
 */
const express = require('express');
const cors = require('cors');
const { clerkMiddleware } = require('@clerk/express');
const db = require('./config/database');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// CORS_ORIGIN accepts a comma-separated allow-list; unset keeps the permissive default.
const corsOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: corsOrigins.includes('*') ? '*' : corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'If-None-Match']
}));

// Signed byte routes (file parts and downloads) are streamed, so they sit before body parsing.
app.use('/api/files', require('./routes/fileRoutes').bytes);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// File-download links pass the session token as ?token=; bridge it into the
// Authorization header so Clerk authenticates every request the same way.
app.use((req, _res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
});

app.use(clerkMiddleware());

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Aralytics Core Engine (Ponce AP10 Learning Hub)',
    database: db.dialect,
    timestamp: new Date().toISOString()
  });
});

// Database connectivity probe used by deployment checks (docs/cloudflare-deployment.md).
app.get('/api/test-db', async (_req, res) => {
  try {
    const result = await db.query('SELECT 1 as connected');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[ARALYTICS] Database probe failed:', err.message);
    res.status(500).json({ success: false, error: 'Failed to connect to database' });
  }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/enrollment', require('./routes/enrollmentRoutes'));
app.use('/api/instructor-applications', require('./routes/instructorApplicationRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/curriculum', require('./routes/curriculumRoutes'));
app.use('/api/files', require('./routes/fileRoutes').api);
app.use('/api/materials', require('./routes/materialsRoutes'));
app.use('/api/quizzes', require('./routes/quizRoutes'));
app.use('/api/proctoring', require('./routes/proctoringRoutes'));
app.use('/api/submissions', require('./routes/submissionRoutes'));
app.use('/api/interventions', require('./routes/interventionRoutes'));
app.use('/api/export', require('./routes/exportRoutes'));
app.use('/api', require('./routes/assessmentPersistenceRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/performance-tasks', require('./routes/performanceTaskRoutes'));
app.use('/api/teacher', require('./routes/teacherRoutes'));
app.use('/api/student', require('./routes/studentRoutes'));
// [A] teaching content — add below
// ---
// [B] admin and accounts — add below
// ---
// [C] announcements — add below
// ---

app.use(errorHandler);

module.exports = app;
