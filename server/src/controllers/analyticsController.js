const AnalyticsService = require('../services/AnalyticsService');

/**
 * GET /api/analytics/proficiency
 * Aggregates scores per competency across student cohorts and groups into 3 tiers:
 * - Mastered (>= 85%)
 * - Developing (70% - 84%)
 * - Needs Intervention (< 70%)
 */
async function getProficiencyAnalytics(req, res, next) {
  try {
    const section_id = req.query.section_id || req.query.section;
    const { quarter } = req.query;
    const profiling = await AnalyticsService.getProficiencyProfiling({ section_id, quarter });

    res.json({
      success: true,
      count: profiling.length,
      profiling
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/remediation-queue
 * Retrieves low-performing students (< 70%) linked with target competency remedial material IDs.
 */
async function getRemediationQueue(req, res, next) {
  try {
    const section_id = req.query.section_id || req.query.section;
    const { status } = req.query;
    const queue = await AnalyticsService.getRemediationRoutingQueue({ section_id, status });

    res.json({
      success: true,
      count: queue.length,
      queue
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/analytics/intervention/:id/action
 * Teacher Decision Hook: Allows teachers to "APPROVE", "MODIFY", or "OVERRIDE"
 * intervention assignments.
 */
async function handleInterventionAction(req, res, next) {
  try {
    const { id } = req.params;
    const { action, material_id, override_status } = req.body;

    if (!action) {
      return res.status(400).json({
        success: false,
        message: "Missing 'action' parameter. Allowed: 'APPROVE', 'MODIFY', 'OVERRIDE'."
      });
    }

    const result = await AnalyticsService.updateInterventionDecision(id, action, {
      material_id,
      override_status
    });

    res.json({
      success: true,
      message: `Intervention ${action.toUpperCase()} action processed successfully.`,
      result
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/export/xlsx
 * Generates and downloads clean SheetJS (.xlsx) workbook.
 */
async function exportGradebookXLSX(req, res, next) {
  try {
    const section_id = req.query.section_id || req.query.section;
    const records = await AnalyticsService.getComprehensiveGradebookDataset({ section_id });
    const buffer = AnalyticsService.generateSheetJSWorkbook(records);

    const filename = `Aralytics_Master_Gradebook_${section_id || 'All'}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/export/pdf
 * Generates and downloads structured PDFKit report.
 */
async function exportReportPDF(req, res, next) {
  try {
    const section_id = req.query.section_id || req.query.section;
    const records = await AnalyticsService.getComprehensiveGradebookDataset({ section_id });
    AnalyticsService.renderPDFReport(records, res, { section_id });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/analytics/quizzes/:quiz_id/item-analysis
 * Calculates difficulty index P = R/T and discrimination index D = (R_H - R_L)/N
 * plus distractor frequency distributions (SRS FR-21, FR-40).
 */
async function getItemAnalysis(req, res, next) {
  try {
    const { quiz_id } = req.params;
    const analysis = await AnalyticsService.calculateItemAnalysis(quiz_id);
    res.json({
      success: true,
      analysis
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProficiencyAnalytics,
  getRemediationQueue,
  handleInterventionAction,
  exportGradebookXLSX,
  exportReportPDF,
  getItemAnalysis
};

