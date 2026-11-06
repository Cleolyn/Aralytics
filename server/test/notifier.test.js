// Email notifier: a no-op without keys, Resend payloads with keys, never throws.
const assert = require('node:assert/strict');
const notifier = require('../src/services/notifier');

const withEnv = env => ({ app: { locals: { env } } });
const KEYS = { RESEND_API_KEY: 'rk_test', MAIL_FROM: 'Aralytics <hello@example.test>', APP_URL: 'https://app.example.test/' };

async function run() {
  delete process.env.RESEND_API_KEY; delete process.env.MAIL_FROM; delete process.env.APP_URL;
  const calls = [];
  notifier.setTransport(async (messages, settings) => { calls.push({ messages, settings }); });

  // No keys (or only one of them): nothing is sent.
  notifier.notify(withEnv({}), 'enrollment.approved', { to: 'a@example.test' });
  notifier.notify(withEnv({ RESEND_API_KEY: 'k' }), 'enrollment.approved', { to: 'a@example.test' });
  notifier.notify(withEnv({ MAIL_FROM: 'x@example.test' }), 'enrollment.approved', { to: 'a@example.test' });
  notifier.notify(undefined, 'enrollment.approved', { to: 'a@example.test' });
  await notifier.flush();
  assert.equal(calls.length, 0, 'no keys means no transport call');

  // With keys: one message, rendered text and escaped HTML, link from APP_URL.
  notifier.notify(withEnv(KEYS), 'enrollment.rejected', { to: 'kid@example.test', name: '<b>Kid</b>', reason: 'Wrong "LRN" & section' });
  await notifier.flush();
  assert.equal(calls.length, 1);
  const [message] = calls[0].messages;
  assert.equal(calls[0].messages.length, 1);
  assert.deepEqual(message.to, ['kid@example.test']);
  assert.equal(message.from, KEYS.MAIL_FROM);
  assert.match(message.subject, /enrollment/i);
  assert.ok(message.text.includes('Wrong "LRN" & section'));
  assert.ok(message.html.includes('&lt;b&gt;Kid&lt;/b&gt;') && message.html.includes('Wrong &quot;LRN&quot; &amp; section'));
  assert.ok(!message.html.includes('<b>Kid</b>'));
  assert.ok(message.text.includes('https://app.example.test'), 'APP_URL link is included');
  assert.ok(!message.text.includes('test//'), 'no double slash in the link');

  // Without APP_URL there is no link at all.
  calls.length = 0;
  notifier.notify(withEnv({ ...KEYS, APP_URL: '' }), 'account.suspended', { to: 'kid@example.test', reason: 'Shared account' });
  await notifier.flush();
  assert.ok(!calls[0].messages[0].html.includes('<a '));

  // Arrays get one message per recipient, deduplicated; bad addresses and unknown events are dropped.
  calls.length = 0;
  notifier.notify(withEnv(KEYS), 'announcement.posted',
    { to: ['a@example.test', 'b@example.test', 'a@example.test', 'not-an-email'], teacher_name: 'Ms. Reyes', title: 'Quiz Friday', excerpt: 'Bring a pen.' });
  notifier.notify(withEnv(KEYS), 'no.such.event', { to: 'a@example.test' });
  notifier.notify(withEnv(KEYS), 'account.suspended', { to: [] });
  await notifier.flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].messages.map(m => m.to[0]), ['a@example.test', 'b@example.test']);
  assert.ok(calls[0].messages[0].subject.includes('Quiz Friday'));

  // process.env is the fallback source for settings.
  calls.length = 0;
  Object.assign(process.env, KEYS);
  notifier.notify({}, 'instructor.revoked', { to: 'teacher@example.test', reason: 'Left' });
  await notifier.flush();
  assert.equal(calls.length, 1);
  for (const key of Object.keys(KEYS)) delete process.env[key];

  // Every template renders.
  const templates = ['instructor_application.approved', 'instructor_application.returned', 'enrollment.approved', 'enrollment.rejected',
    'performance_task.graded', 'account.suspended', 'instructor.revoked', 'announcement.posted'];
  calls.length = 0;
  for (const event of templates) notifier.notify(withEnv(KEYS), event, { to: 'x@example.test', name: 'X', reason: 'r', title: 't', score: 1, total_points: 2 });
  await notifier.flush();
  assert.equal(calls.length, templates.length);

  // A throwing transport never throws to the caller and never leaves work pending.
  notifier.setTransport(async () => { throw new Error('boom'); });
  assert.doesNotThrow(() => notifier.notify(withEnv(KEYS), 'enrollment.approved', { to: 'a@example.test' }));
  await notifier.flush();
  notifier.setTransport(() => { throw new Error('sync boom'); });
  assert.doesNotThrow(() => notifier.notify(withEnv(KEYS), 'enrollment.approved', { to: 'a@example.test' }));
  await notifier.flush();

  // waitUntil receives the delivery promise when present.
  notifier.setTransport(async () => {});
  const handed = [];
  notifier.notify({ app: { locals: { env: KEYS, waitUntil: p => handed.push(p) } } }, 'enrollment.approved', { to: 'a@example.test' });
  assert.equal(handed.length, 1);
  assert.ok(typeof handed[0].then === 'function');
  await handed[0];

  // The default transport posts to Resend: /emails for one, /emails/batch for many.
  notifier.setTransport();
  const requests = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200 }; };
  try {
    notifier.notify(withEnv(KEYS), 'enrollment.approved', { to: 'one@example.test' });
    notifier.notify(withEnv(KEYS), 'announcement.posted', { to: ['a@example.test', 'b@example.test'], title: 't' });
    await notifier.flush();
  } finally { global.fetch = realFetch; }
  assert.equal(requests.length, 2);
  const single = requests.find(r => r.url.endsWith('/emails'));
  const batch = requests.find(r => r.url.endsWith('/emails/batch'));
  assert.equal(single.url, 'https://api.resend.com/emails');
  assert.equal(single.init.headers.Authorization, 'Bearer rk_test');
  assert.equal(JSON.parse(single.init.body).to[0], 'one@example.test');
  assert.equal(JSON.parse(batch.init.body).length, 2);

  console.log('PASS: notifier no-op without keys, payloads, templates, escaping, fan-out, failure isolation, waitUntil, Resend transport.');
}

run().catch(err => { console.error(err); process.exitCode = 1; });
