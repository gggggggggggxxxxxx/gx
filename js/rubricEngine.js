/**
 * 量规检查清单引擎：基础分 + 命中项加减 + 封顶
 */

import { clamp, round2 } from "./scoringShared.js";

/**
 * @param {object} opts
 * @param {number} opts.base
 * @param {Array<{ id: string; label: string; delta?: number; failDelta?: number; test: () => boolean; passNote?: string; failNote?: string }>} opts.checks
 * @param {Array<{ id: string; max: number; when: () => boolean; reason: string }>} [opts.caps]
 * @param {Array<{ when: (score: number) => boolean; apply: (n: number) => number; note: string }>} [opts.adjustments]
 */
export function runRubric({ base, checks, caps = [], adjustments = [] }) {
  let score = base;
  /** @type {Array<{ id: string; label: string; delta: number; met: boolean }>} */
  const hits = [];
  /** @type {Array<{ id: string; label: string; reason: string }>} */
  const missed = [];
  /** @type {Array<{ id: string; cap: number; reason: string }>} */
  const capReasons = [];
  const strengths = [];
  const issues = [];

  for (const c of checks) {
    const met = c.test();
    const passDelta = c.delta ?? 0;
    const failDelta = c.failDelta ?? 0;
    if (met) {
      score += passDelta;
      if (passDelta !== 0 || c.passNote) {
        hits.push({ id: c.id, label: c.label, delta: passDelta, met: true });
      }
      if (c.passNote) strengths.push(c.passNote);
    } else {
      score += failDelta;
      missed.push({ id: c.id, label: c.label, reason: c.failNote || c.label });
      if (c.failNote) issues.push(c.failNote);
    }
  }

  score = clamp(score, 0, 10);

  for (const cap of caps) {
    if (cap.when() && score > cap.max) {
      score = cap.max;
      capReasons.push({ id: cap.id, cap: cap.max, reason: cap.reason });
      if (!issues.includes(cap.reason)) issues.push(cap.reason);
    }
  }

  for (const adj of adjustments) {
    if (adj.when(score)) {
      const next = adj.apply(score);
      if (next !== score && adj.note && !issues.includes(adj.note)) issues.push(adj.note);
      score = next;
    }
  }

  score = round2(clamp(score, 0, 10));

  return { score, hits, missed, capReasons, strengths, issues };
}

/** @param {Array<{ id: string; reason: string }>} missed @param {Array<{ id: string; reason: string }>} capReasons @param {number} [limit] */
export function topMissedForDisplay(missed, capReasons, limit = 3) {
  const fromCaps = capReasons.map((c) => ({ id: c.id, label: c.reason }));
  const fromMissed = missed.map((m) => ({ id: m.id, label: m.reason }));
  const seen = new Set();
  const out = [];
  for (const item of [...fromCaps, ...fromMissed]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
