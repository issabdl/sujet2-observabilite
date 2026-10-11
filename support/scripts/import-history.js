'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { classify } = require('../src/classify');

const HEADER = /^(Performance spike|Game completed) (\S+) · (\d{1,2})\/(\d{1,2})\/(\d{4}), (\d{1,2}):(\d{2}):(\d{2}) (AM|PM)$/;

function tzOffsetMs(utcMs, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const p = Object.fromEntries(parts.map((x) => [x.type, Number(x.value)]));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - utcMs;
}

function localToUtc(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - tzOffsetMs(guess, timeZone);
  return guess - tzOffsetMs(first, timeZone);
}

function parseExport(text, timeZone) {
  const lines = text.split('\n');
  const blocks = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADER);
    if (m) {
      if (cur) blocks.push(cur);
      let hour = Number(m[6]) % 12;
      if (m[9] === 'PM') hour += 12;
      cur = {
        kind: m[1] === 'Performance spike' ? 'perf_spike' : 'game_completed',
        serverId: m[2],
        localDate: `${m[3]}/${m[4]}/${m[5]}, ${m[6]}:${m[7]}:${m[8]} ${m[9]}`,
        ts: localToUtc(Number(m[5]), Number(m[3]), Number(m[4]), hour, Number(m[7]), Number(m[8]), timeZone),
        exportLine: i + 1,
        body: [],
      };
      i++;
      continue;
    }
    if (cur) cur.body.push(lines[i]);
  }
  if (cur) blocks.push(cur);
  return blocks;
}

function toEntries(blocks) {
  const seen = new Set();
  const stats = { blocks: blocks.length, perf_spike: 0, game_completed: 0, parseErrors: 0, duplicates: 0, v1: 0, v2: 0 };
  const entries = [];
  for (const b of blocks) {
    const raw = b.body.join('\n').trim();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      stats.parseErrors++;
      continue;
    }
    const key = `${b.kind}|${b.localDate}|${JSON.stringify(json)}`;
    const dup = seen.has(key);
    seen.add(key);
    if (dup) stats.duplicates++;
    stats[b.kind]++;

    const base = { ts: new Date(b.ts).toISOString(), event: b.kind, source: 'export', exportLine: b.exportLine, localDate: b.localDate, dup };
    if (b.kind === 'perf_spike') {
      const { report, server } = json;
      stats[report.version === 2 ? 'v2' : 'v1']++;
      entries.push({
        ...base,
        level: 'warn',
        cause: classify(report),
        clientId: report.id?.split('-')[1],
        rttMs: report.rttMs ?? report.network?.rttMs ?? null,
        report,
        server,
      });
    } else {
      entries.push({ ...base, level: 'info', durationS: Math.round((b.ts - json.createdAt) / 1000), server: json });
    }
  }
  entries.sort((a, b) => a.ts.localeCompare(b.ts) || a.exportLine - b.exportLine);
  return { entries, stats };
}

async function waitForLoki(url) {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${url}/ready`);
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`Loki indisponible sur ${url}`);
}

async function alreadyImported(url, entries) {
  const params = new URLSearchParams({
    query: '{job="history"}',
    start: `${Date.parse(entries[0].ts)}000000`,
    end: `${Date.parse(entries.at(-1).ts) + 1000}000000`,
    limit: '1',
  });
  const r = await fetch(`${url}/loki/api/v1/query_range?${params}`);
  if (!r.ok) return false;
  const d = await r.json();
  return d.data.result.length > 0;
}

async function push(url, entries) {
  const streams = new Map();
  for (const e of entries) {
    const labels = { job: 'history', service: 'game-telemetry-demo', event: e.event, level: e.level };
    const k = JSON.stringify(labels);
    if (!streams.has(k)) streams.set(k, { stream: labels, values: [] });
    streams.get(k).values.push([`${Date.parse(e.ts)}000000`, JSON.stringify(e)]);
  }
  for (const s of streams.values()) {
    for (let i = 0; i < s.values.length; i += 500) {
      const body = { streams: [{ stream: s.stream, values: s.values.slice(i, i + 500) }] };
      const r = await fetch(`${url}/loki/api/v1/push`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`push Loki ${r.status} : ${await r.text()}`);
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: 'string', default: path.join(__dirname, '..', 'data', 'admin-export-2026-09-20_26.log') },
      loki: { type: 'string', default: 'http://localhost:3100' },
      tz: { type: 'string', default: 'Europe/Paris' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const text = fs.readFileSync(values.file, 'utf8');
  const { entries, stats } = toEntries(parseExport(text, values.tz));
  console.log(JSON.stringify({ event: 'history_parsed', ...stats, first: entries[0]?.ts, last: entries.at(-1)?.ts }));
  if (values['dry-run']) return;
  await waitForLoki(values.loki);
  if (await alreadyImported(values.loki, entries)) {
    console.log(JSON.stringify({ event: 'history_skipped', reason: 'deja present dans Loki' }));
    return;
  }
  await push(values.loki, entries);
  console.log(JSON.stringify({ event: 'history_imported', entries: entries.length }));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { parseExport, toEntries, localToUtc };
