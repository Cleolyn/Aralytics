/**
 * Prepares Workers-compatible module shims in .cloudflare/ (aliased in wrangler.jsonc).
 *
 * npm workspaces may install a dependency in node_modules/ or server/node_modules/
 * depending on the lockfile, so packages are located by resolution, not fixed paths.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.cloudflare');

/** Directory of an installed package, as resolved from the server workspace. */
function packageDir(name) {
  // Packages with an "exports" map block deep requires, so walk up from the main entry.
  let dir = path.dirname(require.resolve(name, { paths: [path.join(root, 'server')] }));
  while (!fs.existsSync(path.join(dir, 'package.json')) || JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Could not locate the ${name} package directory.`);
    dir = parent;
  }
  return dir;
}

const importPath = file => {
  const relative = path.relative(outDir, file).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
};

fs.mkdirSync(outDir, { recursive: true });

// PDFKit's browser bundle embeds the standard fonts. Replace its computed Node
// file URL with a stable bundle URL so it can initialize inside Workers.
const pdfkitSource = fs.readFileSync(path.join(packageDir('pdfkit'), 'js', 'pdfkit.standalone.js'), 'utf8');
fs.writeFileSync(
  path.join(outDir, 'pdfkit.cjs'),
  pdfkitSource.replaceAll("require('u' + 'rl').pathToFileURL(__filename).href", "'file:///bundle/pdfkit.js'")
);

// libSQL: use the fetch-based web client inside Workers.
const libsqlWeb = path.join(packageDir('@libsql/client'), 'lib-esm', 'web.js');
fs.writeFileSync(path.join(outDir, 'libsql-client.mjs'), `export * from '${importPath(libsqlWeb)}';\n`);

console.log('[prepare-worker] Wrote .cloudflare/pdfkit.cjs and .cloudflare/libsql-client.mjs');
