const assert = require('node:assert/strict');
const { gradeAnswers } = require('../src/services/gradeAnswers');
const base = process.env.ARALYTICS_TEST_URL;
async function main() {
  const questions = [
    ['mc','MULTIPLE_CHOICE','B',2], ['tf','TRUE_FALSE','TRUE',1],
    ['id','IDENTIFICATION','Hazard|Panganib',2], ['match','MATCHING','{"a":"1","b":"2"}',3],
    ['sit','SITUATIONAL','A',1], ['pisa','PISA_LIKE','C',1]
  ].map(([id,question_type,correct_answer,points]) => ({ id,question_type,correct_answer,points }));
  const values = ['B','Tama',' panganib. ',{ a:'1', b:'2' },'A','C'];
  const answers = questions.map((q,i) => ({ question_id:q.id, selected_answer:values[i] }));
  assert.equal(gradeAnswers(questions,answers).score,10);
  assert.equal(gradeAnswers(questions,[]).score,0);
  assert.equal(gradeAnswers(questions,[{ question_id:'match',selected_answer:{} }]).score,0);
  assert.throws(() => gradeAnswers(questions,[answers[0],answers[0]]),/duplicate/);
  assert.throws(() => gradeAnswers(questions,[{ question_id:'other' }]),/unknown/);
  console.log('PASS: all six formats, aliases, incomplete matching, unknown and duplicate answers.');
  if (!base) return;
  assert.equal(process.env.ARALYTICS_DISPOSABLE_DB,'yes','Live checks require an explicitly disposable database.');
  assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Test only a local API.');
  async function request(path,token,body,method = body ? 'POST' : 'GET') {
    const response = await fetch(`${base}/api${path}`,{ method,headers:{ 'Content-Type':'application/json',...(token ? { Authorization:`Bearer ${token}` } : {}) },...(body ? { body:JSON.stringify(body) } : {}) });
    return { status:response.status,data:await response.json() };
  }
  async function login(identifier,password) { const r = await request('/auth/login',null,{ identifier,password }); assert.equal(r.status,200); return r.data; }
  const learner = await login('student1@ap10.edu.ph','Student123!');
  const run = Date.now();
  const registered = await request('/auth/register',null,{ first_name:'Test',last_name:'Learner',email:`redesign-${run}@example.test`,lrn_or_id:`test-${run}`,password:'Student123!',section:'10-Rizal' });
  assert.equal(registered.status,201);
  const peer = registered.data;
  const teacher = await login('teacher@ap10.edu.ph','Teacher123!');
  assert.equal((await request('/teacher/classes',learner.token)).status,403);
  assert.equal((await request('/student/practice',teacher.token)).status,403);
  const task = (await request('/performance-tasks',learner.token)).data.tasks[0];
  const bytes = Buffer.from('%PDF-1.4\nRedesign integration fixture\n%%EOF');
  const uploaded = await request(`/performance-tasks/${task.id}/submit`,learner.token,{ file_name:'redesign-check.pdf',file_content_base64:bytes.toString('base64'),notes:'Test fixture only' });
  assert.equal(uploaded.status,200);
  const submission = uploaded.data.submission;
  const downloaded = await fetch(`${base}${submission.file_url}`,{ headers:{ Authorization:`Bearer ${teacher.token}` } });
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  assert.equal((await fetch(`${base}${submission.file_url}`,{ headers:{ Authorization:`Bearer ${peer.token}` } })).status,404);
  assert.equal((await fetch(`${base}${submission.file_url}`)).status,401);
  assert.equal((await request(`/performance-tasks/submissions/${submission.id}/grade`,teacher.token,{ score:task.total_points + 1 },'PATCH')).status,400);
  assert.equal((await request(`/performance-tasks/submissions/${submission.id}/grade`,teacher.token,{ score:80,feedback:'Test feedback' },'PATCH')).status,200);
  const own = (await request(`/performance-tasks/${task.id}`,learner.token)).data.task.my_submission;
  assert.equal(own.score,80); assert.equal(own.feedback,'Test feedback');
  console.log('PASS: real attachment bytes, owner/teacher access, peer denial, grade bounds and learner feedback.');
  const quiz = (await request('/quizzes',peer.token)).data.quizzes[0];
  const detail = (await request(`/quizzes/${quiz.id}`,peer.token)).data.quiz;
  assert(detail.questions.every(q => !Object.hasOwn(q,'correct_answer')));
  const result = await request('/assessment/submit',peer.token,{ quiz_id:quiz.id,student_id:peer.user.id,score:999,total_points:999,answers:[],security_events:[],tab_switch_count:0 });
  assert.equal(result.status,201); assert.equal(result.data.attempt.score,0);
  assert(result.data.attempt.total_points > 0);
  assert.equal((await request('/assessment/submit',peer.token,{ quiz_id:quiz.id,student_id:peer.user.id,score:0,total_points:999,answers:[] })).status,409);
  assert((await request('/student/practice',peer.token)).data.interventions.length > 0);
  console.log('PASS: hidden answer key, forged score ignored, repeat submission blocked and practice generated.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
