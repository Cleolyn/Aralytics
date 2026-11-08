/**
 * Provisions the 157 Aralytics demo & test accounts in Clerk and the database,
 * seeds multi-teacher classrooms (35 students/section across 4 sections),
 * deadlines, submissions, proctoring logs, and remedial plans, and exports
 * docs/demo-accounts/{Aralytics_Demo_Accounts.xlsx, Aralytics_Demo_Accounts.pdf, README.md}.
 *
 * Usage:
 *   node src/db/seeds/demoAccounts.js --allow-remote
 *   node src/db/seeds/demoAccounts.js --no-clerk      (database + docs only, using fallback IDs)
 */
const crypto = require('crypto');
const db = require('../../config/database');
const { initializeDatabase } = require('../init');
const { hashCode } = require('../../services/enrollmentService');
const { isCorrect } = require('../../services/gradeAnswers');
const {
  DEMO_PASSWORD,
  SCHOOL_YEAR,
  ADMIN_ACCOUNT,
  INSTRUCTORS,
  ENROLLED_STUDENTS,
  UNASSIGNED_STUDENTS
} = require('./demoRosterData');
const { writeDemoAccountDocs, ensureDemoResourceFiles } = require('./demoDocsWriter');

const sha256 = v => crypto.createHash('sha256').update(String(v)).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function runInBatches(items, batchSize, worker) {
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    await Promise.all(chunk.map(worker));
  }
}

const TRUE_FALSE_OPTIONS = [{ id: 'TRUE', text: 'Tama (True)' }, { id: 'FALSE', text: 'Mali (False)' }];
const MATCH_ALL = { p1: 'r1', p2: 'r2', p3: 'r3', p4: 'r4' };

const CBDRRM_QUESTIONS = [
  {
    suffix: '01', type: 'MULTIPLE_CHOICE', answer: 'B',
    text: 'Ano ang pangunahing katangian ng Community-Based Disaster Risk Reduction and Management (CBDRRM) Approach?',
    options: [
      { id: 'A', text: 'Ang pamahalaan lamang ang may pananagutan sa pagpaplano.' },
      { id: 'B', text: 'Aktibong pakikilahok ng mga mamamayan sa pagtukoy at pagtugon sa mga panganib.' },
      { id: 'C', text: 'Pagtutok lamang sa pamamahagi ng relief goods pagkatapos ng bagyo.' },
      { id: 'D', text: 'Paghintay sa tulong mula sa mga dayuhang organisasyon.' }
    ]
  },
  {
    suffix: '02', type: 'MULTIPLE_CHOICE', answer: 'C',
    text: 'Alin sa mga sumusunod ang tamang pagkakaiba ng Top-Down Approach at Bottom-Up Approach?',
    options: [
      { id: 'A', text: 'Ang Top-Down ay umaasa sa mamamayan; ang Bottom-Up ay puro pamahalaan.' },
      { id: 'B', text: 'Walang pagkakaiba ang dalawang pamamaraan.' },
      { id: 'C', text: 'Sa Top-Down, lahat ng desisyon ay nagmumula sa mataas na opisyal; sa Bottom-Up, nagsisimula sa lokal na komunidad.' },
      { id: 'D', text: 'Ang Bottom-Up ay hindi epektibo sa Pilipinas.' }
    ]
  },
  {
    suffix: '03', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Ang Hazard Assessment ay tumutukoy sa pagsusuri sa lawak, sakop, at pinsala na maaaring idulot ng isang kalamidad.'
  },
  {
    suffix: '04', type: 'MULTIPLE_CHOICE', answer: 'B',
    text: 'Ano ang tawag sa kahinaan ng isang komunidad na nagdudulot ng mataas na tsansa ng pinsala mula sa kalamidad?',
    options: [
      { id: 'A', text: 'Resilience' },
      { id: 'B', text: 'Vulnerability' },
      { id: 'C', text: 'Mitigation' },
      { id: 'D', text: 'Adaptation' }
    ]
  },
  {
    suffix: '05', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Ang CBDRRM plan ay binubuo ng Disaster Prevention and Mitigation, Preparedness, Response, at Rehabilitation/Recovery.'
  },
  {
    suffix: '06', type: 'IDENTIFICATION', answer: 'Paris Agreement|Kasunduang Paris|Paris Accord', options: null,
    text: 'Ano ang tawag sa pandaigdigang kasunduan sa ilalim ng UNFCCC na naglalayong limitahan ang pagtaas ng global average temperature sa 1.5 degrees Celsius?'
  },
  {
    suffix: '07', type: 'MATCHING', answer: JSON.stringify(MATCH_ALL),
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
    suffix: '08', type: 'SITUATIONAL', answer: 'B',
    text: 'Sitwasyon: Isang malakas na storm surge warning ang ibinaba sa inyong coastal purok, subalit maraming mangingisda ang tumatangging lumikas dahil sa kanilang mga bangka. Ano ang pinaka-epektibong hakbang ng barangay lider?',
    options: [
      { id: 'A', text: 'Hayaan sila at balikan na lamang pagkatapos ng bagyo.' },
      { id: 'B', text: 'Magpatupad ng maagap na paglikas kasabay ng pagtatatag ng ligtas na secured boat harbor na pinangangasiwaan ng barangay task force.' },
      { id: 'C', text: 'Ipagbawal ang pamamahagi ng relief goods sa mga ayaw lumikas.' },
      { id: 'D', text: 'Ipaubaya ang desisyon sa bawat pamilya nang walang interbensyon.' }
    ]
  },
  {
    suffix: '09', type: 'PISA_LIKE', answer: 'B',
    text: 'Pagsusuri ng Datos (PISA-Style): Ipinapakita sa ulat ng NDRRMC na ang mga komunidad na may 100% community-level hazard mapping ay nagtala ng 85% mas mababang casualty rate. Aling pangungusap ang nagpapaliwanag ng ugnayang ito?',
    options: [
      { id: 'A', text: 'Ang mga pambansang ahensya ay walang kagamitan para sa pagtugon sa bagyo.' },
      { id: 'B', text: 'Ang lokal na kaalaman at aktibong partisipasyon ay nagpapabilis sa agaran at angkop na pagtugon ng mga residente sa hazard zones.' },
      { id: 'C', text: 'Ang hazard map ay pisikal na humaharang sa pagdating ng mga bagyo.' },
      { id: 'D', text: 'Hindi na kailangan ng pondo mula sa gobyerno kung may hazard map.' }
    ]
  }
];

