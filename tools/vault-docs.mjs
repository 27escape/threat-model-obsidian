// Copies README.md and docs/language.md into the sample vault as notes ("Guide/README.md" and
// "Guide/Language reference.md"), for people who open the sample vault before the repository. Run by tools/build.mjs.
// The copies are made for Obsidian:
// - a note at the top says where the text comes from (edit the original, not the copy)
// - links to other repository files become links to the guide notes, or to the file on GitHub
// - links to a heading ("#hashtags") point at the heading by its text, as Obsidian expects (no "|", so tables survive)
// - the README's screenshots are left out (between <!-- screenshots … --> and <!-- /screenshots -->): the vault has the real thing
// - each ```threat example that has a picture (images/language-*.svg, made by tools/doc-images.mjs, for GitHub) is
//   shown as its text (```threat-source) and then drawn live by the plugin (```threat); the picture is left out. Fragments are written as
//   ```threat-source in the original, so they show as highlighted text rather than as errors.
import fs from 'node:fs';

const GUIDE = 'sample vault/Guide';
const NOTES = { 'README.md': 'README', 'docs/language.md': 'Language reference' };

/** The repository's GitHub address, from the manifest's author URL and the folder name. */
function githubBase() {
  const m = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
  return `${(m.authorUrl || 'https://github.com/27escape').replace(/\/$/, '')}/${process.cwd().split(/[\\/]/).pop()}/blob/main`;
}

/**
 * In the vault, each pictured example is shown twice: first its text (a threat-source block, highlighted), then the
 * example itself (a threat block, which the plugin draws live). Its pictures are left out: the live drawing replaces
 * them.
 */
export function liveExamples(text) {
  return text.replace(/^```threat\n([\s\S]*?)^```\n((?:\s*!\[[^\]]*\]\(images\/language-[^)]+\.svg\)\n)+)/gm, (all, source) => {
    return '```threat-source\n' + source + '```\n\n```threat\n' + source + '```\n';
  });
}

/** Each ```threat example in a Markdown file, with the pictures of it that follow: [{ source, images: [path] }]. */
export function examplesWithImages(text) {
  const out = [];
  const re = /^```threat\n([\s\S]*?)^```\n((?:\s*!\[[^\]]*\]\(images\/language-[^)]+\.svg\)\n)*)/gm;
  let m;
  while ((m = re.exec(text))) out.push({ source: m[1], images: [...m[2].matchAll(/\((images\/language-[^)]+\.svg)\)/g)].map((x) => x[1]) });
  return out;
}

/** The text without its screenshots section (<!-- screenshots … --> to <!-- /screenshots -->). */
export function withoutScreenshots(text) {
  return text.replace(/^<!-- screenshots\b[\s\S]*?<!-- \/screenshots -->\n+/m, '');
}

/** "[text](#some-heading)" → "[text](#Some%20heading)", using the note's own headings. */
export function headingLinks(text) {
  const slug = (h) => h.toLowerCase().replace(/[^a-z0-9 -]/g, '').trim().replace(/ +/g, '-');
  const headings = [...text.matchAll(/^#{1,6} (.+)$/gm)].map((m) => m[1].trim());
  return text.replace(/\[([^\]]+)\]\(#([a-z0-9-]+)\)/g, (all, label, s) => {
    const h = headings.find((x) => slug(x) === s);
    return h ? `[${label}](#${encodeURI(h)})` : all;
  });
}

/** Links to repository files: a guide note when there is one, otherwise the file on GitHub. */
export function repoLinks(text, base) {
  return text.replace(/\[([^\]]+)\]\((?!https?:|#|mailto:)([^)\s]+)\)/g, (all, label, target) => {
    if (NOTES[target]) return label === target ? `[[${NOTES[target]}]]` : `[[${NOTES[target]}|${label}]]`;
    return `[${label}](${base}/${target})`;
  });
}

/** The guide notes as they should be: [{ path, text }]. */
export function vaultDocs() {
  const base = githubBase();
  return Object.entries(NOTES).map(([file, note]) => ({
    path: `${GUIDE}/${note}.md`,
    text:
      `> [!info] Copied from \`${file}\` in the plugin's repository when the plugin is built. Edit that file, not this note.\n\n` +
      repoLinks(headingLinks(liveExamples(withoutScreenshots(fs.readFileSync(file, 'utf8')))), base),
  }));
}

export function writeVaultDocs() {
  if (!fs.existsSync('sample vault')) return 0;
  fs.mkdirSync(GUIDE, { recursive: true });
  const docs = vaultDocs();
  for (const { path, text } of docs) if (!fs.existsSync(path) || fs.readFileSync(path, 'utf8') !== text) fs.writeFileSync(path, text);
  return docs.length;
}
