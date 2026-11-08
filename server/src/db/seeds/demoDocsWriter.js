/**
 * Generates:
 *  1. docs/demo-accounts/Aralytics_Demo_Accounts.xlsx (7-tab Excel workbook)
 *  2. docs/demo-accounts/Aralytics_Demo_Accounts.pdf  (Multi-page printable PDF directory)
 *  3. docs/demo-accounts/README.md                    (Markdown quick-reference)
 *  4. Real PDF/media fixture files in server/resources/materials/ and server/uploads/performance-tasks/
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const {
  DEMO_PASSWORD,
  SCHOOL_NAME,
  SCHOOL_YEAR,
  ADMIN_ACCOUNT,
  INSTRUCTORS,
  SECTION_CONFIGS,
  ENROLLED_STUDENTS,
  UNASSIGNED_STUDENTS
} = require('./demoRosterData');

const DEFAULT_DOCS_DIR = path.resolve(__dirname, '../../../../docs/demo-accounts');
const MATERIALS_DIR = path.resolve(__dirname, '../../../resources/materials');
const SUBMISSIONS_DIR = path.resolve(__dirname, '../../../uploads/performance-tasks');

function toRow(acc) {
  const fullName = acc.full_name || `${acc.first_name} ${acc.last_name}`;
  const isStaff = acc.role === 'ADMIN' || acc.role === 'TEACHER' || acc.application_status === 'PENDING';
  const uid = acc.id || acc.fallback_id || '';
  const loginMode = (uid.startsWith('user_') || acc.clerk_priority)
    ? 'Live Sign-In (Clerk + DB)'
    : 'Classroom Roster (DB)';
  return {
    'Category / Cohort': acc.cohort_group || (isStaff ? 'Staff & Instructors' : acc.section || 'Unassigned'),
    'Role': acc.application_status === 'PENDING' ? 'TEACHER (Pending Applicant)' : acc.role,
    'Login Mode': loginMode,
    'Profile / Testing State': acc.profile_type || (acc.application_status ? `Instructor (${acc.application_status})` : acc.role),
    'Full Name': fullName,
    'Email (Sign-In)': acc.email,
    'Password': DEMO_PASSWORD,
    'Section(s)': Array.isArray(acc.sections) ? acc.sections.join(', ') : (acc.section || '—'),
    'Adviser': acc.adviser_name || (acc.role === 'TEACHER' ? 'Self (Adviser)' : '—'),
    'Class Code': acc.class_code || '—',
    'LRN / Employee ID': acc.suggested_lrn ? `${acc.suggested_lrn} (use on form)` : (acc.employee_id || acc.lrn_or_id || '—'),
    'Enrollment / App Status': acc.application_status || acc.enrollment_status || 'ACTIVE',
    'Clerk / DB User ID': uid,
    'Testing Notes': acc.notes || ''
  };
}

function setColumnWidths(ws, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  ws['!cols'] = keys.map(k => {
    const maxLen = Math.max(
      k.length,
      ...rows.map(r => String(r[k] ?? '').length)
    );
    return { wch: Math.min(Math.max(maxLen + 3, 12), 58) };
  });
}

function writeExcelWorkbook(allAccounts, outPath) {
  const wb = XLSX.utils.book_new();

  // Tab 1: Quick Start (Top 22 Accounts + Class Codes)
  const quickAccounts = allAccounts.filter(a =>
    a.role === 'ADMIN' ||
    a.role === 'TEACHER' ||
    a.application_status === 'PENDING' ||
    a.quick_pick
  );
  const quickRows = quickAccounts.map(toRow);
  const wsQuick = XLSX.utils.json_to_sheet(quickRows);
  setColumnWidths(wsQuick, quickRows);
  XLSX.utils.book_append_sheet(wb, wsQuick, 'Quick Start (Top Picks)');

  // Tab 2: Instructors & Unassigned
  const staffAndUnassigned = allAccounts
    .filter(a => a.role === 'ADMIN' || a.role === 'TEACHER' || a.application_status === 'PENDING' || a.cohort_group === 'Unassigned / Onboarding')
    .map(toRow);
  const wsStaff = XLSX.utils.json_to_sheet(staffAndUnassigned);
  setColumnWidths(wsStaff, staffAndUnassigned);
  XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff & Unassigned (17)');

  // Tabs 3-6: Individual 35-student Section Rosters
  for (const cfg of SECTION_CONFIGS) {
    const secRows = allAccounts.filter(a => a.cohort_group === cfg.section).map(toRow);
    const wsSec = XLSX.utils.json_to_sheet(secRows);
    setColumnWidths(wsSec, secRows);
    XLSX.utils.book_append_sheet(wb, wsSec, `${cfg.section} (35)`);
  }

  // Tab 7: All 157 Accounts Master Table
  const masterRows = allAccounts.map(toRow);
  const wsMaster = XLSX.utils.json_to_sheet(masterRows);
  setColumnWidths(wsMaster, masterRows);
  XLSX.utils.book_append_sheet(wb, wsMaster, `All Accounts (${allAccounts.length})`);

  XLSX.writeFile(wb, outPath);
}

function writePdfDirectory(allAccounts, outPath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    const drawHeader = (title, subtitle) => {
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text(title);
      doc.font('Helvetica').fontSize(9.5).fillColor('#4B5563').text(subtitle);
      doc.moveDown(0.5);
    };

    const drawTable = (headers, widths, rows) => {
      const startX = doc.page.margins.left;
      let y = doc.y;
      const rowHeight = 16;

      const renderHeaderRow = () => {
        doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), rowHeight).fill('#1F2937');
        let x = startX + 4;
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FFFFFF');
        headers.forEach((h, idx) => {
          doc.text(h, x, y + 4, { width: widths[idx] - 8, lineBreak: false });
          x += widths[idx];
        });
        y += rowHeight;
      };

      renderHeaderRow();

      rows.forEach((r, rIdx) => {
        if (y + rowHeight > doc.page.height - doc.page.margins.bottom) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 32 });
          y = doc.page.margins.top;
          renderHeaderRow();
        }
        if (rIdx % 2 === 1) {
          doc.rect(startX, y, widths.reduce((a, b) => a + b, 0), rowHeight).fill('#F3F4F6');
        }
        let x = startX + 4;
        doc.font('Helvetica').fontSize(7.5).fillColor('#111827');
        r.forEach((cell, idx) => {
          doc.text(String(cell ?? ''), x, y + 4, { width: widths[idx] - 8, lineBreak: false });
          x += widths[idx];
        });
        y += rowHeight;
      });
      doc.y = y + 10;
    };

    // Page 1: Overview, Class Codes, Staff, Unassigned & Quick-Pick Students
    drawHeader(
      `Aralytics AP10 Demo & Test Accounts Directory (${allAccounts.length} Accounts)`,
      `${SCHOOL_NAME} · SY ${SCHOOL_YEAR} · Universal Password for All 157 Accounts: ${DEMO_PASSWORD}`
    );

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(
      'Active Class Codes:   RIZALAP26A (Cleo Ponce: 10-Rizal & 10-Bonifacio)   |   LUNAMAB26B (Ramon Magsaysay: 10-Luna)   |   MABINIAP26 (Trinidad Tecson: 10-Mabini)'
    );
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(11).text('1. Staff, Instructors & Unassigned / Onboarding Accounts (17)');
    doc.moveDown(0.2);
    const staffAndUnassigned = allAccounts.filter(
      a => a.role === 'ADMIN' || a.role === 'TEACHER' || a.application_status === 'PENDING' || a.cohort_group === 'Unassigned / Onboarding'
    );
    drawTable(
      ['Role / State', 'Full Name', 'Email (Sign-In)', 'Password', 'Section / Code', 'LRN / ID', 'Notes'],
      [120, 105, 185, 95, 95, 85, 92],
      staffAndUnassigned.map(a => [
        a.profile_type || a.role,
        a.full_name || `${a.first_name} ${a.last_name}`,
        a.email,
        DEMO_PASSWORD,
        Array.isArray(a.sections) && a.sections.length ? `${a.sections.join(',')} (${a.class_code})` : (a.section || a.class_code || '—'),
        a.suggested_lrn || a.employee_id || a.lrn_or_id,
        (a.notes || '').slice(0, 48)
      ])
    );

    // Pages 2-5: One page per 35-student section
    for (const cfg of SECTION_CONFIGS) {
      doc.addPage({ size: 'A4', layout: 'landscape', margin: 32 });
      drawHeader(
        `Section Roster: ${cfg.section} (35 Enrolled Students)`,
        `Adviser: ${cfg.adviserName} · Class Code: ${cfg.classCode} · Universal Password: ${DEMO_PASSWORD}`
      );
      const secStudents = allAccounts.filter(a => a.cohort_group === cfg.section);
      drawTable(
        ['#', 'Full Name', 'Email (Sign-In)', 'Password', 'LRN', 'Profile / Testing State', 'Notes'],
        [24, 115, 190, 95, 85, 145, 123],
        secStudents.map(s => [
          String(s.slot).padStart(2, '0'),
          s.full_name,
          s.email,
          DEMO_PASSWORD,
          s.lrn_or_id,
          s.profile_type,
          (s.notes || '').slice(0, 56)
        ])
      );
    }

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

function writeMarkdownGuide(allAccounts, outPath) {
  const quickPicks = allAccounts.filter(a => a.role === 'ADMIN' || a.role === 'TEACHER' || a.application_status === 'PENDING' || a.quick_pick);
  const lines = [
    `# Aralytics Demo & Test Accounts Directory (${allAccounts.length} Accounts)`,
    '',
    `- **Universal Password (all ${allAccounts.length} accounts):** \`${DEMO_PASSWORD}\``,
    `- **School / Year:** ${SCHOOL_NAME} · SY ${SCHOOL_YEAR}`,
    '- **Spreadsheet:** `docs/demo-accounts/Aralytics_Demo_Accounts.xlsx` (7 organized tabs)',
    '- **Printable PDF:** `docs/demo-accounts/Aralytics_Demo_Accounts.pdf`',
    '',
    '## Active Class Codes',
    '',
    '| Class Code | Adviser | Email | Sections Covered | Enrolled Students |',
    '| :--- | :--- | :--- | :--- | :---: |',
    '| **`RIZALAP26A`** | Cleo Ponce | `teacher.ponce+clerk_test@aralytics.edu.ph` | `10-Rizal`, `10-Bonifacio` | 70 (35 + 35) |',
    '| **`LUNAMAB26B`** | Ramon Magsaysay | `teacher.magsaysay+clerk_test@aralytics.edu.ph` | `10-Luna` | 35 |',
    '| **`MABINIAP26`** | Trinidad Tecson | `teacher.tecson+clerk_test@aralytics.edu.ph` | `10-Mabini` | 35 |',
    '',
    '## Quick-Start Accounts (Top Picks for Live Demos)',
    '',
    '| Role / State | Full Name | Email | Password | Section / Code | LRN / ID |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...quickPicks.map(a => `| **${a.profile_type || a.role}** | ${a.full_name || `${a.first_name} ${a.last_name}`} | \`${a.email}\` | \`${DEMO_PASSWORD}\` | ${Array.isArray(a.sections) && a.sections.length ? a.sections.join(', ') : (a.section || a.class_code || '—')} | \`${a.suggested_lrn || a.employee_id || a.lrn_or_id}\` |`),
    '',
    '## Unassigned & Onboarding Accounts (12)',
    '',
    '| State | Full Name | Email | Password | Target Section / Code | LRN to Use |',
    '| :--- | :--- | :--- | :--- | :--- | :--- |',
    ...allAccounts.filter(a => a.cohort_group === 'Unassigned / Onboarding').map(a =>
      `| ${a.profile_type} | ${a.full_name || `${a.first_name} ${a.last_name}`} | \`${a.email}\` | \`${DEMO_PASSWORD}\` | ${a.section || a.class_code} | \`${a.suggested_lrn || a.lrn_or_id}\` |`
    ),
    ''
  ];

  for (const cfg of SECTION_CONFIGS) {
    const sec = allAccounts.filter(a => a.cohort_group === cfg.section);
    lines.push(`## Section ${cfg.section} — 35 Students (Adviser: ${cfg.adviserName} · Code: \`${cfg.classCode}\`)`, '');
    lines.push('| # | Full Name | Email | Password | LRN | Login Mode | Pre-Seeded State |');
    lines.push('| :-: | :--- | :--- | :--- | :--- | :--- | :--- |');
    for (const s of sec) {
      const mode = ((s.id || '').startsWith('user_') || s.clerk_priority) ? 'Live Sign-In' : 'Classroom Roster';
      lines.push(`| ${String(s.slot).padStart(2, '0')} | ${s.full_name} | \`${s.email}\` | \`${DEMO_PASSWORD}\` | \`${s.lrn_or_id}\` | ${mode} | ${s.profile_type} |`);
    }
    lines.push('');
  }

  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
}

function makeSimplePdfBuffer(title, subtitle, bodyText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).text(title);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(11).fillColor('#4B5563').text(subtitle);
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(11).fillColor('#111827').text(bodyText, { lineGap: 4 });
    doc.end();
  });
}

async function ensureDemoResourceFiles(materialFiles = [], submissionFiles = []) {
  try {
    fs.mkdirSync(MATERIALS_DIR, { recursive: true });
    fs.mkdirSync(SUBMISSIONS_DIR, { recursive: true });

    for (const item of materialFiles) {
      const target = path.join(MATERIALS_DIR, item.fileName);
      if (fs.existsSync(target)) continue;
      const buf = await makeSimplePdfBuffer(
        item.title,
        `Araling Panlipunan 10 · ${SCHOOL_NAME} · ${item.competencyId}`,
        `${item.description || item.title}\n\nThis instructional material is pre-loaded for Aralytics classroom demonstrations, offline reading verification, and remediation routing.`
      );
      fs.writeFileSync(target, buf);
    }

    for (const sub of submissionFiles) {
      const target = path.join(SUBMISSIONS_DIR, sub.fileName);
      if (fs.existsSync(target)) continue;
      const buf = await makeSimplePdfBuffer(
        sub.title,
        `Submitted by ${sub.studentName} (${sub.section})`,
        `Performance Task Submission\n\nStudent Note: ${sub.notes || 'Attached is my completed AP10 performance task.'}`
      );
      fs.writeFileSync(target, buf);
    }
  } catch (err) {
    if (err.code !== 'EPERM' && err.code !== 'EACCES') throw err;
  }
}

async function writeDemoAccountDocs(allAccounts, docsDir = DEFAULT_DOCS_DIR) {
  fs.mkdirSync(docsDir, { recursive: true });
  const xlsxPath = path.join(docsDir, 'Aralytics_Demo_Accounts.xlsx');
  const pdfPath = path.join(docsDir, 'Aralytics_Demo_Accounts.pdf');
  const mdPath = path.join(docsDir, 'README.md');

  writeExcelWorkbook(allAccounts, xlsxPath);
  await writePdfDirectory(allAccounts, pdfPath);
  writeMarkdownGuide(allAccounts, mdPath);

  return { xlsxPath, pdfPath, mdPath };
}

module.exports = {
  writeDemoAccountDocs,
  ensureDemoResourceFiles,
  DEFAULT_DOCS_DIR
};
