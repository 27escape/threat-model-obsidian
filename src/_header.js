'use strict';
/*
 * Threat Modelling: draws threat models written in "threat" code blocks (and .threat files) as C4-style structure,
 * sequence and data-flow diagrams, and writes a threat report. By Kevin Mulholland + Claude.
 * Built from src/ by tools/build.mjs; each part starts with a "@src" line.
 *
 * Everything runs locally: no network requests, no telemetry, no eval, no shell access.
 * Diagrams are drawn by the Mermaid that comes with Obsidian. The plugin changes no notes; it writes a file only
 * when you ask (saving a report as a note, or editing a .threat file in its own view).
 */
