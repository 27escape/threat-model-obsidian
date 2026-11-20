// Everything the plugin takes from Obsidian and CodeMirror (provided by Obsidian at run time, nothing bundled).
const { Plugin, PluginSettingTab, Setting, MarkdownRenderer, MarkdownRenderChild, Component, TextFileView, Notice, normalizePath, AbstractInputSuggest, TFolder, getIcon, editorInfoField } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
