// Checks the rules in CLAUDE.md that a test can't: node tools/check.mjs   (run after the build)
// - the built main.js has no network, eval, shell, system notifications or HTML strings
// - notes are written in one place only (src/report-note.js, when the user saves a report)
// - every src/*.js file is in tools/files.json, and no file is too long
// - the web app (src/web, dist/web/index.html): the same rules, and a page that can't connect anywhere
import fs from 'node:fs';

const o = JSON.parse(fs.readFileSync('tools/files.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync(o.manifest, 'utf8'));
const problems = [];
const warn = [];
const WRITES_ALLOWED_IN = ['src/report-note.js'];

const main = `dist/${manifest.id}/main.js`;
if (!fs.existsSync(main)) problems.push(`${main} missing: run node tools/build.mjs first`);
else {
  const code = fs.readFileSync(main, 'utf8');
  const banned = [
    [/\bfetch\s*\(|XMLHttpRequest|\brequestUrl\b|\bWebSocket\b/, 'network access'],
    [/\beval\s*\(|new Function\s*\(/, 'eval'],
    [/child_process|require\(['"](fs|path|os|electron)['"]\)/, 'shell or file system access'],
    [/new Notification\b/, 'system notification'],
    [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/, 'HTML strings'],
  ];
  for (const [re, what] of banned) if (re.test(code)) problems.push(`main.js: ${what} (${code.match(re)[0]})`);
}

const writes = /\b(vault\.(modify|create|delete|rename|append|process)|fileManager\.)/;
const listed = new Set([o.header, ...o.js]);
for (const f of fs.readdirSync('src').filter((n) => n.endsWith('.js')).map((n) => `src/${n}`)) {
  if (!listed.has(f)) problems.push(`${f} is not in tools/files.json`);
  const text = fs.readFileSync(f, 'utf8');
  if (writes.test(text) && !WRITES_ALLOWED_IN.includes(f)) problems.push(`${f}: writes to notes (${text.match(writes)[0]}); only ${WRITES_ALLOWED_IN.join(', ')} may`);
  const lines = text.split('\n').length;
  if (lines > 500) problems.push(`${f}: ${lines} lines (cap 500)`);
  else if (lines > 400) warn.push(`${f}: ${lines} lines (target 400)`);
}
for (const f of o.js) if (!fs.existsSync(f)) problems.push(`${f} is listed in tools/files.json but missing`);

// the web app: its own files listed, the same rules for its code (Pele and the icons are bundled data, not checked
// here), and a page that forbids itself any connection
if (o.web) {
  const listedWeb = new Set(o.web.js);
  for (const f of fs.readdirSync('src/web').filter((n) => n.endsWith('.js')).map((n) => `src/web/${n}`)) {
    if (!listedWeb.has(f)) problems.push(`${f} is not in the web list in tools/files.json`);
  }
  for (const f of [...o.web.js, ...o.web.css, ...o.web.examples]) if (!fs.existsSync(f)) problems.push(`${f} is listed for the web app but missing`);
  const code = o.web.js.filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const webBanned = [
    [/\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|sendBeacon|EventSource/, 'network access'],
    [/\beval\s*\(|new Function\s*\(/, 'eval'],
    [/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML/, 'HTML strings'],
  ];
  for (const [re, what] of webBanned) if (re.test(code)) problems.push(`web app: ${what} (${code.match(re)[0]})`);
  if (fs.existsSync(o.web.out)) {
    const page = fs.readFileSync(o.web.out, 'utf8');
    if (!/http-equiv="Content-Security-Policy" content="[^"]*connect-src 'none'/.test(page)) problems.push(`${o.web.out}: no Content-Security-Policy forbidding connections`);
    if (/<script[^>]+src=|<link[^>]+href=/.test(page)) problems.push(`${o.web.out}: loads a file from elsewhere`);
  }
  for (const f of fs.readdirSync('src/web').map((n) => `src/web/${n}`)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n').length;
    if (lines > 500) problems.push(`${f}: ${lines} lines (cap 500)`);
    else if (lines > 400) warn.push(`${f}: ${lines} lines (target 400)`);
  }
}

for (const w of warn) console.log(`warning: ${w}`);
for (const p of problems) console.log(`problem: ${p}`);
console.log(problems.length ? `${problems.length} problem(s)` : 'check passed');
process.exit(problems.length ? 1 : 0);