const SHORT_QUIZ_QUESTIONS = [
  {
    suffix: '01', type: 'MULTIPLE_CHOICE', answer: 'A',
    text: 'Alin sa mga sumusunod ang itinuturing na Kontemporaryong Isyu?',
    options: [
      { id: 'A', text: 'Patuloy na pagtaas ng temperatura at epekto ng Climate Change sa agrikultura.' },
      { id: 'B', text: 'Personal na alitan ng dalawang magkapitbahay.' },
      { id: 'C', text: 'Tsismis tungkol sa isang artista.' },
      { id: 'D', text: 'Mga sinaunang alamat ng barangay.' }
    ]
  },
  {
    suffix: '02', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Mahalagang suriin ang primarya at sekundaryang sanggunian bago bumuo ng konklusyon sa isang isyung panlipunan.'
  },
  {
    suffix: '03', type: 'MULTIPLE_CHOICE', answer: 'C',
    text: 'Anong batas sa Pilipinas ang kilala bilang Ecological Solid Waste Management Act of 2000?',
    options: [
      { id: 'A', text: 'RA 8749' },
      { id: 'B', text: 'RA 9275' },
      { id: 'C', text: 'RA 9003' },
      { id: 'D', text: 'RA 10121' }
    ]
  },
  {
    suffix: '04', type: 'TRUE_FALSE', answer: 'TRUE', options: TRUE_FALSE_OPTIONS,
    text: 'Ang RA 10121 ang nagtatag ng National Disaster Risk Reduction and Management Council (NDRRMC).'
  },
  {
    suffix: '05', type: 'SITUATIONAL', answer: 'B',
    text: 'Kung ikaw ay gagawa ng pansariling Disaster Preparedness Plan sa tahanan, alin ang dapat unahin?',
    options: [
      { id: 'A', text: 'Mag-post muna sa social media.' },
      { id: 'B', text: 'Tukuyin ang mga hazard sa loob ng bahay, maghanda ng Go-Bag, at alamin ang pinakamalapit na evacuation center.' },
      { id: 'C', text: 'Hintayin ang pagdating ng bagyo bago magplano.' },
      { id: 'D', text: 'Bumili lamang ng maraming laruan.' }
    ]
  }
];

function buildAllAccountDefinitions() {
  const staff = [
    { ...ADMIN_ACCOUNT, clerk_priority: true, full_name: `${ADMIN_ACCOUNT.first_name} ${ADMIN_ACCOUNT.last_name}` },
    ...INSTRUCTORS.map(inst => ({
      ...inst,
      clerk_priority: true,
      full_name: `${inst.first_name} ${inst.last_name}`,
      cohort_group: 'Staff & Instructors',
      profile_type: inst.application_status === 'PENDING' ? 'Instructor Applicant (PENDING)' : `Approved Instructor (${inst.sections.join(' & ')})`,
      quick_pick: true
    }))
  ];
  return [
    ...staff,
    ...ENROLLED_STUDENTS,
    ...UNASSIGNED_STUDENTS.map(u => ({ ...u, clerk_priority: true, full_name: `${u.first_name} ${u.last_name}` }))
  ];
}

async function syncAccountsWithClerk(accounts, { useClerk = true } = {}) {
  if (!useClerk || !process.env.CLERK_SECRET_KEY) {
    console.log('[DEMO] Skipping Clerk API provisioning (--no-clerk or no CLERK_SECRET_KEY); using deterministic fallback IDs.');
    for (const acc of accounts) acc.id = acc.fallback_id;
    return;
  }

  const { createClerkClient } = require('@clerk/express');
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  console.log('[DEMO] Fetching existing Clerk users...');
  const existingByEmail = new Map();
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await clerk.users.getUserList({ limit, offset });
    const list = Array.isArray(res) ? res : (res?.data || []);
    for (const u of list) {
      for (const e of (u.emailAddresses || [])) {
        if (e.emailAddress) existingByEmail.set(e.emailAddress.toLowerCase(), u);
      }
    }
    if (list.length < limit) break;
    offset += limit;
  }
  console.log(`[DEMO] Found ${existingByEmail.size} existing users in Clerk.`);

  // Reclaim Clerk slots from non-priority demo accounts if priority demo accounts are missing
  const missingPriorityCount = accounts.filter(a => a.clerk_priority && !existingByEmail.has(a.email.toLowerCase())).length;
  const existingNonPriority = accounts.filter(a => !a.clerk_priority && existingByEmail.has(a.email.toLowerCase()));
  if (missingPriorityCount > 0 && existingNonPriority.length > 0) {
    const toReclaim = existingNonPriority.slice(0, missingPriorityCount);
    console.log(`[DEMO] Reclaiming ${toReclaim.length} Clerk dev slot(s) from mid-pack roster accounts so all 4 sections & onboarding accounts have live Clerk sign-in...`);
    await runInBatches(toReclaim, 3, async acc => {
      const existing = existingByEmail.get(acc.email.toLowerCase());
      if (existing) {
        try {
          await clerk.users.deleteUser(existing.id);
          existingByEmail.delete(acc.email.toLowerCase());
        } catch { /* ignore */ }
      }
    });
  }

  let createdCount = 0;
  let reusedCount = 0;
  const toCreate = [];

  for (const acc of accounts) {
    const existing = existingByEmail.get(acc.email.toLowerCase());
    if (existing) {
      acc.id = existing.id;
      reusedCount++;
    } else if (acc.clerk_priority) {
      toCreate.push(acc);
    } else {
      acc.id = acc.fallback_id;
    }
  }

  let quotaReached = false;
  if (toCreate.length > 0) {
    console.log(`[DEMO] Creating ${toCreate.length} priority test accounts in Clerk (throttled)...`);
    const batchSize = 3;
    for (let i = 0; i < toCreate.length; i += batchSize) {
      const batch = toCreate.slice(i, i + batchSize);
      await Promise.all(batch.map(async acc => {
        if (quotaReached) {
          acc.id = acc.fallback_id;
          return;
        }
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const created = await clerk.users.createUser({
              emailAddress: [acc.email],
              password: DEMO_PASSWORD,
              firstName: acc.first_name,
              lastName: acc.last_name,
              skipPasswordChecks: true,
              skipPasswordRequirement: true
            });
            acc.id = created.id;
            createdCount++;
            break;
          } catch (err) {
            const status = err?.status || err?.statusCode;
            if (status === 429 && attempt < 4) {
              await sleep(1200 * attempt);
              continue;
            }
            if (status === 422) {
              const lookup = await clerk.users.getUserList({ emailAddress: [acc.email] });
              const list = Array.isArray(lookup) ? lookup : (lookup?.data || []);
              if (list[0]) {
                acc.id = list[0].id;
                reusedCount++;
                break;
              }
            }
            if (status === 403) {
              quotaReached = true;
            }
            acc.id = acc.fallback_id;
            break;
          }
        }
      }));
      if ((i + batchSize) % 30 === 0 || i + batchSize >= toCreate.length) {
        console.log(`[DEMO] Clerk progress: ${Math.min(i + batchSize, toCreate.length)}/${toCreate.length} processed...`);
      }
      await sleep(220);
    }
  }

  console.log(`[DEMO] Clerk sync complete: ${createdCount} created, ${reusedCount} reused.`);
}

