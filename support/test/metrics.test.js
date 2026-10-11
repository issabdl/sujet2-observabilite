'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const metrics = require('../src/metrics');

async function value(name, labels) {
  const all = (await metrics.register.getMetricsAsJSON()).flatMap((m) => m.values.map((v) => ({ ...v, name: v.metricName ?? m.name })));
  const v = all.find((x) => x.name === name && Object.entries(labels).every(([k, val]) => x.labels[k] === val));
  return v?.value ?? 0;
}

test('les rapports hidden ne comptent pas dans la duree d image', async () => {
  const build = 'beta-20990101-1';
  metrics.track({ event: 'perf_spike', cause: 'hidden', report: { build, frameMs: 4000 } });
  metrics.track({ event: 'perf_spike', cause: 'overlay', report: { build, frameMs: 400 } });
  assert.equal(await value('perf_reports_total', { build, cause: 'hidden' }), 1);
  assert.equal(await value('perf_report_frame_ms_count', { build }), 1);
});

test('un build au format inattendu est regroupe dans other', async () => {
  metrics.track({ event: 'perf_spike', cause: 'generic', report: { build: 'nimporte-quoi', frameMs: 80 } });
  assert.equal(await value('perf_reports_total', { build: 'other', cause: 'generic' }), 1);
});
