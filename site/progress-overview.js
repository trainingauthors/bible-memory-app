import { dayKey as localDayKey, shiftDay } from "./calendar.js";
import {cmDate} from "./cm-policy.js";
function progressOverview(definitions, snapshot, now = /* @__PURE__ */ new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const dayKey = (date) => localDayKey(date, timeZone);
  const today = dayKey(now), weekday = (/* @__PURE__ */ new Date(today + "T12:00:00Z")).getUTCDay(), start = shiftDay(today, -((weekday + 6) % 7));
  const corrections = new Map((snapshot.corrections || []).filter((r) => ["practice", "legacy"].includes(r.event_source)).map((r) => [r.event_source + ":" + r.event_request_id, r]));
  const refs = new Map(definitions.map((d) => [d.id, d.reference])), events = [], seen = /* @__PURE__ */ new Set();
  const add = (key, id, at, kind, scheduled, reference, explicitDay) => {
    if (typeof id !== "string" || !id || typeof at !== "string" || !Number.isFinite(Date.parse(at)) || Date.parse(at) > now.getTime() || seen.has(key)) return;
    const correction = scheduled ? null : corrections.get(key);
    if (correction?.removed === 1) return;
    // A CM completion keeps the validated calendar date saved with that action,
    // even when this browser later selects a different timezone.
    let day;try{day=explicitDay===undefined?dayKey(at):cmDate(explicitDay);}catch{return;}
    seen.add(key);
    events.push({ key, targetId: id, reference: typeof reference === "string" ? reference : refs.get(id) || id, at, day, kind, scheduled, canRemove: !scheduled, correctionRevision: Number(correction?.revision || 0) });
  };
  for (const r of snapshot.reviews) add("review:" + r.request_id, r.card_id, r.reviewed_at, "adaptive-review", true);
  for (const r of snapshot.practice) if (["read", "listen", "external-audio", "recall-practice"].includes(r.modality)) add("practice:" + r.request_id, r.target_id, r.completed_at, r.modality, false, r.reference);
  for (const r of snapshot.legacy) add("legacy:" + r.request_id, r.target_id, r.completed_at, "external-audio", false, r.reference);
  for (const r of snapshot.cm) {
    let o;
    try {
      o = JSON.parse(r.outcome_json);
    } catch {
      continue;
    }
    if (!o || o.saved !== true || !["reviewed", "advance"].includes(o.kind) || !Array.isArray(o.completions)) continue;
    for (const c of o.completions) if (c && typeof c === "object" && typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.id === o.targetId && ["reviewed", "memorized-advance"].includes(c.reason)) add("cm:" + r.request_id + ":" + c.id + ":" + c.date, c.id, o.savedAt, "cm-review", true, void 0, c.date);
  }
  events.sort((a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key));
  const daily = /* @__PURE__ */ Object.create(null);
  for (const e of events) {
    const d = daily[e.day] ??= { count: 0, cards: [], scheduledReviews: 0, events: [] };
    d.count++;
    d.events.push(e);
    if (!d.cards.includes(e.targetId)) d.cards.push(e.targetId);
    if (e.scheduled) d.scheduledReviews++;
  }
  const week = events.filter((e) => e.day >= start && e.day <= today), categories = ["extended", "verse", "story", "chapter", ...definitions.some((d2) => d2.kind === "card" && d2.canManage) ? ["card"] : []];
  const journey = categories.map((kind) => ({ kind, learning: 0, memorized: 0, later: 0 }));
  for (const d of definitions.filter((d2) => d2.canManage)) {
    const kind = d.memoryGroup === "extended" ? "extended" : d.kind === "verse" ? "verse" : d.kind === "story" ? "story" : ["sequence", "chapter", "book"].includes(d.kind) ? "chapter" : d.kind === "card" ? "card" : null;
    const row = journey.find((r) => r.kind === kind);
    if (!row) continue;
    const choice = snapshot.choices.find((c) => c.card_id === d.id), stage = snapshot.stages.find((s) => s.card_id === d.id);
    row[choice?.status !== "active" ? "later" : stage?.stage === "memorized" ? "memorized" : "learning"]++;
  }
  let plan = null;
  try {
    plan = snapshot.plans[0] ? JSON.parse(snapshot.plans[0].state_json) : null;
  } catch {
  }
  return { today, week: { start, end: today, daysPracticed: new Set(week.map((e) => e.day)).size, uniqueItems: new Set(week.map((e) => e.targetId)).size, scheduledReviews: week.filter((e) => e.scheduled).length, practiceCompletions: week.filter((e) => !e.scheduled).length }, journey, daily, recent: events.slice(0, 12), totalEvents: events.length, totalPractice: events.filter((e) => !e.scheduled).length, totalScheduledReviews: events.filter((e) => e.scheduled).length, restDay: plan?.active === true && plan.box && Number.isInteger(plan.sabbath) && plan.sabbath >= 0 && plan.sabbath <= 6 ? plan.sabbath : null };
}
export {
  progressOverview
};
