// The AI skill in skills/threat-model teaches the language by example: every whole model in it must still be valid,
// so a change to the language that breaks one shows up here, and the skill gets updated with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './load.mjs';

const root = fileURLToPath(new URL('../skills/threat-model/', import.meta.url));
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.md') ? [path.join(dir, d.name)] : []));

test('skill: SKILL.md has a name and a description', () => {
  const text = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8');
  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(front, 'SKILL.md starts with front matter');
  assert.match(front[1], /^name: threat-model$/m);
  assert.match(front[1], /^description: .{40,1024}$/m);
});

test('skill: every whole model (```threat) in the skill has no errors or warnings, and no old .flow words', () => {
  const { tmBuildModel } = load(['tmBuildModel']);
  let count = 0;
  for (const file of files(root)) {
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/^```threat\n([\s\S]*?)^```/gm)) {
      const { errors, warnings } = tmBuildModel(m[1]);
      assert.deepEqual([...errors, ...warnings], [], `${path.relative(root, file)}: ${m[1].split('\n')[0]}`);
      count++;
    }
  }
  assert.ok(count >= 2, 'the skill has at least two whole examples');
});
