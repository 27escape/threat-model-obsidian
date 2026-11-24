# Point and click in Obsidian: the plan

Bringing the web editor's point-and-click editing into the plugin. Decided with Kevin on 24 November 2026; update
this note as the work goes, and fold it into `architecture.md` once it is built.

## What the user gets

- **An *Edit* switch** in each threat block's toolbar (and in a `.threat` file's view). With it off, a diagram behaves
  as now: a threat ID shows its footprint, and nothing can change the note. With it on, a click on a box, a zone, an
  arrow or a threat opens it in the editor panel. The switch is not remembered: every block opens with it off.
  Opening another file closes the editor (and turns the switch off), so it never shows a model that isn't in front.
- **The editor panel in the right sidebar** (*Threat model editor*, like Outline or Backlinks), following the block
  whose *Edit* switch is on. It has everything the web editor's panel has: forms for elements, zones, flows, threats
  (likelihood × impact, a risk tag or a CVSS vector) and controls; adding elements, flows, zones, threats, controls
  and scenarios (an *Add* menu at the top of the panel, *New flow from it*, *New element inside*); the zones,
  controls and scenarios lists; deleting.
- **Problems:** a count at the top of the panel opening the list of errors, warnings and findings; each goes to its
  line in the note.
- **Show in text:** selects the statement in the note's code block (or in the `.threat` file's editor).
- **Open in the web editor:** a command (and an item in the block's menu) that opens the model in the web editor
  through a share link. The model travels in the link after the `#`, which a browser never sends anywhere: nothing
  is uploaded. It opens the user's browser, so it happens only when asked.
- **Undo** is Obsidian's own: a change from the panel is an ordinary edit to the note, so Ctrl+Z takes it back.

Not coming across: the models menu, local storage and earlier versions (the vault and Obsidian's File recovery do
that), the report shown in a page (the plugin saves the report as a note), the web page's help, pictures and CSV.

## How it works

- **One panel, two hosts.** The panel (`edit-panel.js`, `panel-more.js`), its forms (`threat-form.js`,
  `item-forms.js`) and their edits (`item-edits.js`, `add-edits.js`) move from `src/web/` to `src/edit/`, shared by
  both builds. The panel stops reaching into the web page (`this.app.text`, `setText`, `showInText`, `showLine`,
  `root`, `menu`) and talks to a *host* instead: `{ text, setText(text), showInText(ref), showLine(n), opened(on) }`.
  The web app is one host; the plugin's is the block (or `.threat` view) whose *Edit* switch is on. Buttons and the
  delete confirmation (`twButton`, `twConfirm`) get a version for each build: Obsidian's `setIcon` and `Modal` in the
  plugin, the page's own in the web app.
- **Writing a change into a note** (only from a Save, Add or Delete in the panel, so always the user's action):
  - The block finds its lines with `ctx.getSectionInfo(el)` at the moment of writing, and checks that the code
    block's text is still what the panel was built from; if not (the user typed meanwhile), the change is refused
    with "the note changed: try again", and the panel redraws.
  - If the note is open in an editor, the change goes through the editor (`editor.replaceRange` on just the code
    block's lines), so Obsidian's undo takes it back and the user's cursor elsewhere is left alone. Otherwise
    `app.vault.process` changes the file, with the same check.
  - Obsidian then draws the block afresh; the panel follows the new block (same note, same block by its position
    among the note's threat blocks) and shows what it showed.
- **A `.threat` file:** its view is the host; a change sets its text and saves it as typing does (`requestSave`).
  Undo in that view: the web editor's history (`history.js`, moved to `src/edit/`), with Undo and Redo in the view's
  menu.
- **Go to a line / show in text:** the note's editor is opened (or focused) at the code block's first line plus the
  line in the model; *Show in text* selects the statement (offsets from the edit engine turned into editor
  positions).
- **Rules kept:** nothing changes a note unless the user saves something in the panel; no network (the web editor
  link opens the user's browser, by command only); no `innerHTML`; the note the user is typing in is changed only
  through the editor, on the code block's own lines.

## Stages

1. **Move and decouple** (done, 24 November 2026; no change for users): `src/edit/` with the host interface; the web app works exactly as
   now (unit tests, `web-check.mjs`). Plugin `main.js` unchanged.
2. **The panel in Obsidian, read-only first** (built 24 November 2026: `editor-view.js`, `obsidian-ui.js`, the Edit switch in `block.js`; to try in the sample vault): the sidebar view, the *Edit* switch, clicks mapped to items (the
   diagram IDs are already in place), the forms shown but Save turned off. Kevin tries it in the sample vault.
3. **Writing** (built 24 November 2026: `note-write.js`, `writeModel` in `editor-view.js`, `setModelText` and Undo/Redo in `file-view.js`; tests in `test/note-write.test.mjs` and `test/editor-view.test.mjs`; blocks in callouts and lists are supported): the write-back above for notes and `.threat` files, with unit tests for finding and replacing a block
   (several blocks in a note, the note changed meanwhile, CRLF line endings, a block in a list or a callout,
   indented with `> `), and the panel following the redrawn block.
4. **Extras:** problems list and go-to-line, *Show in text*, *Open in the web editor*.
5. **Docs and release** (first: put back the sample vault's notes changed while trying the editor, `git restore -- "sample vault"`; `tools/release.sh` refuses a working tree with changes, but a committed test edit would slip through): README (the *Edit* switch, the panel, screenshots), release notes, `architecture.md`.

## Open questions

- A threat block inside a callout or a list: settled, the prefix (`> ` or the indent) is kept on every line.
- Reading view: a change is written into the file (Obsidian's undo can't take that back); in Live Preview or Source
  mode it goes through the editor, and Ctrl+Z takes it back.
- Reading view vs Live Preview: both draw the block; the write-back works the same, but go-to-line needs the note
  in an editor (switch to Live Preview or Source mode first).
- Mobile: the right sidebar is a drawer there; check it is usable before release.
