// Everything the plugin takes from Obsidian and CodeMirror (provided by Obsidian at run time, nothing bundled).
const { Plugin, PluginSettingTab, Setting, MarkdownRenderer, MarkdownRenderChild, Component, TextFileView, Notice, normalizePath, AbstractInputSuggest, TFolder, getIcon, editorInfoField, loadMermaid, ItemView, Modal, Menu, setIcon, TFile, MarkdownView } = require('obsidian');
const { ViewPlugin, Decoration } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');
