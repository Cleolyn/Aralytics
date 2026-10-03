const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const db = require('../config/database');

async function exportGradebookXLSX(req, res, next) {
  try {
    const { section, quiz_id } = req.query;

    let query = `
      SELECT s.id as submission_id, s.score_obtained, s.percentage, s.is_passed, 
             s.blur_count, s.is_flagged_for_cheating, s.submitted_at,
             q.title as quiz_title, q.total_points, q.passing_score,
             lc.melc_code, lc.ilaw_tag,
             u.lrn_or_id, u.first_name, u.last_name, u.section,
             scm.mastery_status
      FROM quiz_submissions s
      JOIN quizzes q ON s.quiz_id = q.id
      JOIN learning_competencies lc ON q.competency_id = lc.id
      JOIN users u ON s.student_id = u.id
      LEFT JOIN student_competency_mastery scm ON scm.student_id = u.id AND scm.competency_id = lc.id
      WHERE s.status = 'SUBMITTED'
    `;
    const params = [];

    if (section) {
      query += ` AND u.section = ?`;
      params.push(section);
    }
    if (quiz_id) {
      query += ` AND q.id = ?`;
      params.push(quiz_id);
    }

    query += ` ORDER BY u.section ASC, u.last_name ASC`;

    const { rows: records } = await db.query(query, params);

    // Format rows for SheetJS
    const sheetData = records.map((r, idx) => ({
      'No.': idx + 1,
      'LRN': r.lrn_or_id,
      'Student Name': `${r.last_name}, ${r.first_name}`,
      'Section': r.section || 'N/A',
      'Assessment Title': r.quiz_title,
      'MELC Code': r.melc_code,
      'ILAW Phase': r.ilaw_tag,
      'Score': r.score_obtained,
      'Total Points': r.total_points,
      'Percentage (%)': r.percentage,
      'DepEd Status': r.is_passed ? 'PASSED' : 'DID NOT MEET EXPECTATIONS',
      'Proctoring Security': r.is_flagged_for_cheating ? `FLAGGED (${r.blur_count} Blurs)` : `CLEAN (${r.blur_count} Blurs)`,
      'Competency Mastery': r.mastery_status || 'NOT_EVALUATED',
      'Submission Timestamp': r.submitted_at
    }));

    const worksheet = XLSX.utils.json_to_sheet(sheetData);

    // Set auto column widths
    const columnWidths = [
      { wch: 6 },  // No.
      { wch: 16 }, // LRN
      { wch: 25 }, // Name
      { wch: 14 }, // Section
      { wch: 35 }, // Quiz Title
      { wch: 16 }, // MELC Code
      { wch: 18 }, // ILAW Phase
      { wch: 8 },  // Score
      { wch: 12 }, // Total Points
      { wch: 14 }, // Percentage
      { wch: 28 }, // DepEd Status
      { wch: 24 }, // Proctoring
      { wch: 22 }, // Mastery
      { wch: 22 }  // Timestamp
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AP10_Gradebook');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const filename = `Aralytics_AP10_Gradebook_${section || 'All_Sections'}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
}

async function exportReportPDF(req, res, next) {
  try {
    const { section, quiz_id } = req.query;

    let query = `
      SELECT s.*, q.title as quiz_title, q.total_points, q.passing_score,
             lc.melc_code, lc.ilaw_tag, lc.description as comp_desc,
             u.lrn_or_id, u.first_name, u.last_name, u.section,
             scm.mastery_status
      FROM quiz_submissions s
      JOIN quizzes q ON s.quiz_id = q.id
      JOIN learning_competencies lc ON q.competency_id = lc.id
      JOIN users u ON s.student_id = u.id
      LEFT JOIN student_competency_mastery scm ON scm.student_id = u.id AND scm.competency_id = lc.id
      WHERE s.status = 'SUBMITTED'
    `;
    const params = [];
    if (section) {
      query += ` AND u.section = ?`;
      params.push(section);
    }
    if (quiz_id) {
      query += ` AND q.id = ?`;
      params.push(quiz_id);
    }
    query += ` ORDER BY u.section ASC, u.last_name ASC`;

    const { rows: records } = await db.query(query, params);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `Aralytics_AP10_Report_${section || 'All'}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Header: Department of Education format
    doc.fontSize(10).text('REPUBLIC OF THE PHILIPPINES', { align: 'center' });
    doc.fontSize(12).font('Helvetica-Bold').text('DEPARTMENT OF EDUCATION', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('PONCE HIGH SCHOOL - ARALING PANLIPUNAN 10', { align: 'center' });
    doc.moveDown(0.5);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#1e3a8a')
      .text('ARALYTICS: ILAW COMPETENCY & ASSESSMENT MONITORING REPORT', { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(9).font('Helvetica').fillColor('#4b5563')
      .text(`Generated on: ${new Date().toLocaleString()} | Scope: ${section ? 'Section ' + section : 'All Enrolled Sections'}`, { align: 'center' });
    doc.moveDown(1);

    // Draw horizontal rule
    doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    // Summary Statistics
    const totalSubmissions = records.length;
    const passedCount = records.filter(r => r.is_passed).length;
    const passRate = totalSubmissions > 0 ? ((passedCount / totalSubmissions) * 100).toFixed(1) : '0';
    const flaggedCount = records.filter(r => r.is_flagged_for_cheating).length;

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('SUMMARY PERFORMANCE METRICS');
    doc.font('Helvetica').fontSize(9).fillColor('#374151');
    doc.text(`Total Examinees: ${totalSubmissions}   |   Passing Rate: ${passRate}% (${passedCount}/${totalSubmissions})   |   Security Flags: ${flaggedCount}`);
    doc.moveDown(0.8);

    // Table Header
    doc.strokeColor('#e5e7eb').lineWidth(0.5);
    const startY = doc.y;
    doc.rect(40, startY, 515, 20).fill('#f3f4f6');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1f2937');
    doc.text('LRN', 45, startY + 6);
    doc.text('Student Name', 115, startY + 6);
    doc.text('Section', 225, startY + 6);
    doc.text('Score', 285, startY + 6);
    doc.text('%', 330, startY + 6);
    doc.text('Mastery Status', 365, startY + 6);
    doc.text('Security', 465, startY + 6);

    let curY = startY + 22;

    records.forEach((r, i) => {
      if (curY > 750) {
        doc.addPage();
        curY = 50;
      }

      const rowBg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      doc.rect(40, curY, 515, 18).fill(rowBg);

      doc.font('Helvetica').fontSize(8).fillColor('#111827');
      doc.text(r.lrn_or_id, 45, curY + 5);
      doc.text(`${r.last_name}, ${r.first_name}`, 115, curY + 5, { width: 105, ellipsis: true });
      doc.text(r.section || '-', 225, curY + 5);
      doc.text(`${r.score_obtained}/${r.total_points}`, 285, curY + 5);
      doc.text(`${r.percentage}%`, 330, curY + 5);

      // Mastery Color
      const masteryColor = r.mastery_status === 'MASTERED' ? '#166534' : (r.mastery_status === 'NEEDS_REINFORCEMENT' ? '#854d0e' : '#991b1b');
      doc.fillColor(masteryColor).text(r.mastery_status || 'PENDING', 365, curY + 5);

      // Flag
      if (r.is_flagged_for_cheating) {
        doc.fillColor('#dc2626').text(`FLAGGED (${r.blur_count})`, 465, curY + 5);
      } else {
        doc.fillColor('#15803d').text('NORMAL', 465, curY + 5);
      }

      curY += 20;
    });

    doc.moveDown(2);
    if (curY > 720) {
      doc.addPage();
      curY = 50;
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text('SIGNATURES & VERIFICATION', 40, curY + 20);
    doc.moveDown(2);

    const signY = doc.y;
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    doc.text('Prepared by:', 40, signY);
    doc.font('Helvetica-Bold').text('CLEO PONCE', 40, signY + 25);
    doc.font('Helvetica').text('AP10 Subject Coordinator', 40, signY + 36);

    doc.text('Noted by:', 350, signY);
    doc.font('Helvetica-Bold').text('SCHOOL PRINCIPAL', 350, signY + 25);
    doc.font('Helvetica').text('High School Department', 350, signY + 36);

    doc.end();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  exportGradebookXLSX,
  exportReportPDF
};
