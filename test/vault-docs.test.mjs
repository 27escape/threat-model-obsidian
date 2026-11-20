import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { liveExamples, examplesWithImages, headingLinks, repoLinks, vaultDocs } from '../tools/vault-docs.mjs';
import { load } from './load.mjs';

test('guide notes: a pictured example shows its text, then is drawn live in place of the picture', () => {
  const src = '```threat\nperson p\n```\n\n![The view](images/language-x-dataflow.svg)\n\nText\n\n![Other](images/other.png)\n\n```threat\nperson q\n```\n';
  assert.equal(
    liveExamples(src),
    '```threat-source\nperson p\n```\n\n```threat\nperson p\n```\n\nText\n\n![Other](images/other.png)\n\n```threat\nperson q\n```\n'
  );
});

test('docs/language.md: every example is a whole model with no errors or warnings, and every picture of one exists', () => {
  const { tmBuildModel } = load(['tmBuildModel']);
  const text = fs.readFileSync(new URL('../docs/language.md', import.meta.url), 'utf8');
  const examples = examplesWithImages(text);
  assert.ok(examples.length >= 5);
  for (const ex of examples) {
    const { errors, warnings } = tmBuildModel(ex.source);
    assert.deepEqual([...errors, ...warnings], [], ex.source.split('\n')[0]);
    for (const img of ex.images) assert.ok(fs.existsSync(new URL(`../docs/${img}`, import.meta.url)), `${img} is missing: node tools/doc-images.mjs`);
  }
  // and every picture in the file belongs to an example
  const pictures = [...text.matchAll(/\((images\/language-[^)]+\.svg)\)/g)].map((m) => m[1]);
  assert.deepEqual(pictures, examples.flatMap((e) => e.images));
});

test('guide notes: heading links and repository links', () => {
  assert.equal(headingLinks('# The views\n\nSee [views](#the-views).'), '# The views\n\nSee [views](#The%20views).');
  assert.equal(repoLinks('[docs/language.md](docs/language.md)', 'https://g/b'), '[[Language reference]]');
  assert.equal(repoLinks('[the spec](docs/language.md)', 'https://g/b'), '[[Language reference|the spec]]');
  assert.equal(repoLinks('[notes](docs/release-notes/0.1.0.md)', 'https://g/b'), '[notes](https://g/b/docs/release-notes/0.1.0.md)');
  assert.equal(repoLinks('[Pele](https://pele.run/)', 'https://g/b'), '[Pele](https://pele.run/)');
});

test('the guide notes in the sample vault are up to date with README.md and docs/language.md (run the build)', () => {
  process.chdir(fileURLToPath(new URL('..', import.meta.url)));
  for (const { path, text } of vaultDocs()) assert.equal(fs.readFileSync(path, 'utf8'), text, `${path} is out of date: node tools/build.mjs`);
});
