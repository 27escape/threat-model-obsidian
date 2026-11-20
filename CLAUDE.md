# Threat Modelling — notes for Claude

Obsidian plugin (desktop and mobile): draws threat models written in `threat` code blocks and `.threat` files as a C4-style Structure view, a Sequence view and a Data flow view; the Report button saves a Markdown report as a note and opens it in a new tab. Plain JavaScript, no runtime dependencies, no bundler: `tools/build.mjs` joins `src/` files in the order listed in `tools/files.json`. Same conventions as Kevin's Neon Work and Simple Glossary plugins.

## Read first
- `docs/status.md`: what is released, what is decided, ideas under consideration, the checks to run and known limits. Read it first in a new chat, and keep it up to date.
- `docs/language.md`: the threat model language. It is the specification: change it first, then the code.
- `docs/architecture.md`: how the parts fit together.
- `MAP.md`: every source file with its functions, classes and methods (regenerate: `node tools/map.mjs`). Find code there first, then open only that file.
- `README.md`: what the user sees; keep it in step with behaviour.

## Where things are
- Language: `src/lex.js` (tokens, `TmError`), `src/parse.js` (grammar → raw model), `src/model.js` (names resolved, zones, threats scored, scenarios matched; errors and warnings with line numbers), `src/tags.js` (hashtags with a meaning), `src/cvss.js` (CVSS 3.x base score), `src/highlight.js` (syntax highlighting: text → classed ranges, forgiving of half-typed text).
- Views (text out, no DOM): `src/mermaid.js` (shared helpers, `tmMmText` escaping), `src/structure.js`, `src/sequence.js`, `src/dataflow.js`, `src/report.js`, `src/threat-table.js` (which threats a view shows; the table under a diagram).
- Obsidian: `src/plugin.js` (the Plugin class, commands), `src/block.js` (`TmBlock`: the bar of buttons and switches, the chosen view, its threat table), `src/legend.js` (the key under a diagram), `src/file-view.js` (`.threat` files, with a highlighted editor), `src/highlight-editor.js` (highlighting in the note editor and in `threat-source` blocks), `src/stride-colour.js` (colours the boxed STRIDE letters once a diagram is drawn), `src/report-note.js` (the one place a note or folder is written; where reports go, and their diagrams), `src/settings.js`, `src/styles.css`.

## Build and test
- `node tools/build.mjs` → `dist/threat-model/{main.js,styles.css,manifest.json}`, the manifest copied to the repo root, and a copy in `sample vault/.obsidian/plugins/threat-model/`. It also copies `README.md` and `docs/language.md` into `sample vault/Guide/` as notes (`tools/vault-docs.mjs`: links fixed for Obsidian, `threat` examples shown as `threat-source`, highlighted text); never edit those notes, and build after changing either file (a test checks they are up to date). The examples in `docs/language.md` are whole models (a test checks they have no errors or warnings), shown as text and then drawn live in the vault; on GitHub each is followed by a picture, `docs/images/language-<name>-<view>.svg`, made by `npm install --no-save pele && node tools/doc-images.mjs` — run it after changing an example. Fragments go in `threat-source` blocks.
- `node --test test/*.test.mjs` runs the unit tests (real source files, a small Obsidian stand-in in `test/load.mjs`). `test/samples.test.mjs` builds every model in the sample vault.
- `node tools/check.mjs`: no network, eval, shell, notifications or HTML strings in the build; notes written only in `src/report-note.js`; every src file listed; file sizes.
- Obsidian 1.15+ draws Mermaid with Pele (pele.run), not Mermaid.js. `npm install --no-save pele && node tools/render-check.mjs [--svg DIR]` draws every view of every sample model with Pele. Diagram colours live in `styles.css` (see "Pele, and colours from CSS" in `docs/architecture.md`); never write fixed colours into the themed output, only into `{ portable: true }`.
- Anything that changes drawn diagrams (stride-colour.js, icon-draw.js, id-links.js) must leave alone what it has already done, or the watcher runs for ever and hangs Obsidian. `npm install --no-save pele playwright && node tools/dom-check.mjs` colours every sample diagram twice in a browser and fails if the second pass changes anything; run it after touching those files.
- `tools/setup-repo.sh [--dry-run]` sets up git and GitHub once. `tools/release.sh [X.Y.Z] [--dry-run]` releases a version (needs `docs/release-notes/X.Y.Z.md`); GitHub Actions (`.github/workflows/release.yml`) drafts the release, which the script publishes. A release adds a line at the top of the README's `[!NOTE]` block.
- Reports saved while trying the plugin in the sample vault (`Reports/` folders, `… threat report.md`) are git-ignored, so they never reach a release; delete them when tidying up.

## Rules
- **Never change the user's notes unasked.** The only writes: a report saved as a new note, and its folder if missing, when the user clicks the *Report* button or runs the command (never overwriting a file), and the user's own edits in the `.threat` file view.
- 100% local: no network, no system notifications, no `child_process`, no `eval`, no `innerHTML` with data. Diagrams go through `MarkdownRenderer` as `mermaid` code blocks.
- All user text that goes into Mermaid passes through `tmMmText`.
- Keep the language backwards compatible once released; keep settings keys and command ids; migrate saved settings on load when a default changes.
- Use British English in UI text and docs.
- Files: one job each, target under 400 lines (soft cap 500). New feature = new file + entry in `tools/files.json` + `node tools/map.mjs`.
- Every bug fixed gets a unit test or a check. Commits end with the attribution lines; the author is Kevin Mulholland <kevin@27escape.com>.
