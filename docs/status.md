# Status

Where Threat Modelling stands, what is decided, and what might come next. Read this before starting work in a new
chat; update it when something here changes.

## Released

- **Published on GitHub** (27escape/threat-model-obsidian): 0.1.0, 0.2.0, 0.2.1 and 0.2.2. 0.2.0 dropped the `.flow` kind
  names and added default icons, the untrusted-zone shield and the padlock on sensitive data; 0.2.1 fixed the settings
  page (only the first three settings showed in 0.2.0; now tested) and gave `.threat` tabs the plugin's own icon,
  `shield-half`.
- **In Obsidian's community plugin list** since 0.2.0: https://community.obsidian.md/plugins/threat-model (review
  passed). The listing shows no plugin icon; the plugin's own icon (`shield-half`) is on the tab of a `.threat` file.
- **0.2.2** (`docs/release-notes/0.2.2.md`): the AI skill (`skills/threat-model/`, idea 11), the web app (idea 12,
  first stage, live on GitHub Pages: `.github/workflows/pages.yml` publishes it for each release tag), the starter
  model without warnings, and icon names that survive Lucide's renames.
- **0.2.3, ready to release:** point and click for elements, zones, flows
  and controls; then adding elements, flows and scenarios from forms (*Add*, *Model*), undo and redo, line numbers
  and errors that go to their line, a problems list, *Show in text*, the report shown in the page (print or save as
  PDF), pictures (SVG, PNG), the threat register as CSV, a share link with the model in it, earlier versions in the
  browser, full screen, Help with the language reference and keyboard shortcuts, and every overlay closing with Esc,
  a click outside or its ✕. Release notes: `docs/release-notes/0.2.3.md`, with the plugin's fix for diagrams not drawn when another plugin's Markdown post-processor throws (Embedded Code Title 0.5.5); release with `tools/release.sh 0.2.3`.

## Decided

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

Not agreed; each wants a conversation before any work.

1. **A compact sequence diagram in saved reports,** for long scenarios (Internet banking's is long).
2. **Filters:** show only threats of high risk and above, or of one STRIDE category, on a busy diagram.
3. **Trust zones in the Structure view,** not only in the Data flow and Sequence views, so a C4 reader sees the boundaries.
4. **A left-to-right layout option** for large models.
5. **What changed since the last report:** new, closed and re-rated threats, by comparing with the previous report.
6. **CSV export** of the threat register, for Jira or a spreadsheet.
7. **References on threats:** CWE or CAPEC numbers, and links to tickets.
8. **Data assets as things of their own** (named, with how confidential and how important their integrity is), so the
   model can tell where each one travels; today sensitive data is marked with hashtags.
9. **A visual editor for threats, controls and elements,** opened from the diagram: click a box, arrow or threat ID
   to edit it in a form, or add a threat to it, without writing the language by hand. Ideas to take from OWASP
   Threat Dragon (open source, Apache 2.0; https://owasp.org/www-project-threat-dragon/docs-2/): select an element
   to see its properties and its threats, a *New threat* button for the selected element, STRIDE categories offered
   per kind of element ("STRIDE per element"), and an out-of-scope flag. OWASP Precogly (Apache 2.0) is a newer one
   with a richer diagram editor. Constraints here: the model stays text; a save changes only the statement edited
   (keeping the user's comments and layout) and only when the user saves; never the note being typed in.
10. CLI to generate diagrams and reports from .threat files
11. ~~An AI skill to draft models from a photo or a description~~: done, in `skills/threat-model/` (see *Released*).
12. **A standalone web app** for writing models and exporting them: see *Decided*.


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
