import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from './load.mjs';

const { tmBuildModel, tmFirstBlock, tmStructure, tmSequence, tmDataflow, tmReport } = load(['tmBuildModel', 'tmFirstBlock', 'tmStructure', 'tmSequence', 'tmDataflow', 'tmReport']);
const vault = fileURLToPath(new URL('../sample vault/', import.meta.url));

/** Every threat model in the sample vault: [name, source]. */
function samples() {
  const out = [];
  const walk = (dir) => {
    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith('.')) continue;
      const p = path.join(dir, n);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.threat')) out.push([n, fs.readFileSync(p, 'utf8')]);
      else if (n.endsWith('.md')) {
        const src = tmFirstBlock(fs.readFileSync(p, 'utf8'));
        if (src !== null) out.push([n, src]);
      }
    }
  };
  walk(vault);
  return out;
}

test('every model in the sample vault builds and draws without errors', () => {
  const all = samples();
  assert.ok(all.length >= 7, `found ${all.length}`);
  for (const [name, src] of all) {
    const { model, errors } = tmBuildModel(src);
    assert.deepEqual(errors, [], name);
    for (const lvl of ['context', 'container', 'component']) assert.match(tmStructure(model, lvl), /^flowchart TB/, name);
    for (const s of ['', ...model.scenarios.map((x) => x.id)]) assert.match(tmSequence(model, s), /^sequenceDiagram/, name);
    assert.match(tmDataflow(model), /^flowchart TB/, name);
    assert.match(tmReport(model), /## Threat register/, name);
  }
});

test('the full examples have no warnings', () => {
  for (const [name, src] of samples()) {
    if (!/Customer portal|Online shop|Welcome|STRIDE/.test(name)) continue;
    assert.deepEqual(tmBuildModel(src).warnings, [], name);
  }
});
