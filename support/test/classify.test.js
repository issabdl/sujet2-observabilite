'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng } = require('../src/prng');
const T = require('../src/telemetry');
const { classify } = require('../src/classify');

for (const cause of ['shader', 'overlay', 'hidden', 'world', 'network', 'generic']) {
  test(`classe un rapport ${cause}`, () => {
    const rng = createRng(42);
    for (let i = 0; i < 50; i++) {
      const c = T.makeClient(rng);
      const s = T.makeServer(rng, { createdAt: Date.now() });
      const { report } = T.spikeReport(rng, c, s, { cause, build: 'beta-20260924-3', now: Date.now(), version: 1 + (i % 2) });
      assert.equal(classify(report), cause);
    }
  });
}

test('detecte un rapport falsifie', () => {
  const rng = createRng(7);
  const { report } = T.spikeReport(rng, T.makeClient(rng), T.makeServer(rng, { createdAt: Date.now() }), { build: 'b', now: Date.now() });
  assert.equal(classify({ ...report, fps: 999 }), 'invalid');
  assert.equal(classify({ ...report, frameMs: 10, work: { ...report.work, totalMs: 300 } }), 'invalid');
  assert.equal(classify({ ...report, work: { ...report.work, stages: { ...report.work.stages, render: -30 } } }), 'invalid');
  assert.equal(classify(null), 'invalid');
});