async function replaceStaleUserIfNeeded(acc) {
  const { rows: conflicts } = await db.query(
    'SELECT id FROM users WHERE (email = ? OR lrn_or_id = ? OR id = ?) AND id != ?',
    [acc.email, acc.lrn_or_id, acc.fallback_id, acc.id]
  );
  for (const row of conflicts) {
    const oldId = row.id;
    for (const [sql, params] of [
      ['UPDATE quizzes SET created_by = ? WHERE created_by = ?', [acc.id, oldId]],
      ['UPDATE instructional_materials SET created_by = ? WHERE created_by = ?', [acc.id, oldId]],
      ['UPDATE materials SET uploaded_by = ? WHERE uploaded_by = ?', [acc.id, oldId]],
      ['UPDATE performance_tasks SET created_by = ? WHERE created_by = ?', [acc.id, oldId]],
      ['UPDATE class_invitations SET teacher_id = ? WHERE teacher_id = ?', [acc.id, oldId]],
      ['DELETE FROM enrollment_requests WHERE user_id = ?', [oldId]],
      ['DELETE FROM instructor_applications WHERE user_id = ?', [oldId]],
      ['DELETE FROM quiz_submissions WHERE student_id = ?', [oldId]],
      ['DELETE FROM quiz_attempts WHERE student_id = ?', [oldId]],
      ['DELETE FROM interventions WHERE student_id = ?', [oldId]],
      ['DELETE FROM remedial_interventions WHERE student_id = ?', [oldId]],
      ['DELETE FROM performance_task_submissions WHERE student_id = ?', [oldId]],
      ['DELETE FROM material_read_logs WHERE student_id = ?', [oldId]]
    ]) {
      try { await db.query(sql, params); } catch { /* ignore if parent not yet present */ }
    }
  }
}

async function upsertUserRecord(acc) {
  const { rows: conflicts } = await db.query(
    'SELECT id FROM users WHERE (email = ? OR lrn_or_id = ? OR id = ?) AND id != ?',
    [acc.email, acc.lrn_or_id, acc.fallback_id, acc.id]
  );
  if (conflicts.length > 0) {
    for (const [idx, c] of conflicts.entries()) {
      await db.query(
        'UPDATE users SET email = ?, lrn_or_id = ? WHERE id = ?',
        [`stale-${idx}-${Date.now()}-${c.id}@stale.local`, `stale-${idx}-${Date.now()}-${c.id}`, c.id]
      );
    }
  }

  await db.query(
    `INSERT INTO users (id, lrn_or_id, first_name, last_name, full_name, email, password_hash, role, section, section_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'CLERK_MANAGED_AUTH', ?, ?, ?, 'ACTIVE')
     ON CONFLICT(id) DO UPDATE SET
       lrn_or_id = excluded.lrn_or_id,
       first_name = excluded.first_name,
       last_name = excluded.last_name,
       full_name = excluded.full_name,
       email = excluded.email,
       role = excluded.role,
       section = excluded.section,
       section_id = excluded.section_id,
       status = 'ACTIVE'`,
    [acc.id, acc.lrn_or_id, acc.first_name, acc.last_name, acc.full_name, acc.email, acc.role, acc.section || null, acc.section || null]
  );

  if (conflicts.length > 0) {
    await replaceStaleUserIfNeeded(acc);
    for (const c of conflicts) {
      try { await db.query('DELETE FROM users WHERE id = ?', [c.id]); } catch { /* ignore if still referenced */ }
    }
  }
}

function makeAnswerForQuestion(question, wantCorrect) {
  if (wantCorrect) {
    if (question.question_type === 'MATCHING') return MATCH_ALL;
    if (question.question_type === 'IDENTIFICATION') return 'Paris Agreement';
    return question.correct_answer;
  }
  if (question.question_type === 'MATCHING') return { p1: 'r2', p2: 'r1', p3: 'r4', p4: 'r3' };
  if (question.question_type === 'IDENTIFICATION') return 'Kyoto Protocol';
  if (question.question_type === 'TRUE_FALSE') return question.correct_answer === 'TRUE' ? 'FALSE' : 'TRUE';
  return question.correct_answer === 'A' ? 'C' : 'A';
}

