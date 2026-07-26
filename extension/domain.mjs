export const DAY_MS = 86_400_000;
export const MAX_STAGE = 4;
export const STAGE_PERCENT = Object.freeze({ 1: 25, 2: 50, 3: 75, 4: 100 });
const NEXT_INTERVAL_DAYS = Object.freeze({ 1: 1, 2: 5, 3: 23 });

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
  return `${sourceDomain(rawUrl)} · ${stamp} Mark`;
}

export function nextReviewAtFor(stage, completedAt) {
  const days = NEXT_INTERVAL_DAYS[stage];
  return days ? completedAt + days * DAY_MS : null;
}

export function createRecord({ title, url, now = Date.now(), skinId = 'fluid-01' }) {
  const normalizedUrl = normalizeUrl(url);
  return {
    title: String(title || '').trim() || fallbackTitle(url, now),
    url,
    normalizedUrl,
    sourceDomain: sourceDomain(url),
    stage: 1,
    completedAt: now,
    nextReviewAt: nextReviewAtFor(1, now),
    createdAt: now,
    updatedAt: now,
    skinId,
  };
}

export function isDue(record, now = Date.now()) {
  return record.stage < MAX_STAGE && Number.isFinite(record.nextReviewAt) && record.nextReviewAt <= now;
}

export function advanceRecord(record, now = Date.now()) {
  if (record.stage >= MAX_STAGE) return { changed: false, reason: 'complete', record };
  if (!isDue(record, now)) return { changed: false, reason: 'not_due', record };
  const stage = Math.min(MAX_STAGE, record.stage + 1);
  return {
    changed: true,
    reason: 'advanced',
    record: {
      ...record,
      stage,
      completedAt: now,
      nextReviewAt: nextReviewAtFor(stage, now),
      updatedAt: now,
    },
  };
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
    normalizedUrl: normalizeUrl(url),
    sourceDomain: sourceDomain(url),
    updatedAt: now,
  };
}
