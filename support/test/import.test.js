'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRng } = require('../src/prng');
const T = require('../src/telemetry');
const { parseExport, toEntries } = require('../scripts/import-history');

test("l'import convertit l'heure locale de Paris en UTC et marque les doublons", () => {
  const rng = createRng(5);
  const c = T.makeClient(rng);
  const s = T.makeServer(rng, { createdAt: Date.UTC(2026, 8, 26, 21, 50) });
  const spike = T.exportSpike(T.spikeReport(rng, c, s, { cause: 'overlay', build: 'beta-20260924-3', now: Date.UTC(2026, 8, 26, 22, 4, 13) }));
  const game = T.exportGame({ ...s, phase: 'ended', score: [3, 1] }, Date.UTC(2026, 8, 26, 10, 0, 0));
  const text = [game, spike, spike].join('\n');

  const blocks = parseExport(text, 'Europe/Paris');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].localDate, '9/27/2026, 12:04:13 AM');

  const { entries, stats } = toEntries(blocks);
  assert.equal(stats.duplicates, 1);
  assert.equal(entries[0].ts, '2026-09-26T10:00:00.000Z');
  assert.equal(entries[1].ts, '2026-09-26T22:04:13.000Z');
  assert.equal(entries[1].cause, 'overlay');
  assert.equal(entries.filter((e) => e.dup).length, 1);
});
