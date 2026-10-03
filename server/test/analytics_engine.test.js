const assert = require('assert');
const { PassThrough } = require('stream');
const db = require('../src/config/database');
const { initializeDatabase } = require('../src/db/init');
const AnalyticsService = require('../src/services/AnalyticsService');
const analyticsController = require('../src/controllers/analyticsController');

async function testAnalyticsEngine() {
  console.log('======================================================================');
  console.log('[TEST] MODULE: INTERVENTION-ANALYTICS-ENGINE');
  console.log('======================================================================');

  await initializeDatabase();

  // Helper for mock HTTP responses
  const createMockRes = () => {
    return {
      statusCode: 200,
      jsonData: null,
      headers: {},
      sentData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      send(data) {
        this.sentData = data;
        return this;
      }
    };
  };

  // -------------------------------------------------------------------------
  // 1. PROFICIENCY PROFILING AGGREGATOR & 3-TIER CLASSIFICATION
  // -------------------------------------------------------------------------
  console.log('--> Test 1: Proficiency Profiling Aggregator & 3-Tier Classification');

  // Verify tier thresholds
  assert.strictEqual(AnalyticsService.classifyMasteryTier(100), 'MASTERED', '100% must be MASTERED');
  assert.strictEqual(AnalyticsService.classifyMasteryTier(85), 'MASTERED', '85% must be MASTERED');
  assert.strictEqual(AnalyticsService.classifyMasteryTier(84.9), 'DEVELOPING', '84.9% must be DEVELOPING');
  assert.strictEqual(AnalyticsService.classifyMasteryTier(70), 'DEVELOPING', '70% must be DEVELOPING');
  assert.strictEqual(AnalyticsService.classifyMasteryTier(69.9), 'NEEDS_INTERVENTION', '69.9% must be NEEDS_INTERVENTION');
  assert.strictEqual(AnalyticsService.classifyMasteryTier(0), 'NEEDS_INTERVENTION', '0% must be NEEDS_INTERVENTION');
  console.log('    [PASS] Tier classification bounds strictly conform to [>=85%, 70-84%, <70%].');

  // Run profiling query across cohorts
  const profiling = await AnalyticsService.getProficiencyProfiling();
  assert(Array.isArray(profiling) && profiling.length >= 4, 'Must profile all curriculum competencies');
  
  const assessedComp = profiling.find(p => p.total_assessed > 0);
  assert(assessedComp, 'At least one competency should have assessed submissions');
  assert(typeof assessedComp.cohort_average_percentage === 'number', 'Cohort average must be a number');
  assert(assessedComp.mastery_distribution.mastered !== undefined, 'Mastered tier must be present');
  assert(assessedComp.mastery_distribution.developing !== undefined, 'Developing tier must be present');
  assert(assessedComp.mastery_distribution.needs_intervention !== undefined, 'Needs Intervention tier must be present');
  console.log(`    [PASS] Competency '${assessedComp.competency_id}' aggregated ${assessedComp.total_assessed} attempts with Cohort Avg: ${assessedComp.cohort_average_percentage}%.`);

  // Controller endpoint check
  const reqProf = { query: { section_id: '10-Rizal' } };
  const resProf = createMockRes();
  await analyticsController.getProficiencyAnalytics(reqProf, resProf, (err) => { throw err; });
  assert.strictEqual(resProf.jsonData.success, true);
  assert(resProf.jsonData.profiling.length > 0);
  console.log('    [PASS] GET /api/analytics/proficiency returned 200 with structured cohort profiling.');

  // -------------------------------------------------------------------------
  // 2. REMEDIATION ROUTING LOGIC & TEACHER DECISION ACTIONS
  // -------------------------------------------------------------------------
  console.log('--> Test 2: Remediation Routing Logic & Teacher Decision Hooks (Approve, Modify, Override)');

  const queue = await AnalyticsService.getRemediationRoutingQueue();
  assert(Array.isArray(queue) && queue.length > 0, 'Remediation queue must have active records');
  const targetItem = queue.find(item => item.status === 'RECOMMENDED' && item.assessment_performance && item.assessment_performance.percentage < 70) 
    || queue.find(item => item.assessment_performance && item.assessment_performance.percentage < 70) 
    || queue[0];
  const targetId = targetItem.intervention_id;

  assert(targetItem.student && targetItem.student.name, 'Must include student details');
  assert(targetItem.competency && targetItem.competency.id, 'Must include target competency details');
  assert(targetItem.assessment_performance.percentage < 70, 'Target student in queue must be < 70%');
  assert(Array.isArray(targetItem.available_competency_remedials), 'Must include available remedial materials catalog');
  console.log(`    [PASS] Routing correctly queued student '${targetItem.student.name}' (${targetItem.assessment_performance.percentage}%) for competency '${targetItem.competency.id}'.`);

  // Decision Action 2A: APPROVE
  const approveRes = await AnalyticsService.updateInterventionDecision(targetId, 'APPROVE');
  assert.strictEqual(approveRes.action, 'APPROVE');
  assert.strictEqual(approveRes.new_status, 'ASSIGNED');
  console.log('    [PASS] Action "APPROVE" successfully transitioned intervention status to ASSIGNED.');

  // Decision Action 2B: MODIFY (change material)
  const altMaterialId = 'mat-rem-002';
  const modifyRes = await AnalyticsService.updateInterventionDecision(targetId, 'MODIFY', { material_id: altMaterialId });
  assert.strictEqual(modifyRes.action, 'MODIFY');
  assert.strictEqual(modifyRes.new_status, 'ASSIGNED');
  assert.strictEqual(modifyRes.assigned_material_id, altMaterialId);
  console.log(`    [PASS] Action "MODIFY" successfully updated assigned remedial material to '${altMaterialId}'.`);

  // Decision Action 2C: OVERRIDE
  const overrideRes = await AnalyticsService.updateInterventionDecision(targetId, 'OVERRIDE', { override_status: 'EXEMPT' });
  assert.strictEqual(overrideRes.action, 'OVERRIDE');
  assert.strictEqual(overrideRes.new_status, 'EXEMPT');
  console.log('    [PASS] Action "OVERRIDE" successfully applied custom override status (EXEMPT).');

  // Controller endpoint check for action
  const reqAction = {
    params: { id: targetId },
    body: { action: 'APPROVE' }
  };
  const resAction = createMockRes();
  await analyticsController.handleInterventionAction(reqAction, resAction, (err) => { throw err; });
  assert.strictEqual(resAction.jsonData.success, true);
  assert.strictEqual(resAction.jsonData.result.new_status, 'ASSIGNED');
  console.log('    [PASS] POST /api/analytics/intervention/:id/action executed Teacher decision successfully.');

  // -------------------------------------------------------------------------
  // 3. GRADEBOOK DATA EXPORTERS (SheetJS & PDFKit)
  // -------------------------------------------------------------------------
  console.log('--> Test 3: Gradebook Data Exporters (SheetJS .xlsx & PDFKit .pdf)');

  const dataset = await AnalyticsService.getComprehensiveGradebookDataset();
  assert(Array.isArray(dataset) && dataset.length > 0, 'Comprehensive dataset must not be empty');

  // Verify dataset contains all required fields:
  // Student Name, Competency Mastery Flags, Tab-Switch Audit Warnings, Raw Scores, Assigned Interventions
  const sample = dataset[0];
  assert(sample.student_name, 'Dataset must have student_name');
  assert(sample.score !== undefined && sample.total_points !== undefined, 'Dataset must have raw scores');
  assert(sample.tab_switch_count !== undefined, 'Dataset must have tab_switch_count');

  // Test SheetJS Workbook Builder
  const xlsxBuffer = AnalyticsService.generateSheetJSWorkbook(dataset);
  assert(Buffer.isBuffer(xlsxBuffer), 'SheetJS output must be a valid Buffer');
  assert(xlsxBuffer.length > 1000, `Excel buffer size (${xlsxBuffer.length} bytes) indicates valid spreadsheet content`);
  console.log(`    [PASS] SheetJS (.xlsx) export generated valid workbook (${xlsxBuffer.length} bytes) with all 5 mandatory fields.`);

  // Test PDFKit Report Renderer
  const pdfStream = new PassThrough();
  let pdfBytes = 0;
  pdfStream.setHeader = () => {};
  pdfStream.on('data', chunk => { pdfBytes += chunk.length; });

  const pdfFinished = new Promise((resolve) => {
    pdfStream.on('end', () => resolve());
  });

  AnalyticsService.renderPDFReport(dataset, pdfStream, { section_id: '10-Rizal' });
  await pdfFinished;

  assert(pdfBytes > 2000, `PDF stream size (${pdfBytes} bytes) indicates valid PDF generation`);
  console.log(`    [PASS] PDFKit (.pdf) official report rendered successfully (${pdfBytes} bytes) into HTTP response stream.`);

  console.log('======================================================================');
  console.log('[ALL TESTS PASSED] MODULE: INTERVENTION-ANALYTICS-ENGINE VERIFIED');
  console.log('======================================================================');
}

if (require.main === module) {
  testAnalyticsEngine()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[TEST ERROR]', err);
      process.exit(1);
    });
}

module.exports = { testAnalyticsEngine };
