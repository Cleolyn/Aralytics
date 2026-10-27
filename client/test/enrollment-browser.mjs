// Run the isolated fixture server first: node client/test/serve-enrollment-preview.mjs
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { Browser, sleep } from '../../.agents/skills/design-taste-frontend/scripts/lib/cdp.mjs';
const out = '.taste-skill/enrollment-qa';
mkdirSync(out, { recursive: true });
const browser = await Browser.launch();
try {
  const page = await browser.newPage();
  const base = 'http://127.0.0.1:3011/client/test/enrollment-preview.html';
  const fill = async (selector, text) => {
    await page.eval(sel => document.querySelector(sel).focus(), selector);
    await page.send('Input.insertText', { text });
  };
  const click = async text => { await page.eval(label => [...document.querySelectorAll('button')].find(button => button.textContent.includes(label)).click(), text); await sleep(350); };
  await page.goto(base);
  assert.equal(await page.eval(() => document.querySelector('#student-lrn') !== null), false, 'Profile fields must be locked before code validation');
  await fill('#class-code', 'ABCDEFGH23'); await click('Continue');
  assert.deepEqual(await page.eval(() => [...document.querySelector('#student-section').options].map(o => o.value)), ['', '10-Rizal', '10-Bonifacio']);
  await fill('#student-lrn', '123456789012'); await fill('#student-full-name', 'María Luz Dela Cruz'); await fill('#student-mobile', '09171234567');
  await page.eval(() => { const select = document.querySelector('#student-section'); select.value = '10-Rizal'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.screenshot({ path: `${out}/student-details-desktop.jpg` });
  await click('Request to join');
  assert.equal(await page.eval(() => document.querySelector('h1').textContent), 'Waiting for approval');
  assert.equal(await page.eval(() => window.__fixtureRequests.find(request => request.url.endsWith('/request')).body.lrn), '123456789012');
  await click('Check approval status');
  assert.equal(await page.eval(() => document.body.textContent.includes('Status checked just now.')), true);
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900 }); await sleep(100);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true, `Waiting screen overflow at ${width}px`);
    await page.screenshot({ path: `${out}/waiting-${width}.jpg`, fullPage: true });
  }
  await page.setViewport({ width: 1440, height: 900 }); await page.goto(base + '?view=teacher');
  await fill('#enrollment-year', '2026-2027'); await fill('#enrollment-sections', '10-Rizal\n10-Bonifacio'); await click('Generate class code');
  assert.equal(await page.eval(() => document.querySelector('.generated-code strong').textContent), 'ABCDEFGH23');
  for (const width of [1440, 768, 390]) {
    await page.setViewport({ width, height: 900 }); await sleep(100);
    assert.equal(await page.eval(() => document.documentElement.scrollWidth <= innerWidth), true, `Adviser screen overflow at ${width}px`);
    await page.screenshot({ path: `${out}/adviser-${width}.jpg`, fullPage: true });
  }
  await click('Approve student');
  assert.equal(await page.eval(() => window.__fixtureRequests.some(request => request.url.includes('/requests/') && request.body.status === 'APPROVED')), true);
  assert.deepEqual(page.consoleErrors, []);
  await page.goto('http://127.0.0.1:3000/login', { settleMs: 2500 });
  await page.eval(async () => { for (let i = 0; i < 100; i++) { if (document.querySelector('.google-auth button:not(:disabled)')) return; await new Promise(resolve => setTimeout(resolve, 200)); } });
  assert.equal(await page.eval(() => document.body.innerText.includes('Facebook')), false, 'Auth page should offer Google and email only');
  assert.equal(await page.eval(() => document.body.innerText.includes('Continue with Google')), true);
  assert.equal(await page.eval(() => document.querySelector('.google-auth button').disabled), false, 'Google sign-in must be ready to use after Clerk loads');
  assert.equal(await page.eval(() => new URL(window.Clerk.buildSignInUrl(), location.origin).pathname), '/login');
  assert.equal(await page.eval(() => new URL(window.Clerk.buildSignUpUrl(), location.origin).pathname), '/register');
  assert.equal(await page.eval(() => new URL(window.Clerk.buildSignUpUrl(), location.origin).origin === location.origin), true, 'Clerk fallback must stay in Aralytics');
  await page.screenshot({ path: `${out}/login-desktop.jpg` });
  await page.goto('http://127.0.0.1:3000/register', { settleMs: 2500 });
  await page.eval(async () => { for (let i = 0; i < 100; i++) { if (document.querySelector('.google-auth button:not(:disabled)')) return; await new Promise(resolve => setTimeout(resolve, 200)); } });
  assert.equal(await page.eval(() => document.querySelector('.google-auth button').disabled), false, 'Google sign-up must be ready to use');
  assert.equal(await page.eval(() => document.querySelector('[name="lrn_or_id"]') !== null), false, 'Account creation must not ask for the student LRN');
  await page.screenshot({ path: `${out}/register-desktop.jpg` });
  assert.deepEqual(page.consoleErrors, []);
  console.log('PASS: code-gated form, adviser sections, submit-to-waiting transition, status refresh, code generation, approve action, and responsive screens at 1440/768/390px. Auth shows Google/email only.');
} finally { await browser.close(); }
