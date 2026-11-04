const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// PDFKit's browser bundle embeds standard fonts. Replace its computed Node
// file URL with a stable bundle URL so it can initialize inside Workers.
const source = fs.readFileSync(path.join(root, 'server/node_modules/pdfkit/js/pdfkit.standalone.js'), 'utf8');
fs.mkdirSync(path.join(root, '.cloudflare'), { recursive: true });
fs.writeFileSync(path.join(root, '.cloudflare/pdfkit.cjs'), source.replaceAll("require('u' + 'rl').pathToFileURL(__filename).href", "'file:///bundle/pdfkit.js'"));
