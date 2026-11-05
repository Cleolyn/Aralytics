/**
 * Demo AP10 course content (restored from the startup seed removed in 0ab4d3c):
 *  - instructional and remedial materials
 *  - the CBDRRM quiz with all six question formats (SRS FR-16)
 *  - graded learner responses for psychometric item analysis (FR-21, FR-40)
 *  - performance tasks with sample submissions (FR-43, FR-44)
 *
 * Idempotent. Requires seedUsers() to have run first. SQLite/Turso syntax.
 */
const crypto = require('crypto');
const db = require('../../config/database');
const { isCorrect } = require('../../services/gradeAnswers');

const TEACHER_ID = 'usr-teacher-001';
const QUIZ_ID = 'quiz-ap10-cbdrrm-01';

const TRUE_FALSE_OPTIONS = [{ id: 'TRUE', text: 'Tama (True)' }, { id: 'FALSE', text: 'Mali (False)' }];

const QUESTIONS = [
  {
    id: 'q-cbdrrm-01', type: 'MULTIPLE_CHOICE', answer: 'B',
    text: 'Ano ang pangunahing katangian ng Community-Based Disaster Risk Reduction and Management (CBDRRM) Approach?',
    options: [
      { id: 'A', text: 'Ang pamahalaan lamang ang may pananagutan sa pagpaplano.' },
      { id: 'B', text: 'Aktibong pakikilahok ng mga mamamayan sa pagtukoy at pagtugon sa mga panganib.' },
      { id: 'C', text: 'Pagtutok lamang sa pamamahagi ng relief goods pagkatapos ng bagyo.' },
      { id: 'D', text: 'Paghintay sa tulong mula sa mga dayuhang organisasyon.' }
    ]
  },
  {
    id: 'q-cbdrrm-02', type: 'MULTIPLE_CHOICE', answer: 'C',
    text: 'Alin sa mga sumusunod ang tamang pagkakaiba ng Top-Down Approach at Bottom-Up Approach?',
    options: [
      { id: 'A', text: 'Ang Top-Down ay umaasa sa mamamayan; ang Bottom-Up ay puro pamahalaan.' },
      { id: 'B', text: 'Walang pagkakaiba ang dalawang pamamaraan.' },
      { id: 'C', text: 'Sa Top-Down, lahat ng desisyon ay nagmumula sa mataas na opisyal; sa Bottom-Up, nagsisimula sa lokal na komunidad.' },
      { id: 'D', text: 'Ang Bottom-Up ay hindi epektibo sa Pilipinas.' }
    ]
  },
  {
    id: 'q-cbdrrm-03', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Ang Hazard Assessment ay tumutukoy sa pagsusuri sa lawak, sakop, at pinsala na maaaring idulot ng isang kalamidad.'
  },
  {
    id: 'q-cbdrrm-04', type: 'MULTIPLE_CHOICE', answer: 'B',
    text: 'Ano ang tawag sa kahinaan ng isang komunidad na nagdudulot ng mataas na tsansa ng pinsala mula sa kalamidad?',
    options: [
      { id: 'A', text: 'Resilience' },
      { id: 'B', text: 'Vulnerability' },
      { id: 'C', text: 'Mitigation' },
      { id: 'D', text: 'Adaptation' }
    ]
  },
  {
    id: 'q-cbdrrm-05', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Ang CBDRRM plan ay binubuo ng Disaster Prevention and Mitigation, Preparedness, Response, at Rehabilitation/Recovery.'
  },
  {
    id: 'q-cbdrrm-06', type: 'IDENTIFICATION', answer: 'Paris Agreement|Kasunduang Paris|Paris Accord', options: null,
    text: 'Ano ang tawag sa pandaigdigang kasunduan sa ilalim ng UNFCCC na naglalayong limitahan ang pagtaas ng global average temperature sa 1.5 degrees Celsius?'
  },
  {
    id: 'q-cbdrrm-07', type: 'MATCHING', answer: JSON.stringify({ p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' }),
    text: 'Pagtambalin ang bawat yugto ng CBDRRM sa tamang pangunahing layunin at gawain nito.',
    options: {
      premises: [
        { id: 'p1', text: 'Yugto 1: Disaster Prevention & Mitigation' },
        { id: 'p2', text: 'Yugto 2: Disaster Preparedness' },
        { id: 'p3', text: 'Yugto 3: Disaster Response' },
        { id: 'p4', text: 'Yugto 4: Disaster Rehabilitation' }
      ],
      responses: [
        { id: 'r1', text: 'Pagtataya ng panganib (Hazard Assessment) at mitigasyon' },
        { id: 'r2', text: 'Pagsasagawa ng evacuation drills at paghahanda ng Go-Bag' },
        { id: 'r3', text: 'Search, rescue, at pamamahagi ng relief goods' },
        { id: 'r4', text: 'Pagbabalik ng mga nasirang pasilidad at kabuhayan' }
      ]
    }
  },
  {
    id: 'q-cbdrrm-08', type: 'SITUATIONAL', answer: 'B',
    text: 'Sitwasyon: Isang malakas na storm surge warning ang ibinaba sa inyong coastal purok, subalit maraming mangingisda ang tumatangging lumikas dahil sa kanilang mga bangka. Batay sa participatory disaster governance, ano ang pinaka-epektibong hakbang ng barangay lider?',
    options: [
      { id: 'A', text: 'Hayaan sila at balikan na lamang pagkatapos ng bagyo.' },
      { id: 'B', text: 'Magpatupad ng maagap na paglikas kasabay ng pagtatatag ng ligtas na secured boat harbor na pinangangasiwaan ng barangay task force.' },
      { id: 'C', text: 'Ipagbawal ang pamamahagi ng relief goods sa mga ayaw lumikas.' },
      { id: 'D', text: 'Ipaubaya ang desisyon sa bawat pamilya nang walang interbensyon.' }
    ]
  },
  {
    id: 'q-cbdrrm-09', type: 'PISA_LIKE', answer: 'B',
    text: 'Pagsusuri ng Datos (PISA-Style Scientific & Critical Literacy): Ipinapakita sa ulat ng NDRRMC na ang mga komunidad na may 100% community-level hazard mapping ay nagtala ng 85% mas mababang casualty rate sa panahon ng bagyo kumpara sa mga komunidad na umasa lamang sa pambansang direktiba. Batay sa datos at sa konsepto ng CBDRRM, aling pangungusap ang nagpapaliwanag ng ugnayang ito?',
    options: [
      { id: 'A', text: 'Ang mga pambansang ahensya ay walang kagamitan para sa pagtugon sa bagyo.' },
      { id: 'B', text: 'Ang lokal na kaalaman at aktibong partisipasyon ay nagpapabilis sa agaran at angkop na pagtugon ng mga residente sa hazard zones.' },
      { id: 'C', text: 'Ang hazard map ay pisikal na humaharang sa pagdating ng mga bagyo.' },
      { id: 'D', text: 'Hindi na kailangan ng pondo mula sa gobyerno kung may hazard map.' }
    ]
  }
];

// Learner answer profiles (one entry per question, in order) spanning all mastery tiers.
const MATCH_ALL = { p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' };
const RESPONSE_PROFILES = [
  ['B', 'C', 'TRUE', 'B', 'TRUE', 'Paris Agreement', MATCH_ALL, 'B', 'B'],
  ['B', 'C', 'TRUE', 'A', 'TRUE', 'Kasunduang Paris', MATCH_ALL, 'B', 'B'],
  ['B', 'A', 'TRUE', 'C', 'TRUE', 'Paris Accord', MATCH_ALL, 'B', 'B'],
  ['B', 'B', 'TRUE', 'B', 'FALSE', 'Paris Agreement', MATCH_ALL, 'A', 'B'],
  ['A', 'C', 'FALSE', 'B', 'TRUE', 'Kyoto Protocol', MATCH_ALL, 'C', 'B'],
  ['A', 'D', 'TRUE', 'A', 'FALSE', 'Montreal Protocol', { p1: 'r1', p2: 'r2', p3: 'r4', p4: 'r3' }, 'D', 'B'],
  ['C', 'B', 'FALSE', 'C', 'TRUE', 'UNFCCC', { p1: 'r2', p2: 'r1', p3: 'r3', p4: 'r4' }, 'A', 'A'],
  ['B', 'C', 'TRUE', 'B', 'TRUE', 'Paris Agreement', MATCH_ALL, 'B', 'D']
];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function countRows(sql, params = []) {
  const { rows } = await db.query(sql, params);
  return Number(rows[0].count || 0);
}

async function seedMaterials() {
  const lessons = [
    ['mat-ap10-001', 'comp-ap10-q1-001', 'Modyul 1: Introduksyon sa Kontemporaryong Isyu.pdf', 'Opisyal na babasahin sa kahalagahan at saklaw ng kontemporaryong isyu.', 'PDF', 'mod1_intro_ki.pdf', 2450000],
    ['mat-ap10-002', 'comp-ap10-q1-003', 'Presentasyon: CBDRRM Framework & Disaster Preparedness.pptx', 'Slide deck sa bottom-up approach at disaster management cycle.', 'PPTX', 'cbdrrm_slides.pptx', 4120000],
    ['mat-ap10-003', 'comp-ap10-q1-002', 'Dokumentaryo: Epekto ng Climate Change sa Pilipinas.mp4', 'Bidyo-aralin ukol sa pagbaha, polusyon sa hangin, at pagkasira ng kabundukan.', 'MP4', 'climate_change_ph.mp4', 18450000]
  ];
  for (const [id, competencyId, title, description, fileType, fileName, size] of lessons) {
    await db.query(
      `INSERT INTO instructional_materials (id, competency_id, title, description, file_type, storage_url, file_size_bytes, content_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      [id, competencyId, title, description, fileType, `/api/materials/download/${fileName}`, size, sha256(fileName), TEACHER_ID]
    );
  }

  const remedial = [
    ['mat-rem-001', 'CBDRRM Remedial Reviewer & Study Guide.pdf', 'cbdrrm_remedial.pdf', 'PDF', 'comp-ap10-q1-003', 1],
    ['mat-rem-002', 'Lektyur: Pagbawi sa Kahinaan sa CBDRRM.mp4', 'cbdrrm_recovery.mp4', 'VIDEO', 'comp-ap10-q1-003', 1],
    ['mat-std-001', 'Introduksyon sa Kontemporaryong Isyu.pdf', 'intro_ki.pdf', 'PDF', 'comp-ap10-q1-001', 0]
  ];
  for (const [id, title, fileName, fileType, competencyId, isRemedial] of remedial) {
    await db.query(
      `INSERT INTO materials (id, title, file_path, file_type, competency_id, is_remedial, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      [id, title, `/api/materials/download/${fileName}`, fileType, competencyId, isRemedial, TEACHER_ID]
    );
  }
}

async function seedQuiz() {
  await db.query(
    `INSERT INTO quizzes (id, competency_id, title, instructions, time_limit_minutes, total_points, passing_score, max_blur_limit, is_published, created_by)
     VALUES (?, 'comp-ap10-q1-003', 'Pagsusuri sa CBDRRM Approach at Kahandaan sa Kalamidad',
       'Basahing mabuti ang bawat tanong. Mahigpit na ipinagbabawal ang paglipat ng tab o window habang sumasagot. Ang higit sa 3 paglabag ay magmamarka ng cheating flag.',
       15, ?, 7, 3, 1, ?) ON CONFLICT(id) DO NOTHING`,
    [QUIZ_ID, QUESTIONS.length, TEACHER_ID]
  );

  for (const [index, q] of QUESTIONS.entries()) {
    await db.query(
      `INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT(id) DO NOTHING`,
      [q.id, QUIZ_ID, q.text, q.type, q.options ? JSON.stringify(q.options) : null, q.answer, index + 1]
    );
  }
}

async function seedQuizResponses() {
  const existing = await countRows(
    `SELECT COUNT(*) as count FROM quiz_submission_answers a
     JOIN quiz_submissions s ON s.id = a.submission_id WHERE s.quiz_id = ?`,
    [QUIZ_ID]
  );
  if (existing > 0) return;

  const { rows: questions } = await db.query('SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC', [QUIZ_ID]);
  const { rows: students } = await db.query("SELECT id FROM users WHERE role = 'STUDENT' ORDER BY id");

  for (const [i, student] of students.entries()) {
    const profile = RESPONSE_PROFILES[i % RESPONSE_PROFILES.length];
    const submissionId = `sub-init-${student.id}-${i}`;
    let score = 0;

    await db.query(
      `INSERT OR REPLACE INTO quiz_submissions
       (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
       VALUES (?, ?, ?, datetime('now', '-2 days'), datetime('now', '-2 days'), 0, 0, 0, 0, 0, 'SUBMITTED')`,
      [submissionId, QUIZ_ID, student.id]
    );

    for (const [order, question] of questions.entries()) {
      const answer = profile[order] ?? 'B';
      const correct = isCorrect(question, answer);
      const points = correct ? Number(question.points) || 1 : 0;
      score += points;
      await db.query(
        `INSERT INTO quiz_submission_answers (id, submission_id, question_id, selected_answer, is_correct, points_awarded)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [`qsa-init-${submissionId}-${question.id}`, submissionId, question.id,
          typeof answer === 'object' ? JSON.stringify(answer) : String(answer), correct ? 1 : 0, points]
      );
    }

    const percentage = Number(((score / questions.length) * 100).toFixed(2));
    await db.query(
      'UPDATE quiz_submissions SET score_obtained = ?, percentage = ?, is_passed = ? WHERE id = ?',
      [score, percentage, score >= 7 ? 1 : 0, submissionId]
    );
  }
}

async function seedPerformanceTasks() {
  if (await countRows('SELECT COUNT(*) as count FROM performance_tasks') > 0) return;

  await db.query(
    `INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, rubric_criteria, total_points, due_date, created_by) VALUES
    ('pt-q1-cbdrrm-01', 'Q1', 'comp-ap10-q1-004', 'Barangay CBDRRM Hazard & Evacuation Map Action Plan', 'Gumawa ng komprehensibong hazard map at evacuation plan para sa sariling barangay gamit ang natutunan sa CBDRRM Approach. I-upload ang file bilang PDF, PPT, o DOCX document.', 'Nilalaman at Kaangkupan: 40%, Organisasyon at Kalinawan ng Mapa: 30%, Praktikalidad sa Komunidad: 30%', 100, datetime('now', '+14 days'), ?),
    ('pt-q1-env-02', 'Q1', 'comp-ap10-q1-002', 'Photo-Essay: Pagsusuri sa Suliraning Solid Waste sa Pamayanan', 'Kumuha o magtipon ng 5 larawan na nagpapakita ng isyu sa solid waste at gumawa ng kritikal na pagsusuri at mungkahing solusyon bilang kabataang lider.', 'Mapanuring Pag-iisip: 40%, Biswal na Presentasyon: 30%, Realistikong Solusyon: 30%', 100, datetime('now', '+7 days'), ?)`,
    [TEACHER_ID, TEACHER_ID]
  );

  await db.query(
    `INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url, file_size_bytes, notes, score, feedback, status) VALUES
    ('pts-001', 'pt-q1-cbdrrm-01', 'usr-student-001', 'Barangay_San_Jose_CBDRRM_Plan_JuanDelaCruz.pdf', '/api/performance-tasks/files/Barangay_San_Jose_CBDRRM_Plan_JuanDelaCruz.pdf', 3450000, 'Ipinapasa ko po ang aming barangay hazard plan.', 92, 'Mahusay na pagsusuri sa hazard zones at malinaw ang evacuation routes.', 'GRADED'),
    ('pts-002', 'pt-q1-cbdrrm-01', 'usr-student-002', 'Evacuation_Plan_MariaClara.docx', '/api/performance-tasks/files/Evacuation_Plan_MariaClara.docx', 2150000, 'Attached po ang aking family and purok evacuation checklist.', NULL, NULL, 'SUBMITTED')`
  );
}

async function seedCourse() {
  await seedMaterials();
  await seedQuiz();
  await seedQuizResponses();
  await seedPerformanceTasks();
  console.log(`[SEED] Demo course ready (quiz ${QUIZ_ID} with ${QUESTIONS.length} questions, materials, performance tasks).`);
}

module.exports = { seedCourse, QUIZ_ID };
