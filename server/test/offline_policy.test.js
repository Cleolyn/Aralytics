const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const listeners = {};
let fetched = 0;
const saved = { marker: 'explicit-download' };
const sandbox = {
  URL, self: { location: { origin: 'https://school.test' }, addEventListener: (type, handler) => { listeners[type] = handler; } },
  caches: { open: async name => { assert.equal(name,'aralytics-materials-v3'); return { match:async () => saved }; } },
  fetch:async () => { fetched++; return {}; }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../client/public/sw.js'),'utf8'),sandbox);
function dispatch(pathname,method = 'GET') {
  const event = { request: { url:`https://school.test${pathname}`,method }, respondWith: value => { event.response = value; } };
  listeners.fetch(event); return event;
}
(async () => {
  for (const route of ['/api/auth/me','/api/materials','/api/materials/read-logs','/api/assessment/submit','/api/teacher/gradebook','/api/performance-tasks/files/private.pdf']) assert.equal(dispatch(route).response,undefined,`${route} must bypass caches`);
  assert.equal(dispatch('/api/materials/download/lesson.pdf','POST').response,undefined);
  assert.equal(await dispatch('/api/materials/download/lesson.pdf').response,saved);
  assert.equal(fetched,0);
  console.log('PASS: private APIs bypass caches; only explicit lesson downloads are served offline.');
})().catch(error => { console.error(error); process.exitCode = 1; });