async function seedQuizWithQuestions(quizDef, questionsDef) {
  await db.query(
    `INSERT INTO quizzes (id, competency_id, title, instructions, time_limit_minutes, total_points, passing_score, max_blur_limit, is_published, archived_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, 3, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       competency_id = excluded.competency_id,
       title = excluded.title,
       instructions = excluded.instructions,
       total_points = excluded.total_points,
       passing_score = excluded.passing_score,
       is_published = excluded.is_published,
       archived_at = excluded.archived_at,
       created_by = excluded.created_by`,
    [
      quizDef.id,
      quizDef.comp_id,
      quizDef.title,
      quizDef.instructions,
      quizDef.time_limit || 20,
      questionsDef.length,
      quizDef.passing_score,
      quizDef.is_published ?? 1,
      quizDef.archived_at || null,
      quizDef.teacher_id
    ]
  );

  const insertedQuestions = [];
  for (const [idx, q] of questionsDef.entries()) {
    const qId = `${quizDef.id}-q-${q.suffix}`;
    await db.query(
      `INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options_json, correct_answer, points, order_index)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(id) DO UPDATE SET
         question_text = excluded.question_text,
         question_type = excluded.question_type,
         options_json = excluded.options_json,
         correct_answer = excluded.correct_answer,
         points = 1,
         order_index = excluded.order_index`,
      [qId, quizDef.id, q.text, q.type, q.options ? JSON.stringify(q.options) : null, q.answer, idx + 1]
    );
    insertedQuestions.push({
      id: qId,
      quiz_id: quizDef.id,
      question_type: q.type,
      correct_answer: q.answer,
      points: 1,
      order_index: idx + 1
    });
  }
  return insertedQuestions;
}

async function seedStudentQuizAttempt({ student, quiz, questions, ratio, blurCount, submittedAt }) {
  const total = questions.length;
  const targetScore = Math.max(1, Math.min(total, Math.round(total * ratio)));
  const attemptId = `att-${quiz.id}-${student.key}`;
  const subId = `sub-${quiz.id}-${student.key}`;

  let score = 0;
  const answerRows = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const wantCorrect = i < targetScore;
    const selected = makeAnswerForQuestion(q, wantCorrect);
    const correct = isCorrect(q, selected);
    const pts = correct ? 1 : 0;
    score += pts;
    answerRows.push({ q, selected, correct, pts });
  }

  const percentage = Number(((score / total) * 100).toFixed(2));
  const isPassed = percentage >= 75 ? 1 : 0;
  const isFlagged = blurCount >= 3 ? 1 : 0;

  await db.query(
    `INSERT INTO quiz_attempts (id, quiz_id, student_id, score, total_points, is_passed, tab_switch_count, submitted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       student_id = excluded.student_id,
       score = excluded.score,
       total_points = excluded.total_points,
       is_passed = excluded.is_passed,
       tab_switch_count = excluded.tab_switch_count`,
    [attemptId, quiz.id, student.id, score, total, isPassed, blurCount, submittedAt]
  );

  await db.query('DELETE FROM quiz_submissions WHERE id = ? AND student_id != ?', [subId, student.id]);
  await db.query(
    `INSERT INTO quiz_submissions (id, quiz_id, student_id, started_at, submitted_at, score_obtained, percentage, is_passed, blur_count, is_flagged_for_cheating, status)
     VALUES (?, ?, ?, datetime(?, '-14 minutes'), ?, ?, ?, ?, ?, ?, 'SUBMITTED')
     ON CONFLICT(quiz_id, student_id) DO UPDATE SET
       score_obtained = excluded.score_obtained,
       percentage = excluded.percentage,
       is_passed = excluded.is_passed,
       blur_count = excluded.blur_count,
       is_flagged_for_cheating = excluded.is_flagged_for_cheating,
       status = 'SUBMITTED'`,
    [subId, quiz.id, student.id, submittedAt, submittedAt, score, percentage, isPassed, blurCount, isFlagged]
  );

  const { rows: actualSub } = await db.query(
    'SELECT id FROM quiz_submissions WHERE quiz_id = ? AND student_id = ? LIMIT 1',
    [quiz.id, student.id]
  );
  const actualSubId = actualSub[0]?.id || subId;

  await db.query('DELETE FROM quiz_submission_answers WHERE submission_id = ?', [actualSubId]);
  if (answerRows.length > 0) {
    const placeholders = answerRows.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const params = [];
    for (const item of answerRows) {
      params.push(
        `qsa-${actualSubId}-${item.q.id}`,
        actualSubId,
        item.q.id,
        typeof item.selected === 'object' ? JSON.stringify(item.selected) : String(item.selected),
        item.correct ? 1 : 0,
        item.pts
      );
    }
    await db.query(
      `INSERT INTO quiz_submission_answers (id, submission_id, question_id, selected_answer, is_correct, points_awarded)
       VALUES ${placeholders}`,
      params
    );
  }

  for (let b = 1; b <= blurCount; b++) {
    await db.query(
      `INSERT INTO security_logs (id, attempt_id, event_type, timestamp)
       VALUES (?, ?, 'TAB_SWITCH', datetime(?, '-${b * 2} minutes'))
       ON CONFLICT(id) DO NOTHING`,
      [`sec-${attemptId}-${b}`, attemptId, submittedAt]
    );
    await db.query(
      `INSERT INTO quiz_proctoring_logs (id, submission_id, event_type, timestamp, duration_unfocused_ms)
       VALUES (?, ?, 'TAB_HIDDEN', datetime(?, '-${b * 2} minutes'), 1500)
       ON CONFLICT(id) DO NOTHING`,
      [`prc-${actualSubId}-${b}`, actualSubId, submittedAt]
    );
  }

  return { attemptId, subId: actualSubId, score, total, percentage };
}

