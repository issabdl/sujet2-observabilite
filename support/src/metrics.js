'use strict';

const client = require('prom-client');
const { MAPS } = require('./telemetry');

const register = client.register;
client.collectDefaultMetrics({ register });

const httpRequests = new client.Counter({
  name: 'http_requests_total',
  help: 'Requetes HTTP traitees',
  labelNames: ['method', 'route', 'status'],
});

const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duree de traitement des requetes HTTP',
  labelNames: ['method', 'route'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});

const reportsRejected = new client.Counter({
  name: 'perf_reports_rejected_total',
  help: 'Rapports refuses par l API',
  labelNames: ['reason'],
});

const perfReports = new client.Counter({
  name: 'perf_reports_total',
  help: 'Rapports de performance recus par cause et par build',
  labelNames: ['cause', 'build', 'source'],
});

const frameTime = new client.Histogram({
  name: 'perf_report_frame_ms',
  help: 'Duree de l image signalee dans les rapports (ms)',
  labelNames: ['build'],
  buckets: [50, 100, 200, 400, 800, 1600, 3200, 6400],
});

const gamesInProgress = new client.Gauge({
  name: 'games_in_progress',
  help: 'Parties en cours par carte',
  labelNames: ['map'],
});

const tickGapMax = new client.Gauge({
  name: 'games_tick_gap_max_ms',
  help: 'Plus grand ecart entre deux ticks serveur sur les parties en cours (ms)',
});

const gamesCreated = new client.Counter({
  name: 'games_created_total',
  help: 'Parties creees par carte',
  labelNames: ['map'],
});

const gamesCompleted = new client.Counter({
  name: 'games_completed_total',
  help: 'Parties terminees par carte',
  labelNames: ['map', 'quarantined'],
});

const gameDuration = new client.Histogram({
  name: 'game_duration_seconds',
  help: 'Duree reelle des parties terminees',
  labelNames: ['map'],
  buckets: [10, 30, 60, 120, 300, 600, 900],
});

const BUILD_RE = /^beta-\d{8}-\d+$/;
const cleanBuild = (b) => (typeof b === 'string' && BUILD_RE.test(b) ? b : 'other');

function track(e) {
  if (e.event === 'perf_spike') {
    const build = cleanBuild(e.report?.build);
    perfReports.inc({ cause: e.cause ?? 'generic', build, source: e.source ?? 'fleet' });
    if (typeof e.report?.frameMs === 'number' && e.report.frameMs > 0) frameTime.observe({ build }, e.report.frameMs);
  } else if (e.event === 'game_created') {
    gamesCreated.inc({ map: e.server.map });
  } else if (e.event === 'game_completed') {
    const s = e.server;
    gamesCompleted.inc({ map: s.map, quarantined: String(s.quarantined) });
    gameDuration.observe({ map: s.map }, Math.max(0, (Date.parse(e.ts) - s.createdAt) / 1000));
  }
}

function updateGames(games) {
  for (const m of MAPS) gamesInProgress.set({ map: m }, 0);
  let gap = 0;
  for (const g of games) {
    gamesInProgress.inc({ map: g.map });
    gap = Math.max(gap, g.tickGapMaxMs ?? 0);
  }
  tickGapMax.set(gap);
}

module.exports = { register, httpRequests, httpDuration, reportsRejected, track, updateGames };
