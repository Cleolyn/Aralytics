const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const { initializeDatabase } = require('./db/init');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const curriculumRoutes = require('./routes/curriculumRoutes');
const materialsRoutes = require('./routes/materialsRoutes');
const quizRoutes = require('./routes/quizRoutes');
const proctoringRoutes = require('./routes/proctoringRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const interventionRoutes = require('./routes/interventionRoutes');
const exportRoutes = require('./routes/exportRoutes');
const assessmentPersistenceRoutes = require('./routes/assessmentPersistenceRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const performanceTaskRoutes = require('./routes/performanceTaskRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'If-None-Match']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'Aralytics Core Engine (Ponce AP10 Learning Hub)',
    timestamp: new Date().toISOString(),
    ilawFramework: 'Active'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/curriculum', curriculumRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/proctoring', proctoringRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/interventions', interventionRoutes);
app.use('/api/export', exportRoutes);
app.use('/api', assessmentPersistenceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/performance-tasks', performanceTaskRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);

// Error Handling Middleware
app.use(errorHandler);

// Boot Server
async function startServer() {
  try {
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`======================================================================`);
      console.log(`[ARALYTICS] Engine running on http://localhost:${PORT}`);
      console.log(`[ARALYTICS] Health Check: http://localhost:${PORT}/api/health`);
      console.log(`[ARALYTICS] Role-Based Access: TEACHER | STUDENT`);
      console.log(`[ARALYTICS] ILAW Framework & Proctoring Watchdog: ONLINE`);
      console.log(`======================================================================`);
    });
  } catch (err) {
    console.error('[ARALYTICS] Fatal startup error:', err);
    process.exit(1);
  }
}

startServer();

module.exports = app;
