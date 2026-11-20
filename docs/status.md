# Status

Where Threat Modelling stands, what is decided, and what might come next. Read this before starting work in a new
chat; update it when something here changes.

## Released

- **0.1.0** is published on GitHub (27escape/threat-model-obsidian).
- **0.2.0 is ready to release** (`docs/release-notes/0.2.0.md`, and its line in the README's `[!NOTE]` block): a minor
  version, as the `.flow` kind names are gone. It adds default icons, the untrusted-zone shield and the padlock on
  sensitive data, the threat register named the same everywhere, the bar kept clear of Obsidian's edit-block button in
  Live Preview, and the README screenshots and VS Code tip. Release with `tools/release.sh 0.2.0`.
- **Obsidian's community plugin list:** not submitted yet. The language changes are finished, so it can go in after 0.2.0. Submitting
  is a pull request to `obsidianmd/obsidian-releases` adding the plugin to `community-plugins.json`.

## Decided

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
