export const DAY_MS = 86_400_000;
export const MAX_STAGE = 4;
export const MAX_EXCERPT_LENGTH = 1_000;
export const MAX_ENCOUNTERS = 100;
export const ENCOUNTER_COOLDOWN_MS = 10 * 60_000;
export const STAGE_PERCENT = Object.freeze({ 1: 25, 2: 50, 3: 75, 4: 100 });
const NEXT_INTERVAL_DAYS = Object.freeze({ 1: 1, 2: 5, 3: 23 });
const ENCOUNTER_TYPES = new Set(['saved', 'review', 'encounter', 'restart']);
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|ocid|wt\.mc_id)$/i;

export function parseWebUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new TypeError('仅支持 http:// 或 https:// 链接');
  }
  return url;
}

export function normalizeUrl(rawUrl) {
  const url = parseWebUrl(rawUrl);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

export function sourceDomain(rawUrl) {
  return parseWebUrl(rawUrl).hostname.replace(/^www\./, '') || '当前页面';
}

export function fallbackTitle(rawUrl, now = Date.now()) {
  const stamp = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Shanghai'
  }).format(new Date(now));
  return `${sourceDomain(rawUrl)} · ${stamp} 收藏`;
}

export function nextReviewAtFor(stage, completedAt) {
  const days = NEXT_INTERVAL_DAYS[stage];
  return days ? completedAt + days * DAY_MS : null;
}

export function createRecord({ title, url, canonicalUrl = '', excerpt = '', now = Date.now(), skinId = 'fluid-01' }) {
  const normalizedUrl = normalizeUrl(canonicalUrl || url);
  const savedExcerpt = String(excerpt || '').trim().slice(0, MAX_EXCERPT_LENGTH);
  return {
    title: String(title || '').trim() || fallbackTitle(url, now),
    excerpt: savedExcerpt,
    url,
    canonicalUrl: canonicalUrl ? normalizeUrl(canonicalUrl) : '',
    normalizedUrl,
    sourceDomain: sourceDomain(url),
    stage: 1,
    completedAt: now,
    nextReviewAt: nextReviewAtFor(1, now),
    createdAt: now,
    updatedAt: now,
    skinId,
    encounters: [{ type: 'saved', at: now, stage: 1, ...(savedExcerpt ? { excerpt: savedExcerpt } : {}) }],
  };
}

export function isDue(record, now = Date.now()) {
  return record.stage < MAX_STAGE && Number.isFinite(record.nextReviewAt) && record.nextReviewAt <= now;
}

export function advanceRecord(record, now = Date.now()) {
  if (record.stage >= MAX_STAGE) return { changed: false, reason: 'complete', record };
  if (!isDue(record, now)) return { changed: false, reason: 'not_due', record };
  const stage = Math.min(MAX_STAGE, record.stage + 1);
  const advanced = {
    ...record,
    stage,
    completedAt: now,
    nextReviewAt: nextReviewAtFor(stage, now),
    updatedAt: now,
  };
  return {
    changed: true,
    reason: 'advanced',
    record: addEncounter(advanced, { type: 'review', now }),
  };
}

export function restartRecord(record, now = Date.now()) {
  const restarted = {
    ...record,
    stage: 1,
    completedAt: now,
    nextReviewAt: nextReviewAtFor(1, now),
    updatedAt: now,
  };
  return addEncounter(restarted, { type: 'restart', now });
}

export function selectNextDue(records, now = Date.now()) {
  return records
    .filter((record) => isDue(record, now))
    .toSorted((a, b) => a.nextReviewAt - b.nextReviewAt || a.createdAt - b.createdAt)[0] ?? null;
}

export function upsertByNormalizedUrl(records, incoming) {
  const index = records.findIndex((item) => item.normalizedUrl === incoming.normalizedUrl);
  if (index >= 0) return { created: false, records, record: records[index] };
  return { created: true, records: [...records, incoming], record: incoming };
}

export function updateRecordUrl(record, url, now = Date.now()) {
  return {
    ...record,
    url,
    canonicalUrl: '',
    normalizedUrl: normalizeUrl(url),
    sourceDomain: sourceDomain(url),
    updatedAt: now,
  };
}
function cleanEncounter(event) {
  if (!event || !ENCOUNTER_TYPES.has(event.type) || !Number.isFinite(event.at)) return null;
  const stage = Number.isInteger(event.stage) && event.stage >= 1 && event.stage <= MAX_STAGE ? event.stage : 1;
  const excerpt = String(event.excerpt || '').trim().slice(0, MAX_EXCERPT_LENGTH);
  return { type: event.type, at: event.at, stage, ...(excerpt ? { excerpt } : {}) };
}

