/**
 * Email notifier (Resend). A silent no-op unless RESEND_API_KEY and MAIL_FROM are configured,
 * and it never throws or blocks a request: failures are logged and dropped.
 *
 *   notify(req, 'enrollment.approved', { to: 'a@b.c', ... })
 *
 * `data.to` is one address or an array; each recipient gets their own message.
 * Tests call setTransport(fn) to capture messages and flush() to wait for delivery.
 * On Cloudflare Workers the delivery promise is handed to `app.locals.waitUntil`.
 */
const API = 'https://api.resend.com';
const BATCH_SIZE = 100;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}...` : text;
};

// Each template returns { subject, lines, action? }. Lines are plain text; HTML is built by escaping them.
const TEMPLATES = {
  'instructor_application.approved': d => ({
    subject: 'Your Aralytics instructor application was approved',
    lines: [`Hello ${d.name || 'there'},`, 'Your instructor application was approved. You can now create lessons, quizzes, and class codes.'],
    action: ['Open Aralytics', '']
  }),
  'instructor_application.returned': d => ({
    subject: 'Your Aralytics instructor application needs changes',
    lines: [`Hello ${d.name || 'there'},`, 'Your instructor application was returned for changes.', `Reason: ${d.reason || 'No reason given.'}`,
      'Correct your details and submit the application again.'],
    action: ['Update your application', '']
  }),
  'enrollment.approved': d => ({
    subject: 'Your class enrollment was approved',
    lines: [`Hello ${d.name || 'there'},`, `${d.adviser_name || 'Your adviser'} approved your enrollment. Your lessons and quizzes are ready.`],
    action: ['Open your class', '']
  }),
  'enrollment.rejected': d => ({
    subject: 'Your class enrollment needs changes',
    lines: [`Hello ${d.name || 'there'},`, 'Your adviser could not approve your enrollment yet.', `Reason: ${d.reason || 'No reason given.'}`,
      'Fix the details and send your request again.'],
    action: ['Update your enrollment', '']
  }),
  'performance_task.graded': d => ({
    subject: `Your performance task was graded: ${d.task_title || 'Performance task'}`,
    lines: [`Hello ${d.name || 'there'},`, `Your submission for "${d.task_title || 'a performance task'}" was graded.`,
      `Score: ${d.score} / ${d.total_points}`, ...(d.feedback ? [`Feedback: ${clip(d.feedback, 500)}`] : [])],
    action: ['See your results', '']
  }),
  'account.suspended': d => ({
    subject: 'Your Aralytics account was suspended',
    lines: [`Hello ${d.name || 'there'},`, 'Your Aralytics account has been suspended, so you cannot sign in to your workspace.',
      `Reason: ${d.reason || 'No reason given.'}`, 'Contact your school administrator if you think this is a mistake.']
  }),
  'instructor.revoked': d => ({
    subject: 'Your Aralytics instructor access ended',
    lines: [`Hello ${d.name || 'there'},`, 'Your instructor access has ended and your account is now a student account.',
      `Reason: ${d.reason || 'No reason given.'}`, 'Your lessons, quizzes, and tasks were kept. Contact your school administrator with questions.']
  }),
  'announcement.posted': d => ({
    subject: `New class announcement: ${d.title || ''}`.trim(),
    lines: [`${d.teacher_name || 'Your adviser'} posted an announcement.`, d.title || '', clip(d.excerpt, 300)].filter(Boolean),
    action: ['Read the announcement', '/student/announcements']
  })
};

function render(event, data, appUrl) {
  const template = TEMPLATES[event];
  if (!template) return null;
  const { subject, lines, action } = template(data);
  const link = appUrl && action ? `${appUrl.replace(/\/+$/, '')}${action[1] || ''}` : '';
  const text = [...lines, ...(link ? ['', `${action[0]}: ${link}`] : [])].join('\n\n').replace(/\n\n\n/g, '\n\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#1f2937">${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}`
    + (link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(action[0])}</a></p>` : '') + '</div>';
  return { subject, text, html };
}

function config(req) {
  const env = req?.app?.locals?.env || {};
  const read = key => env[key] || process.env[key] || '';
  return { apiKey: read('RESEND_API_KEY'), from: read('MAIL_FROM'), appUrl: read('APP_URL') };
}

/** Default transport: one /emails call for a single message, /emails/batch (100 at a time) for several. */
async function resendTransport(messages, { apiKey }) {
  const post = async (path, body) => {
    const response = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  };
  if (messages.length === 1) return post('/emails', messages[0]);
  for (let i = 0; i < messages.length; i += BATCH_SIZE) await post('/emails/batch', messages.slice(i, i + BATCH_SIZE));
}

let transport = resendTransport;
const pending = new Set();

function setTransport(fn) { transport = typeof fn === 'function' ? fn : resendTransport; }
async function flush() { while (pending.size) await Promise.allSettled([...pending]); }

function notify(req, event, data = {}) {
  try {
    const settings = config(req);
    if (!settings.apiKey || !settings.from) return;
    const recipients = [...new Set([].concat(data.to || []).map(a => String(a || '').trim()).filter(a => /^[^\s@]+@[^\s@]+$/.test(a)))];
    const content = render(event, data, settings.appUrl);
    if (!recipients.length || !content) return;
    const messages = recipients.map(to => ({ from: settings.from, to: [to], ...content }));
    const delivery = Promise.resolve()
      .then(() => transport(messages, settings))
      .catch(err => console.error(`[NOTIFIER] ${event} not sent:`, err?.message || err))
      .finally(() => pending.delete(delivery));
    pending.add(delivery);
    const waitUntil = req?.app?.locals?.waitUntil;
    if (typeof waitUntil === 'function') waitUntil(delivery);
  } catch (err) {
    console.error(`[NOTIFIER] ${event} skipped:`, err?.message || err);
  }
}

module.exports = { notify, setTransport, flush };
