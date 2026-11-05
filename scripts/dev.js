/**
 * Runs the API (with --watch) and the Vite dev server together.
 * Ctrl+C stops both; if either exits, the other is stopped too.
 */
const { spawn } = require('child_process');

// A single command string (no args array) works with shell: true on every platform.
const children = ['server', 'client'].map(workspace =>
  spawn(`npm run dev --workspace ${workspace}`, { stdio: 'inherit', shell: true })
);

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

for (const child of children) child.on('exit', code => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