export function encountersFor(record) {
  const existing = Array.isArray(record.encounters)
    ? record.encounters.map(cleanEncounter).filter(Boolean).toSorted((a, b) => a.at - b.at)
    : [];
  if (existing.length) return existing.slice(-MAX_ENCOUNTERS);
  const createdAt = Number.isFinite(record.createdAt) ? record.createdAt
    : Number.isFinite(record.completedAt) ? record.completedAt
      : Number.isFinite(record.updatedAt) ? record.updatedAt : 0;
  const encounters = [{ type: 'saved', at: createdAt, stage: 1, ...(record.excerpt ? { excerpt: record.excerpt } : {}) }];
  if (record.stage > 1 && Number.isFinite(record.completedAt) && record.completedAt !== createdAt) {
    encounters.push({ type: 'review', at: record.completedAt, stage: record.stage });
  }
  return encounters;
}

export function addEncounter(record, { type = 'encounter', now = Date.now(), excerpt = '' } = {}) {
  if (!ENCOUNTER_TYPES.has(type)) throw new TypeError('Unknown encounter type');
  const savedExcerpt = String(excerpt || '').trim().slice(0, MAX_EXCERPT_LENGTH);
  const encounter = { type, at: now, stage: record.stage, ...(savedExcerpt ? { excerpt: savedExcerpt } : {}) };
  return {
    ...record,
    ...(savedExcerpt ? { excerpt: savedExcerpt } : {}),
    encounters: [...encountersFor(record), encounter].slice(-MAX_ENCOUNTERS),
    updatedAt: now,
  };
}

export function canAddEncounter(record, now = Date.now()) {
  const lastSeenAt = encountersFor(record).at(-1)?.at ?? 0;
  return now - lastSeenAt >= ENCOUNTER_COOLDOWN_MS;
}

export function encounterCount(record) {
  return encountersFor(record).filter((event) => event.type === 'encounter').length;
}
export function consolidateRecords(records) {
  const groups = new Map();
  let changed = false;
  for (const record of records) {
    const identityUrl = record.canonicalUrl || record.url || record.normalizedUrl;
    const normalizedUrl = normalizeUrl(identityUrl);
    const normalized = {
      ...record,
      url: record.url || identityUrl,
      normalizedUrl,
      sourceDomain: sourceDomain(record.url || identityUrl),
      encounters: encountersFor(record),
    };
    if (record.normalizedUrl !== normalizedUrl || !Array.isArray(record.encounters)) changed = true;
    const group = groups.get(normalizedUrl) ?? [];
    group.push(normalized);
    groups.set(normalizedUrl, group);
  }

  const merged = [];
  let mergedCount = 0;
  for (const group of groups.values()) {
    const master = group.toSorted((a, b) =>
      (b.stage || 1) - (a.stage || 1) || (b.updatedAt || 0) - (a.updatedAt || 0)
    )[0];
    const events = group.flatMap((record) => encountersFor(record)).toSorted((a, b) => a.at - b.at);
    let keptSaved = false;
    const unique = new Map();
    for (const event of events) {
      const next = event.type === 'saved' && keptSaved ? { ...event, type: 'encounter' } : event;
      if (next.type === 'saved') keptSaved = true;
      unique.set(`${next.type}|${next.at}|${next.stage}|${next.excerpt || ''}`, next);
    }
    const encounters = [];
    for (const event of unique.values()) {
      if (event.type === 'encounter' && encounters.length
        && event.at - encounters.at(-1).at < ENCOUNTER_COOLDOWN_MS) {
        changed = true;
        continue;
      }
      encounters.push(event);
    }
    encounters.splice(0, Math.max(0, encounters.length - MAX_ENCOUNTERS));
    const latestExcerpt = encounters.toReversed().find((event) => event.excerpt)?.excerpt || master.excerpt;
    const masterUrl = master.canonicalUrl || master.url || master.normalizedUrl;
    merged.push({
      ...master,
      url: master.url || masterUrl,
      excerpt: latestExcerpt,
      normalizedUrl: normalizeUrl(masterUrl),
      sourceDomain: sourceDomain(master.url || masterUrl),
      createdAt: Math.min(...group.map((record) => Number.isFinite(record.createdAt) ? record.createdAt : 0)),
      updatedAt: Math.max(...group.map((record) => Number.isFinite(record.updatedAt) ? record.updatedAt : 0)),
      encounters,
    });
    if (group.length > 1) {
      changed = true;
      mergedCount += group.length - 1;
    }
  }
  return { records: merged, changed, mergedCount };
}
