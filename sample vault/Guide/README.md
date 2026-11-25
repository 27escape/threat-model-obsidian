> [!info] Copied from `README.md` in the plugin's repository when the plugin is built. Edit that file, not this note.

# Threat Modelling

**[Open the web editor →](https://27escape.github.io/threat-model-obsidian/)** Try it in your browser first: the same language, diagrams and report, with examples to start from, and you can build a model by pointing and clicking. Nothing to install, and nothing leaves your browser. See [The web app](#The%20web%20app).

An Obsidian plugin for writing threat models in your notes. You describe a system in a `threat` code block: its people, systems, containers and data stores, the trust zones they run in, the data that flows between them, and the threats to each part. The plugin draws the model three ways, lets you change it by clicking its diagram, writes a report of it as a note when you ask, and checks it as you write.

It works on desktop and mobile, and it is completely local: diagrams are drawn by Obsidian's own Mermaid renderer, [Pele](https://pele.run/), so it needs Obsidian 1.15 or later.

> [!NOTE]
> **0.3.2:** a *Tools* menu on each diagram (Edit, Report, and the web app's exports: .threat file or code block, share link, SVG, PNG and CSV), icon suggestions as you type, and a calmer bar with the zoom buttons floating over the diagram. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.3.2.md).
>
> **0.3.1:** scenarios on every view (a scenario list before the view list), zoom buttons on the diagrams, nested zones rated as they really are, and the web app as a page to download with each release. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.3.1.md).
>
> **0.3.0:** change a model by clicking its diagram, in Obsidian too: an *Edit* switch on each diagram opens the Threat model editor in the right sidebar, with undo; zones on the Structure view; a flow can go to a new element; *Open in the web editor*. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.3.0.md).
>
> **0.2.3:** the [web editor](https://27escape.github.io/threat-model-obsidian/) can now build and change a model by pointing and clicking, undo and redo, print the report or save it as PDF, export pictures and the threat register, and share a model as a link. In Obsidian, diagrams are drawn even when another plugin's code-block processing fails. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.2.3.md).
>
> **0.2.2:** a [web app](https://27escape.github.io/threat-model-obsidian/); a skill for an AI such as Claude, to draft a threat model from a photo of a diagram or from your description; and two small fixes. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.2.2.md).
>
> **0.2.1:** the settings missing from the settings page in 0.2.0 are back, and a `.threat` file's tab has the plugin's own icon, `shield-half`. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.2.1.md).
>
> **0.2.0:** default icons, marks for untrusted zones and sensitive data, and the old `.flow` words (`io`, `function`, `database`, `boundary`) are gone. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.2.0.md).
>
> **0.1.0:** first release. See [the release notes](https://github.com/27escape/threat-model-obsidian/blob/main/docs/release-notes/0.1.0.md).

## A threat model

````markdown
```threat
title = "Sign-in"

zone internet "Internet" { trust = "untrusted" }
zone dmz "DMZ" { trust = "restricted" }

person user "User" { zone = internet }

system app "Our app" {
  container web "Web app" { technology = "React"  zone = internet }
  container api "API" { technology = "Node.js"  zone = dmz }
  store db "Accounts" { technology = "PostgreSQL"  zone = dmz }
}

user -> web "Signs in"
web -> api "POST /login" {
  protocol = "HTTPS"
  data = ["Email #pii", "Password #secret"]
  threat T01 "Password guessing against the login" #S { likelihood = 3  impact = 4 }
}
api -> db "Reads the account" { data = ["Password hash #secret"] }
```
````

The whole language is described in [[Language reference]]. In short:

- **Elements**: `person`, `external`, `system`, `container`, `component`, `store` and `queue`. Containers and components can be nested inside a system, as in C4.
- **Zones** are trust boundaries. Put an element in one by nesting it inside the zone, or with `zone = …`.
- **Flows**: `a -> b "label" { protocol, data, description }`.
- **Threats**: `threat T01 "title" #S { likelihood, impact, status, mitigation }` (or a risk tag such as `#high` instead of likelihood and impact), written inside the flow, element or zone they are about, or at the top level for the whole model. `on = [a -> b, c]` puts one threat in several places. A CVSS 3.1 vector gives the score.
- **Scenarios**: named, ordered walks through the flows, for the Sequence view.
- **Hashtags**: on any title or inside any text. `#S #T #R #I #D #E` are STRIDE categories (combine them as `#STR` or `#IE`), `#critical #high #medium #low` risks, `#open #mitigated #accepted #transferred` statuses, and `#secret #pii #confidential` mark sensitive data. The rest are yours.

## The views and the report

A list above each model switches between the three diagrams. The **Tools** menu at the end of that bar holds *Edit* (see [Editing from the diagram](#Editing%20from%20the%20diagram)), *Report*, and the ways to get the model out: *Download as .threat file* (from a note) or *Copy as code block* (from a `.threat` file), *Copy a link to share*, *Open in the web editor*, *Download picture* (SVG or PNG, of the diagram shown) and *Download threat register* (CSV). Downloads go through your computer's save dialog; Obsidian on a phone or tablet can't download, so use the link or the web editor there. In the web app, *Report* is a button and the rest are in its models menu. When the model has scenarios, a list before the diagram list shows one scenario at a time on every view, or *All scenarios* (where each diagram opens):

| View | What it shows |
| --- | --- |
| **Structure** | A C4-style diagram. A second list (*Context*, *Container*, *Component*) chooses how far inside each system to look. It offers only the levels that show something different: *Container* when a system has something inside it, *Component* when a container does. A model with nothing nested has no level list. Zones (trust boundaries) are drawn as dotted boxes within each level: the boxes at the top, and those inside each system or container, are grouped by the zone they are in, so a zone that a system's containers are split across is drawn inside the system too. The *Zones* switch hides them. The *Threats* switch (on unless you turn it off) adds the coloured STRIDE letters and threat IDs to boxes and arrows and colours them by their most serious open threat; threats inside a box that isn't opened at this level show on the box. Boxes can have icons (`icon = "user"`, from the Lucide set Obsidian uses); elements without one get a default from their technology or kind (a person `user`, React `globe`, PostgreSQL `database`) unless you turn *Default icons* off in the settings. Arrows that aren't encrypted are dashed. Closed threats (mitigated, accepted or transferred) colour nothing, and their IDs are struck through. A key explains the colours. |
| **Sequence** | A scenario step by step (choose it from the scenario list; *All scenarios* shows every flow in order), with participants grouped by zone. Threats are notes: each STRIDE letter is shown in a box of its own colour (S blue, T orange, R purple, I yellow, D red, E brown), and the risk of an open threat gets louder as it rises (*Low*, **Medium**, **<u>High</u>**, ***<u>CRITICAL</u>***, each in its risk colour), on a background tinted more strongly the higher the risk. A key sits under the diagram. |
| **Data flow** | The classic threat-modelling diagram: trust zones as boxes (a warning shield on an untrusted one), external entities, processes and data stores, numbered flows with their data (a padlock on sensitive data), STRIDE letters (in the same coloured boxes as the Sequence view) and threat IDs, coloured by risk. A key sits under the diagram. |
| **Report** (in the **Tools** menu) | Not a view: it saves the report as a new note and opens it in a new tab, ready to print or export to PDF with Obsidian's *Export to PDF*. The report opens with a summary for readers in a hurry (the open threats, the top three risks, and what needs action), then the scope and method, the threat register (open threats first, then by risk and score), the controls (what is done about threats, with their status and owner), an action plan grouped by owner, findings from the model (such as sensitive data on an unencrypted flow), a risk matrix of likelihood against impact before and after controls, the diagrams, the flows that cross a zone boundary and the sensitive data on them, the STRIDE categories not yet considered for each part, the elements and the flows. Where reports are saved is a setting. |

Above each diagram, at its right, are zoom buttons: zoom out, the zoom (click it to go back to the diagram as first drawn), zoom in, and *Fit*, which fits the whole diagram in the width and the height of the pane, handy for a long one. The zoom is kept as you switch views.

Under each diagram is its threat register: the threats that diagram shows, as in the report. The threat IDs on the diagram's boxes and arrows (such as T01, with its rating in brackets when it has one: `T01 (4×5)` for likelihood × impact, `T04 (6.1)` for a CVSS score) are the IDs in that register, most serious first, with an open threat's ID louder and in its risk colour as the risk rises, so you can see which threat a mark stands for. The *Compact* switch shortens the labels (no descriptions or data) and leaves the detail to the threat register, which helps on a busy diagram. A saved report writes each threat out once, in its threat register near the top; after that it names threats by their IDs, for example under a diagram that shows only some of them. Each of those IDs links to the threat's entry in the register, so hovering over it (with Obsidian's *Page preview* turned on) shows that threat. In Live Preview, hold Ctrl (Cmd on a Mac) while you hover; in Reading view a plain hover is enough. The threat IDs drawn on the report's diagrams are links too: click one to go to its register entry, or hover to see it. In a threat block, hovering over an ID on the diagram shows the threat, and clicking it shows the threat's footprint: every box, arrow and note it applies to stays, the rest of the diagram fades, and its row in the register comes into view. Click the ID again, or anywhere else on the diagram, to clear it.

A saved report also has properties (the model, date, version, status, review date, and counts such as open threats by risk, controls by status and overdue controls), so Obsidian's Bases or Dataview can list all your threat models and what state they are in.

If the model has mistakes, the block lists them with their line numbers instead. Warnings, such as a threat without an ID, are listed under the view.

## Editing from the diagram

You can change a model by clicking its diagram instead of typing. Each change is written into the model's text, changing only what you changed and keeping the rest as you wrote it, comments and all.

- **Turn on *Edit*** in the diagram's **Tools** menu (it shows a tick while it is on, and the **Tools** button is highlighted). The diagram gets an outline, and the **Threat model editor** opens in the right sidebar. *Edit* starts off every time, so nothing changes your notes until you ask. Turning it on in another diagram moves the editor there; turning it off, closing the editor, or opening another file stops editing.
- **Click a box, a zone, an arrow or a threat** (its ID on the diagram, or its row in the threat register) to open it in the editor: a box's name, technology, zone, icon, link and description; a zone's trust; a flow's label, protocol, encryption, authentication and data; a threat's title, STRIDE categories, rating (likelihood × impact before and after its controls, a risk tag, or a CVSS vector), status, controls, owner, mitigation and description. Each has its threats listed, with *New threat here*. Clicking an ID still shows the threat's footprint too. In a box's *Icon* field, start typing to see matching icons, each drawn beside its name (the one the plugin would pick for the box's technology comes first); the web app does the same.
- **Add ▾** adds an element, a flow, a zone, a threat to the whole model, a control or a scenario. A box has *New flow from it* (to an existing element, or to *A new element…*, added with the flow and opened next for you to fill in) and, for a system or container, *New element inside*. **Model ▾** lists the zones, controls and scenarios (a scenario's steps are picked from the flows, in order) and the problems.
- **Delete** boxes, zones, flows, threats, controls and scenarios. A box takes its flows, and anything inside it, with it, after asking.
- **Undo and Redo** (the arrows in the editor's bar, or Ctrl+Z and Ctrl+Shift+Z while the editor is the active pane) take back the editor's changes. In Live Preview and Source mode, Ctrl+Z in the note takes them back too. If you have typed in the model since, the editor's undo stops, so as not to lose your typing.
- **Problems:** the count in the editor's bar opens the errors, warnings and findings from the model; click one to go to its line. ***Show in text*** selects what you clicked in the model's text (from Reading view, the note switches to Live Preview).
- **Open in the web editor** (the link button in the editor's bar, or the command) opens the model in the [web app](#The%20web%20app) in your browser. The model travels in the link itself, after the `#`, which browsers never send to a website: nothing is uploaded.
- **Safe with your typing:** a change is written only if the model's text is still what the editor read; if you typed in it meanwhile, nothing is written and you are told. In Live Preview and Source mode a change goes through the note's editor, so it is an ordinary edit; in Reading view it is written into the file. Models in a callout or a list are kept that way. `.threat` files work the same, with Undo and Redo in the file's own bar too.

## Syntax highlighting

The text of a threat model is coloured as you type: keywords, names, attributes, strings, comments and hashtags, with STRIDE letters, risks and sensitive-data tags in the same colours as the diagrams. The colours come from your theme's code colours.

- in a note, inside `threat` blocks while you edit them
- in the editor of a `.threat` file
- in `threat-source` code blocks, which show a model's text without drawing it (handy for documentation)

## .threat files

A file ending `.threat` opens as a threat model of its own. The pencil button at the top of the view switches to its text.

To edit `.threat` files outside Obsidian, in VS Code for example, a PlantUML extension gives some syntax highlighting once the `.threat` extension is associated with it (*Change Language Mode* → *Configure File Association for '.threat'*). It isn't the same language, so the colours are approximate.

## The web app

The same models and diagrams in a web page, for trying the language without Obsidian, or for people who don't use it: **[https://27escape.github.io/threat-model-obsidian/](https://27escape.github.io/threat-model-obsidian/)**. The diagrams fill the page, with the model's text beside them as you write (*Code* hides it, to give the diagrams the whole width), and the same views, threat register, findings and key as in Obsidian. *Report* shows the report in the page, to read, print or save as PDF (from the print dialog), or download as Markdown for Obsidian.

- **Point and click:** click a box, a zone or an arrow on a diagram to change it (a box's name, technology, zone, icon, link and description; a zone's trust; a flow's label, protocol, whether it is encrypted or authenticated, and its data) and to see its threats and add one. *Model*, at the top, lists the model's zones and controls to change or add. Click a threat (its ID on a diagram, or its row in the threat register) to change it in a form: its title, STRIDE categories, how it is rated (likelihood and impact before and after its controls, a risk tag, or a CVSS vector, checked and explained as you type), status, controls, owner, mitigation and description, or to delete it. Boxes, flows and controls can be deleted too: a box takes its flows, and anything inside it, with it (after asking). Each form changes only what you changed in the text, and keeps the rest as you wrote it, comments and all. The STRIDE categories usual for what you clicked are marked. *Show in text* selects what you clicked in the model's text.
- **Building without typing:** *Add* (at the top) adds an element, a flow, a zone, a threat to the whole model, a control or a scenario; a box's panel has *New flow from it* and, for a system or container, *New element inside*. *Model* lists the zones, controls and scenarios (a scenario's steps are chosen from the flows, in order), and the problems.
- **Undo and redo** (the arrows at the top, or Ctrl+Z and Ctrl+Shift+Z) take back any change, typed or made in a form. The text has line numbers; click *Line N* on an error or a warning to go to it. The problems count, at the top, opens a list of errors, warnings and findings from the model, each going to its line.
- **Getting it out:** from the models menu, *Copy a link to share* (the whole model is packed into the link itself, after the `#`, which browsers never send to a website: nothing is uploaded, and very large models make long links), *Download picture* of the diagram shown (SVG or PNG), and *Download threat register* as CSV for a spreadsheet or a ticket system. The full-screen button shows the diagrams alone.
- **Earlier versions:** your own models keep up to 10 earlier versions in the browser (at most one every ten minutes, and one each time you open another model): *Earlier versions…* in the models menu restores one, and that can be undone too.
- **Help** (or `?`) has the keyboard shortcuts and the whole language reference. Every menu and dialog closes with Esc, a click outside it, or its ✕.
- **The models menu** (the model's name, at the top left) works like a File menu: what you can do with the model shown (save a copy, rename, duplicate, download, copy as a code block, delete), then **My models**, your own, each with a name you choose, and **examples** to open and change. *New* starts one, *Open* reads a `.threat` file (or the first model in a Markdown note), and *Save a copy* keeps your changes to an example.
- **To Obsidian:** *Download* saves the model as a `.threat` file to drop into your vault, and *Copy as code block* copies it as a `threat` code block to paste into a note.
- **A copy of your own:** the page is one file, so you can keep it and use it offline. Download `threat-modelling.html` from the latest [release](https://github.com/27escape/threat-model-obsidian/releases/latest), or, in a clone of this repository, open `web/threat-modelling.html` (the page as of the last release; see [Building](#Building) to build it from the source). Opened from your computer, the examples and diagrams work, but some browsers won't let the page save your own models.
- **Nothing leaves your browser.** The page is one self-contained file that makes no connections (its security policy forbids them) and works offline once loaded.
- **Your models are kept in this browser only**, on this device. They don't follow you to another browser or computer, clearing the site's data deletes them, and a private window forgets them when it closes. *Download* is your backup. Use the page from its web address: opened as a file from your computer, some browsers won't let it save.

## Drafting a model with an AI

[`skills/threat-model/`](https://github.com/27escape/threat-model-obsidian/blob/main/skills/threat-model/SKILL.md) is a skill (instructions for an AI such as Claude) for drafting a model from a photo of a whiteboard or diagram, or from you describing the system. It asks about what it can't read, plays the system back to you before writing, suggests threats with STRIDE per element, and marks the model as a draft with every suggested threat labelled for you to review. To use it with Claude, add it as a skill in Claude's settings, or copy the folder into a project's `.claude/skills/` for Claude Code. Other AI tools can be given `SKILL.md` as instructions.

## Commands

| Command | What it does |
| --- | --- |
| Insert an example threat model | Adds a small model where the cursor is |
| Open the threat report of this note as a new note | The same as *Report* in the diagram's menu, for the first model in the note |
| Open this threat model in the web editor | Opens the first model in the note (or the `.threat` file) in the [web app](#The%20web%20app), in your browser; nothing is uploaded |

## Settings

| Setting | What it does |
| --- | --- |
| First view | The view a model opens with. A model can choose its own with `default_view = "…"`. |
| First C4 level | The level the Structure view opens at. A model can choose its own with `level = "…"`. A model with nothing that deep opens at its deepest level. |
| Show warnings | List warnings under each model. |
| Default icons | Give elements without an icon of their own a default one, from their technology (React `globe`, PostgreSQL `database`, Kafka `list-ordered`…) or their kind (a person `user`, an external system `building-2`); and in the Data flow view mark sensitive data with a padlock and untrusted zones with a warning shield. On by default; `icon = "none"` leaves the icon off one element. See [Icons](https://github.com/27escape/threat-model-obsidian/blob/main/docs/language.md#icons). |
| Save reports | Where *Report* saves a report: in a *Reports* folder beside the note with the model (the default), or in a folder you choose. The folder is made if it doesn't exist. A report never replaces an existing note: a new one gets a number ("… threat report 2"). |
| Report folder | The folder, when reports go in a folder. Start typing to choose from your folders. |
| Include the diagrams | Put the Structure, Data flow and Sequence diagrams in saved reports (on by default). Their colours are written into the diagrams, so they print the same in any theme. |

## Colours and themes

The diagrams take their colours from your theme, in light and dark mode: blues for the C4 structure, red, orange, yellow and green for critical, high, medium and low risk. To change them, set any of these variables in a CSS snippet:

```css
.tm-block {
  --tm-critical: var(--color-red);
  --tm-high: var(--color-orange);
  --tm-medium: var(--color-yellow);
  --tm-low: var(--color-green);
  --tm-boundary: var(--text-muted);          /* zones and system boxes */
  --tm-c4-person: rgba(var(--color-blue-rgb), 0.55);
  --tm-c4-system: rgba(var(--color-blue-rgb), 0.42);
  --tm-c4-container: rgba(var(--color-blue-rgb), 0.28);
  --tm-c4-component: rgba(var(--color-blue-rgb), 0.14);
  --tm-dfd-process: rgba(var(--color-blue-rgb), 0.16);
  --tm-dfd-store: rgba(var(--color-red-rgb), 0.2);
}
```

`src/styles.css` lists them all. The sequence diagram's risk tints are written into the diagram, as Obsidian's diagrams can't take colours from a theme for those; they are see-through, so they work on light and dark backgrounds alike. The STRIDE letters are boxed letters (🆂 🆃 🆁 🅸 🅳 🅴) that the plugin colours once a diagram is drawn: `.tm-sg-S` to `.tm-sg-E` for the letters in diagrams, `.tm-tid-low` to `.tm-tid-critical` (and `.tm-tid-closed`) for threat IDs in diagrams, `.tm-chip-S` to `.tm-chip-E` for those in tables and keys.

## Privacy

Threat Modelling makes no network requests. It reads the text of the threat models it draws. It writes a file only when you ask: saving a report as a note (and making its Reports folder, if needed), editing a `.threat` file, or saving a change in the Threat model editor (and then only inside that model's code block). *Open in the web editor* opens your browser with the model in the link's `#` part, which browsers never send to a website.

## Building

Plain JavaScript with no dependencies and no bundler. Needs Node.js 22 or later.

```sh
node tools/build.mjs        # dist/threat-model/{main.js,styles.css,manifest.json}; also copies the plugin, this README
                            # and docs/language.md into the sample vault
node --test test/*.test.mjs # unit tests
node tools/check.mjs        # local-only rules, file sizes
npm install --no-save pele@1.13.0 lucide-static@1.77.0 && node tools/build-web.mjs   # the web app: dist/web/index.html, one page to open in a browser
npm install --no-save pele && node tools/render-check.mjs   # draws every sample diagram with Pele (optional)
npm install --no-save pele playwright && node tools/dom-check.mjs   # colours them twice in a browser: the second pass must change nothing (optional)
```

To try it, open the `sample vault` folder as a vault in Obsidian and turn on community plugins. Its *Guide* folder has this README and the language reference as notes. To use it in another vault, copy the three files from `dist/threat-model/` into that vault's `.obsidian/plugins/threat-model/` folder.

To try the web app from a clone without building anything, open `web/threat-modelling.html` in your browser: `tools/release.sh` rebuilds it for each release.

`tools/setup-repo.sh` sets up git and GitHub once; `tools/release.sh X.Y.Z` releases a version, with the web app page attached to the release and refreshed in `web/`.

## Licence

MIT. The language grew out of Sony's [DataFlow](https://github.com/sonyxperiadev/dataflow) language. The `Sony webapp` example in the sample vault comes from that project and keeps its BSD 3-clause licence.
