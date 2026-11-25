# Status

Where Threat Modelling stands, what is decided, and what might come next. Read this before starting work in a new
chat; update it when something here changes.

## Before the next release

- **Check the workflows' first runs on Node 24** (commit 354a053: checkout v7, setup-node v7 building with Node 24,
  configure-pages v6, upload-pages-artifact v5, deploy-pages v5, attest-build-provenance v4). After
  `tools/release.sh`, open GitHub's Actions tab: the *Release* run must draft the release with all four files
  (`main.js`, `manifest.json`, `styles.css`, `threat-modelling.html`), and the *Web app* run must deploy, with no
  "Node.js 20 is deprecated" warning. If either fails, the previous versions are in the commit before 354a053.
- The `github-pages` environment allows tags `*.*.*` (set on 25 November 2026 for 0.3.1); keep that rule.

## Released

- **Published on GitHub** (27escape/threat-model-obsidian): 0.1.0, 0.2.0, 0.2.1, 0.2.2 and 0.2.3. 0.2.0 dropped the `.flow` kind
  names and added default icons, the untrusted-zone shield and the padlock on sensitive data; 0.2.1 fixed the settings
  page (only the first three settings showed in 0.2.0; now tested) and gave `.threat` tabs the plugin's own icon,
  `shield-half`.
- **In Obsidian's community plugin list** since 0.2.0: https://community.obsidian.md/plugins/threat-model (review
  passed). The listing shows no plugin icon; the plugin's own icon (`shield-half`) is on the tab of a `.threat` file.
- **0.2.2** (`docs/release-notes/0.2.2.md`): the AI skill (`skills/threat-model/`, idea 11), the web app (idea 12,
  first stage, live on GitHub Pages: `.github/workflows/pages.yml` publishes it for each release tag), the starter
  model without warnings, and icon names that survive Lucide's renames.
- **0.3.1, ready to release** (`docs/release-notes/0.3.1.md`): scenarios on every view, zoom buttons, nested-zone ratings, the web app page attached to releases and in `web/`, and the skill writing scenarios. Release with `tools/release.sh 0.3.1` (push from WSL first).
- **0.3.0 (released)** (`docs/release-notes/0.3.0.md`): editing from the diagram in Obsidian (the *Edit* switch and the Threat model editor in the right sidebar, with Add and Model menus, undo and redo, problems, *Show in text*, *Open in the web editor*); zones on the Structure view; a flow to a new element; deleting a box takes its flows.
- **0.2.3 (released):** point and click for elements, zones, flows
  and controls; then adding elements, flows and scenarios from forms (*Add*, *Model*), undo and redo, line numbers
  and errors that go to their line, a problems list, *Show in text*, the report shown in the page (print or save as
  PDF), pictures (SVG, PNG), the threat register as CSV, a share link with the model in it, earlier versions in the
  browser, full screen, Help with the language reference and keyboard shortcuts, and every overlay closing with Esc,
  a click outside or its ✕. Release notes: `docs/release-notes/0.2.3.md`, with the plugin's fix for diagrams not drawn when another plugin's Markdown post-processor throws (Embedded Code Title 0.5.5); release with `tools/release.sh 0.2.3`.

## Decided

- **Point and click in Obsidian** (24 November 2026, built for 0.3.0): the editor panel in the right sidebar, an *Edit*
  switch on each block (off unless turned on), with the problems list, *Show in text* and *Open in the web editor*;
  the editor's own undo as well as Obsidian's. How it went, in stages: [`docs/editor-in-obsidian.md`](editor-in-obsidian.md);
  how it works: `docs/architecture.md`.
