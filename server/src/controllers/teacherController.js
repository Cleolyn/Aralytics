const db = require('../config/database');
const AnalyticsService = require('../services/AnalyticsService');
const materialsController = require('./materialsController');
const quizController = require('./quizController');
const performanceTaskController = require('./performanceTaskController');
const proctoringController = require('./proctoringController');
const submissionController = require('./submissionController');

/**
 * Teacher Command Center Aggregated Dashboard (FR-05, FR-07)
 */
async function getDashboardOverview(req, res, next) {
  try {
    const { section, quarter } = req.query;

    const [profiling, remediationQueue, gradebook] = await Promise.all([
      AnalyticsService.getProficiencyProfiling({ section, quarter }),
      AnalyticsService.getRemediationRoutingQueue({ section }),
      AnalyticsService.getComprehensiveGradebookDataset({ section })
    ]);

    // Compute key teacher KPI indicators
    const totalStudents = new Set(gradebook.map(g => g.student_id)).size;
    const totalSubmissions = gradebook.length;
    const flaggedCheatingCount = gradebook.filter(g => g.is_flagged_for_cheating).length;
    const pendingRemediations = remediationQueue.filter(r => r.status === 'RECOMMENDED').length;

    res.json({
      success: true,
      role: 'TEACHER',
      overview: {
        total_students: totalStudents,
        total_submissions: totalSubmissions,
        flagged_cheating_count: flaggedCheatingCount,
        pending_remediations: pendingRemediations
      },
      profiling,
      remediation_queue: remediationQueue
    });
  } catch (err) {
    next(err);
  }
}

async function getClasses(req, res, next) {
  try {
    const { rows: learners } = await db.query(`
      SELECT u.id, u.first_name, u.last_name, u.lrn_or_id,
             COALESCE(u.section_id, u.section, 'Unassigned') as section,
             (SELECT COUNT(*) FROM quiz_submissions s WHERE s.student_id = u.id AND s.status = 'SUBMITTED') as quiz_submissions,
             (SELECT COUNT(*) FROM performance_task_submissions p WHERE p.student_id = u.id) as task_submissions
      FROM users u WHERE u.role = 'STUDENT'
      ORDER BY section, u.last_name, u.first_name
    `);
    const sections = new Map();
    for (const learner of learners) {
      if (!sections.has(learner.section)) sections.set(learner.section, { section: learner.section, learners: 0, learners_with_quiz_submissions: 0 });
      const item = sections.get(learner.section);
      item.learners++;
      if (learner.quiz_submissions > 0) item.learners_with_quiz_submissions++;
    }
    res.json({ success: true, classes: [...sections.values()], learners });
  } catch (err) { next(err); }
}

module.exports = {
  getClasses,
  getDashboardOverview,
  getGradebook: submissionController.getGradebookData,
  getProficiencyProfiling: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getProficiencyProfiling(req.query);
      res.json({ success: true, profiling: data });
    } catch (e) { next(e); }
  },
  getRemediationQueue: async (req, res, next) => {
    try {
      const queue = await AnalyticsService.getRemediationRoutingQueue(req.query);
      res.json({ success: true, count: queue.length, queue });
    } catch (e) { next(e); }
  },
  handleInterventionAction: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { action, material_id, override_status } = req.body;
      const result = await AnalyticsService.updateInterventionDecision(id, action, {
        material_id,
        override_status
      });
      res.json({ success: true, result });
    } catch (e) { next(e); }
  },
  getItemAnalysis: async (req, res, next) => {
    try {
      const { quiz_id } = req.params;
      const report = await AnalyticsService.calculateItemAnalysis(quiz_id);
      res.json({ success: true, report });
    } catch (e) { next(e); }
  },
  createQuiz: quizController.createQuiz,
  createMaterial: materialsController.createMaterial,
  createPerformanceTask: performanceTaskController.createTask,
  getPerformanceTaskSubmissions: performanceTaskController.getTaskSubmissions,
  gradePerformanceTask: performanceTaskController.gradeSubmission,
  getProctoringTrail: proctoringController.getProctoringAuditTrail,
  exportGradebookXLSX: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getComprehensiveGradebookDataset(req.query);
      const buffer = AnalyticsService.generateSheetJSWorkbook(data);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="Aralytics_Master_Gradebook.xlsx"');
      res.send(buffer);
    } catch (e) { next(e); }
  },
  exportReportPDF: async (req, res, next) => {
    try {
      const data = await AnalyticsService.getComprehensiveGradebookDataset(req.query);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="Aralytics_DepEd_Monitoring_Report.pdf"');
      AnalyticsService.renderPDFReport(data, res, req.query);
    } catch (e) { next(e); }
  }
};
