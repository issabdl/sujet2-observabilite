'use strict';

const CAUSES = ['shader', 'overlay', 'hidden', 'world', 'network', 'generic', 'invalid'];

function isInvalid(report) {
  const work = report.work ?? {};
  const stages = work.stages ?? {};
  if (typeof report.frameMs !== 'number' || report.frameMs <= 0) return true;
  if (typeof report.fps === 'number' && (report.fps <= 0 || report.fps > 144)) return true;
  if (Object.values(stages).some((v) => typeof v === 'number' && v < 0)) return true;
  const hidden = (report.activities ?? []).some((a) => a.name === 'visibilityHidden');
  if (!hidden && typeof work.totalMs === 'number' && report.frameMs + 1 < work.totalMs) return true;
  return false;
}

function classify(report) {
  if (!report || typeof report !== 'object') return 'invalid';
  if (isInvalid(report)) return 'invalid';

  const details = report.work?.details ?? {};
  if (report.reason === 'network') return 'network';
  if ((report.activities ?? []).some((a) => a.name === 'visibilityHidden')) return 'hidden';
  if (report.graphics?.firstCapture) return 'shader';
  if (details.renderOverlay > 100) return 'overlay';
  if (details.worldDynamics > 30) return 'world';
  return 'generic';
}

module.exports = { CAUSES, classify };