async function provisionDemoAccounts({ useClerk = true, docsDir = process.env.DEMO_DOCS_DIR } = {}) {
  await initializeDatabase();

  const allAccounts = buildAllAccountDefinitions();
  await syncAccountsWithClerk(allAccounts, { useClerk });

  const byKey = new Map(allAccounts.map(a => [a.key, a]));
  const admin = byKey.get('admin-main');
  const teacherPonce = byKey.get('teacher-ponce');
  const teacherMagsaysay = byKey.get('teacher-magsaysay');
  const teacherTecson = byKey.get('teacher-tecson');

  const concurrency = db.dialect === 'sqlite' ? 1 : 12;

  console.log(`[DEMO] Upserting ${allAccounts.length} user records into ${db.dialect.toUpperCase()}...`);
  await runInBatches(allAccounts, concurrency, acc => upsertUserRecord(acc));

  // 1. Instructor Applications (3 APPROVED + 1 PENDING)
  for (const instDef of INSTRUCTORS) {
    const inst = byKey.get(instDef.key);
    await db.query(
      `INSERT INTO instructor_applications (user_id, full_name, school, position, employee_id, mobile, message, status, reason, reviewed_by, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, CASE WHEN ? = 'APPROVED' THEN CURRENT_TIMESTAMP ELSE NULL END)
       ON CONFLICT(user_id) DO UPDATE SET
         full_name = excluded.full_name,
         school = excluded.school,
         position = excluded.position,
         employee_id = excluded.employee_id,
         mobile = excluded.mobile,
         status = excluded.status,
         reviewed_by = excluded.reviewed_by`,
      [
        inst.id,
        inst.full_name,
        inst.school,
        inst.position,
        inst.employee_id,
        inst.mobile,
        inst.notes,
        inst.application_status,
        inst.application_status === 'APPROVED' ? admin.id : null,
        inst.application_status
      ]
    );
  }

  // 2. Class Invitations (RIZALAP26A, LUNAMAB26B, MABINIAP26)
  for (const instDef of INSTRUCTORS.filter(i => i.class_code)) {
    const inst = byKey.get(instDef.key);
    const codeHash = hashCode(instDef.class_code);
    await db.query('DELETE FROM class_invitations WHERE code_hash = ? AND id != ?', [codeHash, instDef.invitation_id]);
    await db.query(
      `INSERT INTO class_invitations (id, teacher_id, school_year, sections_json, code_hash, active)
       VALUES (?, ?, ?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET
         teacher_id = excluded.teacher_id,
         school_year = excluded.school_year,
         sections_json = excluded.sections_json,
         code_hash = excluded.code_hash,
         active = 1`,
      [instDef.invitation_id, inst.id, SCHOOL_YEAR, JSON.stringify(instDef.sections), codeHash]
    );
  }

  // 3. Enrollment Requests (140 APPROVED + 4 PENDING + 2 REJECTED)
  const enrollmentAccounts = [
    ...ENROLLED_STUDENTS.map(s => byKey.get(s.key)),
    ...UNASSIGNED_STUDENTS.filter(u => u.enrollment_status !== 'NOT_ENROLLED').map(u => byKey.get(u.key))
  ];
  await runInBatches(enrollmentAccounts, concurrency, async stu => {
    await db.query('DELETE FROM enrollment_requests WHERE lrn = ? AND user_id != ?', [stu.lrn_or_id, stu.id]);
    await db.query(
      `INSERT INTO enrollment_requests (user_id, invitation_id, lrn, full_name, mobile, section, status, reason, reviewed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'PENDING' THEN NULL ELSE CURRENT_TIMESTAMP END)
       ON CONFLICT(user_id) DO UPDATE SET
         invitation_id = excluded.invitation_id,
         lrn = excluded.lrn,
         full_name = excluded.full_name,
         mobile = excluded.mobile,
         section = excluded.section,
         status = excluded.status,
         reason = excluded.reason`,
      [
        stu.id,
        stu.invitation_id,
        stu.lrn_or_id,
        stu.full_name,
        stu.mobile,
        stu.section,
        stu.enrollment_status,
        stu.rejection_reason || null,
        stu.enrollment_status
      ]
    );
  });

  // 4. Multi-Teacher Lessons & Remedial Materials + PDF Fixtures on Disk
  const teacherMaterials = [
    // Teacher 1 (Cleo Ponce)
    { id: 'mat-ap10-001', teacher: teacherPonce, comp: 'comp-ap10-q1-001', title: 'Modyul 1: Introduksyon sa Kontemporaryong Isyu.pdf', fileName: 'mod1_intro_ki.pdf', type: 'PDF', isRem: 0 },
    { id: 'mat-ap10-002', teacher: teacherPonce, comp: 'comp-ap10-q1-003', title: 'Presentasyon: CBDRRM Framework & Disaster Preparedness.pdf', fileName: 'cbdrrm_slides.pdf', type: 'PDF', isRem: 0 },
    { id: 'mat-ap10-003', teacher: teacherPonce, comp: 'comp-ap10-q1-002', title: 'Gabay-Aralin: Epekto ng Climate Change sa Pilipinas.pdf', fileName: 'climate_change_ph.pdf', type: 'PDF', isRem: 0 },
    { id: 'mat-rem-001', teacher: teacherPonce, comp: 'comp-ap10-q1-003', title: 'CBDRRM Remedial Reviewer & Study Guide.pdf', fileName: 'cbdrrm_remedial.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-rem-002', teacher: teacherPonce, comp: 'comp-ap10-q1-003', title: 'Lektyur: Pagbawi sa Kahinaan sa CBDRRM.pdf', fileName: 'cbdrrm_recovery.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-rem-ki-01', teacher: teacherPonce, comp: 'comp-ap10-q1-001', title: 'Remedial Reviewer: Mapanuring Pagsusuri sa Kontemporaryong Isyu.pdf', fileName: 'ki_remedial.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-rem-env-01', teacher: teacherPonce, comp: 'comp-ap10-q1-002', title: 'Intervention Module: Pagtugon sa Suliraning Solid Waste.pdf', fileName: 'waste_module.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-rem-act-01', teacher: teacherPonce, comp: 'comp-ap10-q1-004', title: 'Template at Gabay sa Barangay Disaster Preparedness Plan.pdf', fileName: 'drrm_template.pdf', type: 'PDF', isRem: 1 },
    // Teacher 2 (Ramon Magsaysay - 10-Luna)
    { id: 'mat-t2-ki-01', teacher: teacherMagsaysay, comp: 'comp-ap10-q1-001', title: 'Luna Module 1: Pagsusuri sa Isyung Panlipunan at Ekonomiko.pdf', fileName: 'luna_mod1_ki.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-t2-env-01', teacher: teacherMagsaysay, comp: 'comp-ap10-q1-002', title: 'Luna Module 2: Solid Waste at Climate Resilience.pdf', fileName: 'luna_mod2_env.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-t2-cbdrrm-01', teacher: teacherMagsaysay, comp: 'comp-ap10-q1-003', title: 'Luna Reviewer: Bottom-Up CBDRRM Approach.pdf', fileName: 'luna_cbdrrm_rev.pdf', type: 'PDF', isRem: 1 },
    // Teacher 3 (Trinidad Tecson - 10-Mabini)
    { id: 'mat-t3-ki-01', teacher: teacherTecson, comp: 'comp-ap10-q1-001', title: 'Mabini Module 1: Sanggunian at Katotohanan sa Kontemporaryong Isyu.pdf', fileName: 'mabini_mod1_ki.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-t3-env-01', teacher: teacherTecson, comp: 'comp-ap10-q1-002', title: 'Mabini Module 2: Pangangalaga sa Likas na Yaman.pdf', fileName: 'mabini_mod2_env.pdf', type: 'PDF', isRem: 1 },
    { id: 'mat-t3-cbdrrm-01', teacher: teacherTecson, comp: 'comp-ap10-q1-003', title: 'Mabini Reviewer: Kahandaan at Hazard Mapping.pdf', fileName: 'mabini_cbdrrm_rev.pdf', type: 'PDF', isRem: 1 }
  ];

  for (const m of teacherMaterials) {
    const url = `/api/materials/download/${m.fileName}`;
    await db.query(
      `INSERT INTO materials (id, title, file_path, file_type, competency_id, is_remedial, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         file_path = excluded.file_path,
         file_type = excluded.file_type,
         is_remedial = excluded.is_remedial,
         uploaded_by = excluded.uploaded_by`,
      [m.id, m.title, url, m.type, m.comp, m.isRem, m.teacher.id]
    );
    await db.query(
      `INSERT INTO instructional_materials (id, competency_id, title, description, file_type, storage_url, file_size_bytes, content_hash, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 185000, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         storage_url = excluded.storage_url,
         file_type = excluded.file_type,
         created_by = excluded.created_by`,
      [m.id, m.comp, m.title, `Opisyal na babasahin at reviewer para sa ${m.comp}.`, m.type, url, sha256(m.fileName), m.teacher.id]
    );
  }

  // 5. Multi-Teacher Quizzes & Questions
  const quizzesByTeacherKey = {
    'teacher-ponce': [
      { id: 'quiz-ap10-cbdrrm-01', comp_id: 'comp-ap10-q1-003', title: 'Pagsusuri sa CBDRRM Approach at Kahandaan sa Kalamidad', instructions: 'Basahing mabuti ang bawat tanong. Ipinagbabawal ang paglipat ng tab.', passing_score: 7, teacher_id: teacherPonce.id, questions: CBDRRM_QUESTIONS, remedial_id: 'mat-rem-001' },
      { id: 'quiz-ap10-ki-01', comp_id: 'comp-ap10-q1-001', title: 'Pagsusuri sa Konsepto ng Kontemporaryong Isyu', instructions: 'Sagutin ang mga tanong upang subukin ang mapanuring pag-iisip.', passing_score: 4, teacher_id: teacherPonce.id, questions: SHORT_QUIZ_QUESTIONS, remedial_id: 'mat-rem-ki-01' },
      { id: 'quiz-ap10-env-01', comp_id: 'comp-ap10-q1-002', title: 'Mga Suliraning Pangkapaligiran sa Pamayanan', instructions: 'Tukuyin ang mga sanhi at epekto ng climate change at solid waste.', passing_score: 4, teacher_id: teacherPonce.id, questions: SHORT_QUIZ_QUESTIONS, remedial_id: 'mat-rem-env-01' },
      { id: 'quiz-ap10-action-01', comp_id: 'comp-ap10-q1-004', title: 'Paggawa ng Disaster Preparedness Action Plan', instructions: 'Ilapat ang mga hakbang sa kahandaan sa sariling tahanan at pamayanan.', passing_score: 4, teacher_id: teacherPonce.id, questions: SHORT_QUIZ_QUESTIONS, remedial_id: 'mat-rem-act-01' }
    ],
    'teacher-magsaysay': [
      { id: 'quiz-t2-cbdrrm-01', comp_id: 'comp-ap10-q1-003', title: '10-Luna Pagsusulit: CBDRRM at Disaster Governance', instructions: 'Basahing mabuti ang bawat tanong ukol sa CBDRRM framework.', passing_score: 7, teacher_id: teacherMagsaysay.id, questions: CBDRRM_QUESTIONS, remedial_id: 'mat-t2-cbdrrm-01' },
      { id: 'quiz-t2-ki-01', comp_id: 'comp-ap10-q1-001', title: '10-Luna Pagsusulit: Kontemporaryong Isyu at Kalikasan', instructions: 'Sagutin ang limang tanong sa loob ng 20 minuto.', passing_score: 4, teacher_id: teacherMagsaysay.id, questions: SHORT_QUIZ_QUESTIONS, remedial_id: 'mat-t2-ki-01' }
    ],
    'teacher-tecson': [
      { id: 'quiz-t3-cbdrrm-01', comp_id: 'comp-ap10-q1-003', title: '10-Mabini Pagsusulit: Kahandaan sa Kalamidad (CBDRRM)', instructions: 'Basahing mabuti ang bawat tanong ukol sa CBDRRM framework.', passing_score: 7, teacher_id: teacherTecson.id, questions: CBDRRM_QUESTIONS, remedial_id: 'mat-t3-cbdrrm-01' },
      { id: 'quiz-t3-env-01', comp_id: 'comp-ap10-q1-002', title: '10-Mabini Pagsusulit: Suliraning Pangkapaligiran', instructions: 'Sagutin ang limang tanong sa loob ng 20 minuto.', passing_score: 4, teacher_id: teacherTecson.id, questions: SHORT_QUIZ_QUESTIONS, remedial_id: 'mat-t3-env-01' }
    ]
  };

  const questionsByQuizId = new Map();
  for (const list of Object.values(quizzesByTeacherKey)) {
    for (const qz of list) {
      const qs = await seedQuizWithQuestions(qz, qz.questions);
      questionsByQuizId.set(qz.id, qs);
    }
  }
  await seedQuizWithQuestions(
    {
      id: 'quiz-ap10-archived-01',
      comp_id: 'comp-ap10-q1-001',
      title: 'Diagnostic Pre-Test sa Kontemporaryong Isyu (Archived)',
      instructions: 'Nakaraang diagnostic test para sa panimulang linggo.',
      passing_score: 4,
      archived_at: '2026-10-15 08:00:00',
      teacher_id: teacherPonce.id
    },
    SHORT_QUIZ_QUESTIONS
  );

  // 6. Multi-Teacher Performance Tasks (Past-Due, Due-Tomorrow, Upcoming +14 Days)
  const tasksByTeacherKey = {
    'teacher-ponce': [
      { id: 'pt-q1-cbdrrm-01', comp: 'comp-ap10-q1-004', title: 'Barangay CBDRRM Hazard & Evacuation Map Action Plan', offset: '+14 days', teacher_id: teacherPonce.id },
      { id: 'pt-q1-env-02', comp: 'comp-ap10-q1-002', title: 'Photo-Essay: Pagsusuri sa Suliraning Solid Waste sa Pamayanan', offset: '+1 day', teacher_id: teacherPonce.id },
      { id: 'pt-q1-ki-03', comp: 'comp-ap10-q1-001', title: 'Case Study: Pagsusuri sa Isang Kontemporaryong Isyu sa Barangay (Past Due)', offset: '-3 days', teacher_id: teacherPonce.id }
    ],
    'teacher-magsaysay': [
      { id: 'pt-t2-cbdrrm-01', comp: 'comp-ap10-q1-004', title: '10-Luna Purok Evacuation & Hazard Map Plan', offset: '+14 days', teacher_id: teacherMagsaysay.id },
      { id: 'pt-t2-env-02', comp: 'comp-ap10-q1-002', title: '10-Luna Solid Waste Audit Report (Due Soon)', offset: '+1 day', teacher_id: teacherMagsaysay.id },
      { id: 'pt-t2-ki-03', comp: 'comp-ap10-q1-001', title: '10-Luna News Clipping Analysis (Past Due)', offset: '-3 days', teacher_id: teacherMagsaysay.id }
    ],
    'teacher-tecson': [
      { id: 'pt-t3-cbdrrm-01', comp: 'comp-ap10-q1-004', title: '10-Mabini Family Emergency Go-Bag & Escape Plan', offset: '+14 days', teacher_id: teacherTecson.id },
      { id: 'pt-t3-env-02', comp: 'comp-ap10-q1-002', title: '10-Mabini Community Clean-Up Proposal (Due Soon)', offset: '+1 day', teacher_id: teacherTecson.id },
      { id: 'pt-t3-ki-03', comp: 'comp-ap10-q1-001', title: '10-Mabini Primary vs Secondary Source Matrix (Past Due)', offset: '-3 days', teacher_id: teacherTecson.id }
    ]
  };

  for (const list of Object.values(tasksByTeacherKey)) {
    for (const t of list) {
      await db.query(
        `INSERT INTO performance_tasks (id, quarter, competency_id, title, instructions, rubric_criteria, total_points, due_date, created_by)
         VALUES (?, 'Q1', ?, ?, 'I-upload ang inyong awtput bilang PDF o DOCX document batay sa rubrik.', 'Nilalaman at Pagsusuri: 40%, Organisasyon: 30%, Praktikalidad sa Komunidad: 30%', 100, datetime('now', ?), ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           due_date = excluded.due_date,
           created_by = excluded.created_by`,
        [t.id, t.comp, t.title, t.offset, t.teacher_id]
      );
    }
  }

  // 7. Seed Quiz Attempts, Submissions, Interventions & Task Submissions for Enrolled Students (#01..#30)
  // Slots #31..#35 remain Clean-Slate (0 submissions)!
  console.log('[DEMO] Seeding classroom quiz attempts, proctoring logs, interventions & task submissions...');
  const submissionFilesToCreate = [];

  await runInBatches(ENROLLED_STUDENTS, concurrency, async stuDef => {
    const stu = byKey.get(stuDef.key);
    const teacherQuizzes = quizzesByTeacherKey[stu.teacher_key] || [];
    const teacherTasks = tasksByTeacherKey[stu.teacher_key] || [];

    if (stu.slot >= 31) {
      await db.query('DELETE FROM quiz_submissions WHERE student_id = ?', [stu.id]);
      await db.query('DELETE FROM quiz_attempts WHERE student_id = ?', [stu.id]);
      await db.query('DELETE FROM interventions WHERE student_id = ?', [stu.id]);
      await db.query('DELETE FROM performance_task_submissions WHERE student_id = ?', [stu.id]);
      return;
    }

    const quizzesToTake = stu.slot <= 25 ? teacherQuizzes.slice(0, 2) : teacherQuizzes.slice(0, 1);
    for (const [qIdx, qz] of quizzesToTake.entries()) {
      const questions = questionsByQuizId.get(qz.id) || [];
      const blur = qIdx === 0 ? stu.blur_count : 0;
      const submittedAt = `2026-10-${String(10 + (stu.slot % 18)).padStart(2, '0')} 09:${String(10 + qIdx * 20).padStart(2, '0')}:00`;
      const attempt = await seedStudentQuizAttempt({
        student: stu,
        quiz: qz,
        questions,
        ratio: stu.target_ratio,
        blurCount: blur,
        submittedAt
      });

      if (qIdx === 0 && stu.intervention_status) {
        const intvId = `intv-${stu.key}`;
        await db.query(
          `INSERT INTO interventions (id, student_id, competency_id, recommended_material_id, status, updated_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(id) DO UPDATE SET
             student_id = excluded.student_id,
             recommended_material_id = excluded.recommended_material_id,
             status = excluded.status`,
          [intvId, stu.id, qz.comp_id, qz.remedial_id, stu.intervention_status]
        );
        try {
          await db.query(
            `INSERT INTO remedial_interventions (id, student_id, competency_id, trigger_submission_id, remedial_material_id, status, ilaw_phase)
             VALUES (?, ?, ?, ?, ?, ?, 'WAYS_FORWARD')
             ON CONFLICT(id) DO UPDATE SET
               student_id = excluded.student_id,
               trigger_submission_id = excluded.trigger_submission_id,
               remedial_material_id = excluded.remedial_material_id,
               status = excluded.status`,
            [intvId, stu.id, qz.comp_id, attempt.subId, qz.remedial_id, stu.intervention_status]
          );
        } catch { /* ignore if optional FK mismatch */ }
      }
    }

    const primaryTask = teacherTasks[0];
    if (primaryTask && stu.task_state !== 'NONE') {
      const fileName = `CBDRRM_Plan_${stu.key}.pdf`;
      const isGraded = stu.task_state === 'GRADED';
      const notes = isGraded
        ? `Ipinapasa ko po ang aming barangay hazard map para sa ${stu.section}.`
        : `Submitted for teacher review (${stu.section}). Ready for grading.`;
      await db.query('DELETE FROM performance_task_submissions WHERE id = ? AND student_id != ?', [`pts-${stu.key}`, stu.id]);
      await db.query(
        `INSERT INTO performance_task_submissions (id, task_id, student_id, file_name, file_url, file_size_bytes, notes, score, feedback, status, graded_at)
         VALUES (?, ?, ?, ?, ?, 42000, ?, ?, ?, ?, CASE WHEN ? = 'GRADED' THEN CURRENT_TIMESTAMP ELSE NULL END)
         ON CONFLICT(task_id, student_id) DO UPDATE SET
           file_name = excluded.file_name,
           file_url = excluded.file_url,
           notes = excluded.notes,
           score = excluded.score,
           feedback = excluded.feedback,
           status = excluded.status`,
        [
          `pts-${stu.key}`,
          primaryTask.id,
          stu.id,
          fileName,
          `/api/performance-tasks/files/${fileName}`,
          notes,
          isGraded ? stu.task_score : null,
          isGraded ? 'Mahusay at komprehensibo ang pagsusuri sa barangay hazard map.' : null,
          stu.task_state,
          stu.task_state
        ]
      );
      submissionFilesToCreate.push({
        fileName,
        title: primaryTask.title,
        studentName: stu.full_name,
        section: stu.section,
        notes
      });
    }
  });

  // 8. Announcements per Teacher
  const announcements = [
    {
      id: 'ann-demo-ponce-01',
      teacher_id: teacherPonce.id,
      title: 'Paalala sa Quarter 1 CBDRRM Assessment at Performance Task',
      body: 'Mga mag-aaral ng 10-Rizal at 10-Bonifacio, mangyaring basahin ang Modyul 1 at CBDRRM Reviewer bago sagutan ang ating online pagsusulit.',
      pinned: 1
    },
    {
      id: 'ann-demo-magsaysay-01',
      teacher_id: teacherMagsaysay.id,
      title: '10-Luna Schedule ng Pagsusulit at Solid Waste Audit',
      body: 'Para sa 10-Luna: bukas na ang ating CBDRRM quiz at ang pasahan para sa Solid Waste Audit Report.',
      pinned: 1
    },
    {
      id: 'ann-demo-tecson-01',
      teacher_id: teacherTecson.id,
      title: '10-Mabini Family Emergency Go-Bag Rubrik',
      body: 'Para sa 10-Mabini: tiyaking kompleto ang inyong hazard map at Go-Bag checklist bago ang takdang araw.',
      pinned: 1
    }
  ];
  for (const ann of announcements) {
    try {
      await db.query(
        `INSERT INTO announcements (id, teacher_id, title, body, pinned, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET teacher_id = excluded.teacher_id, title = excluded.title, body = excluded.body, pinned = excluded.pinned`,
        [ann.id, ann.teacher_id, ann.title, ann.body, ann.pinned]
      );
    } catch { /* announcements table optional */ }
  }

  // 9. Generate real PDF files on disk + Excel/PDF/Markdown directory in docs/demo-accounts
  await ensureDemoResourceFiles(
    teacherMaterials.map(m => ({ fileName: m.fileName, title: m.title, competencyId: m.comp })),
    submissionFilesToCreate
  );
  const paths = await writeDemoAccountDocs(allAccounts, docsDir);

  console.log(`[DEMO] Provisioned ${allAccounts.length} accounts (1 Admin, 4 Instructor/Applicants, 140 Enrolled Students across 4 sections, 12 Unassigned).`);
  console.log(`[DEMO] Excel Workbook : ${paths.xlsxPath}`);
  console.log(`[DEMO] PDF Directory  : ${paths.pdfPath}`);
  console.log(`[DEMO] Markdown Guide : ${paths.mdPath}`);

  return { accounts: allAccounts, paths };
}

if (require.main === module) {
  const args = new Set(process.argv.slice(2));
  if (db.dialect !== 'sqlite' && !args.has('--allow-remote')) {
    console.error(
      `[DEMO] Refusing to write demo accounts to a ${db.dialect} database without --allow-remote.`
    );
    process.exit(1);
  }
  provisionDemoAccounts({ useClerk: !args.has('--no-clerk') })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[DEMO ERROR]', err);
      process.exit(1);
    });
}

module.exports = { provisionDemoAccounts, buildAllAccountDefinitions };