- **Web app first, then point-and-click in Obsidian** (ideas 9 and 12). Built: the web app's first
  stage (diagrams, text, the models menu, export), the edit engine (`edit.js`, `edit-threat.js`) and point and click
  in the web app for threats (rated by likelihood × impact, a risk tag or a CVSS vector), elements, zones (with new zones), flows and controls (`threat-form.js`, `web/edit-panel.js`,
  `web/item-forms.js`, `web/item-edits.js`). Since then: adding elements, flows and scenarios (`web/add-edits.js`, `web/panel-more.js`).
  Not yet: the panel in
  Obsidian (held back for now: move `item-edits.js` into the engine when it comes). One repo, one build
  with a second file list. Order: a standalone page (text editor, live diagrams, threat register, export as a
  `.threat` file or a `threat` code block, report as Markdown); then an edit engine (source positions; change, add or
  remove one statement, keeping comments and layout) as a plain module; then point-and-click forms in the page; then
  the same engine and forms in Obsidian (forms draw into any container, styled with Obsidian's CSS variable names).
  The page offers example models to try (Newsletter sign-up, Customer portal sign-in, Online shop), and keeps the
  user's own, named, in the browser's local storage, with download and open to move them in and out. Nothing is sent
  anywhere. Its limits are stated in the page (an *About* panel, and a one-line note by *My models*) and in a README
  section: models stay in one browser on one device, clearing site data or a private window loses them, *Download*
  is the backup, and it is best used from its web address (GitHub Pages) rather than opened from disk.

- **Rating threats:** one way per threat. Likelihood × impact is the main way (with a residual rating after controls);
  a risk tag (`#high`) is the quick way; a CVSS vector is only for a threat that is a known vulnerability. `score = …`
  from the `.flow` format is still read, with a warning. A threat rated more than one way gets a warning.
- **The `.flow` kind names** (`io`, `function`, `database`, `boundary`) are gone; a model using one gets an error that
  names the word to write.
- **Closed threats** (mitigated, accepted, transferred) colour nothing, and their IDs are struck through. The plugin
  never closes a threat itself: when all of an open threat's controls are in place it only suggests doing so.
- **"Threat register"** is the name for the list of threats everywhere (under each diagram and in the report); the
  **risk matrix** is the grid of likelihood against impact, a different thing.
- **Dropped:** a numeric trust level on zones and information value on elements and data (stride-plantuml's
  `$TrustValueRatio`, "idea C"). The revised rating covers what was wanted from it.
- **Default icons** (the *Default icons* setting, on; `icon = "none"` for one element): a person is `user`; otherwise
  a known word in `technology` (`TM_TECH_ICONS` in `icons.js`), then the kind: external `building-2`, store
  `database`, queue `list-ordered`. Systems, containers and components have none; the language reference suggests
  some. The Data flow view also marks untrusted zones with `shield-alert` after the title and sensitive data with 🔒
  (text, so it survives copying); the same setting turns those off. Portable data-flow diagrams style zones with
  `classDef tmZone`, not `style`, because `style` on a subgraph drops its other classes (the icon).

## Ideas to consider

Reviewed with Kevin on 25 November 2026, one by one. Held ideas want a conversation before any work.

### Held for the future

1. **Icon suggestions in the editor's Icon field:** as you type, a list of matching Lucide icons, each drawn beside
   its name, the technology's default icon first. Obsidian: an `AbstractInputSuggest` on the field (already used by
   the settings), names from `getIconIds()`, drawn with `setIcon`. Web app: the same list from the bundled
   `TW_LUCIDE` names (and old names), in a small dropdown under the field (a `<datalist>` can't show the icons). One
   shared suggestion function, two small hosts; a few hours with tests.
2. **The web app's export options in the plugin:** the diagram shown as SVG or PNG, and the threat register as CSV,
   saved beside the note (commands, perhaps buttons). The web app has them all (`web/export.js`); in Obsidian today,
   *Open in the web editor* gets there. No need yet; others may want it if they start using the plugin.
3. **Filters on a busy diagram:** only threats of high risk and above, or of one STRIDE category. Scenarios, the
   footprint of one threat and the *Threats* switch cover much of it for now.
4. **References on threats:** CWE or CAPEC numbers and ticket links (`refs = […]`), shown as links in the register,
   the report and the CSV, with a field in the threat form. No requirement yet.
5. **Data assets as things of their own:** each piece of data declared once (how confidential, how important its
   integrity) and referred to from flows and stores, so the model knows where each travels; today sensitive data is
   marked with hashtags. A language change, one to two days. Kevin wants to understand how it affects things first:
   start with a short note showing a model both ways, and what changes in the diagrams, report and findings.

### No longer required

- **A compact sequence diagram in saved reports:** *Compact*, the zoom buttons and one scenario at a time cover long
  diagrams.
- **A left-to-right layout option:** zoom, *Fit* and scenarios do the job.
- **What changed since the last report:** models live in git (GitHub or similar), whose history shows what changed;
  the diagrams are the point of reference.
- **A command-line tool for diagrams and reports:** the web app exports pictures, the register and the report.

### Done

- **Trust zones in the Structure view:** 0.3.0 (nested-zone ratings in 0.3.1).
- **A visual editor for threats, controls and elements:** the web app in 0.2.3, Obsidian in 0.3.0 (the Threat model
  editor). An out-of-scope flag on single elements wasn't built; a model's `scope` and `out_of_scope` describe it.
- **CSV export of the threat register:** in the web app (the plugin's is idea 2 above).
- **An AI skill to draft models from a photo or a description:** `skills/threat-model/`, 0.2.2; scenarios and nested
  zones in 0.3.1.
- **A standalone web app:** https://27escape.github.io/threat-model-obsidian/, since 0.2.2; also attached to each
  release and committed as `web/threat-modelling.html`.

## Checks to run

- Always: `node tools/build.mjs`, `node --test test/*.test.mjs`, `node tools/check.mjs`.
- After changing what is drawn, or the colouring of drawn diagrams (`stride-colour.js`, `icon-draw.js`,
  `id-links.js`): `npm install --no-save pele playwright && node tools/dom-check.mjs` (the second colouring pass must
  change nothing; once it didn't, and Obsidian hung) and `node tools/render-check.mjs`.
- After changing an example in `docs/language.md`: `npm install --no-save pele lucide-static && node tools/doc-images.mjs`.

## Known limits

- Nothing tests drawing inside Obsidian itself. Pele (`render-check.mjs`) and a browser (`dom-check.mjs`) come close,
  but Obsidian's own version of Pele can behave differently: it wraps sequence-diagram text and ignores an `init`
  directive that turns that off, which is why no note sits over a single participant. Check new drawing work in the
  sample vault before releasing.
- Obsidian draws a diagram only once it is scrolled into view, so anything done to drawn diagrams watches for them
  (a `MutationObserver`) rather than running once.
- In Live Preview, Obsidian runs no post-processors on a note's own diagrams; `diagram-editor.js` covers that.
- Page preview (hovering over a link) needs Ctrl (Cmd on a Mac) in Live Preview.
