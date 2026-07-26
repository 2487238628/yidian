import {
  advanceRecord, createRecord, MAX_STAGE, nextReviewAtFor, normalizeUrl, selectNextDue,
  sourceDomain, upsertByNormalizedUrl, updateRecordUrl
} from './domain.mjs';

const RECORDS_KEY = 'records';
const SETTINGS_KEY = 'settings';
const REVIEW_ALARM = '12730-next-review';

export function createSerialQueue() {
  let tail = Promise.resolve();
  return (task) => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}

const enqueueBadgeRefresh = createSerialQueue();
const enqueueRecordsMutation = createSerialQueue();

async function getRecords() {
  return (await chrome.storage.local.get(RECORDS_KEY))[RECORDS_KEY] ?? [];
}

async function saveRecords(records) {
  await chrome.storage.local.set({ [RECORDS_KEY]: records });
}

async function getSettings() {
  return (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? { reducedMotion: false };
}

function isWebUrl(rawUrl) {
  try {
    const protocol = new URL(rawUrl).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function currentTab(windowId = null) {
  const query = windowId == null ? { active: true, currentWindow: true } : { active: true, windowId };
  const [tab] = await chrome.tabs.query(query);
  if (!tab?.url || !isWebUrl(tab.url)) return null;
  return { id: tab.id, tabId: tab.id, windowId: tab.windowId, title: tab.title ?? '', url: tab.url };
}

export async function scheduleNext(records = null, now = Date.now()) {
  const currentRecords = records ?? await getRecords();
  const next = currentRecords
    .filter((record) => Number.isFinite(record.nextReviewAt) && record.nextReviewAt > now)
    .toSorted((a, b) => a.nextReviewAt - b.nextReviewAt)[0];
  if (next) {
    await chrome.alarms.create(REVIEW_ALARM, { when: next.nextReviewAt });
  } else {
    await chrome.alarms.clear(REVIEW_ALARM);
  }
}

export async function refreshBadge(records = null, now = Date.now()) {
  const currentRecords = records ?? await getRecords();
  const hasDue = Boolean(selectNextDue(currentRecords, now));
  await chrome.action.setBadgeBackgroundColor({ color: hasDue ? '#F18F6D' : '#00000000' });
  await chrome.action.setBadgeText({ text: hasDue ? '●' : '' });
  await chrome.action.setTitle({ title: hasDue ? '有一份文档想见你' : '打开 12730' });
}

function requestBadgeRefresh(records = null) {
  return enqueueBadgeRefresh(() => refreshBadge(records)).catch((error) => console.warn('12730 badge refresh failed', error));
}

async function syncDerivedState(records) {
  await scheduleNext(records).catch((error) => console.warn('12730 alarm scheduling failed', error));
  await requestBadgeRefresh(records);
}

function isMissingMessageReceiver(error) {
  const message = String(error?.message ?? error);
  return message.includes('Receiving end does not exist')
    || message.includes('Could not establish connection');
}

async function injectCurrentPet(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.getElementById('otter-12730-root')?.remove(),
  });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['pet.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['pet.js'] });
}

async function setTabInjectionError(tabId) {
  if (!tabId) return;
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#D64545' }),
    chrome.action.setBadgeText({ tabId, text: '!' }),
    chrome.action.setTitle({ tabId, title: '请在普通网页中使用 12730' }),
  ]);
}

async function clearTabInjectionError(tabId) {
  if (!tabId) return;
  await Promise.allSettled([
    chrome.action.setBadgeText({ tabId, text: null }),
    chrome.action.setTitle({ tabId, title: null }),
  ]);
}

async function showPetOnTab(tab, mode = 'current') {
  if (!tab?.id || !tab?.url || !isWebUrl(tab.url)) {
    await setTabInjectionError(tab?.id);
    throw new Error('请在普通网页中使用 12730');
  }
  const message = { type: 'show-pet', mode };
  try {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      if (!isMissingMessageReceiver(error)) throw error;
      await injectCurrentPet(tab.id);
      await chrome.tabs.sendMessage(tab.id, message);
    }
    await clearTabInjectionError(tab.id);
  } catch (error) {
    await setTabInjectionError(tab.id);
    throw error;
  }
}

async function refreshInjectedPets() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter((tab) => tab.id).map((tab) => chrome.tabs.sendMessage(tab.id, { type: 'refresh-pet' })));
}

async function markCurrent(tab) {
  return enqueueRecordsMutation(async () => {
    const records = await getRecords();
    const incoming = createRecord({ title: tab.title, url: tab.url });
    const result = upsertByNormalizedUrl(records, incoming);
    if (result.created) await saveRecords(result.records);
    await syncDerivedState(result.records);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, created: result.created, record: result.record };
  });
}

async function completeReview(normalizedUrl) {
  return enqueueRecordsMutation(async () => {
    const records = await getRecords();
    const index = records.findIndex((record) => record.normalizedUrl === normalizedUrl);
    if (index < 0) return { ok: false, error: '记录不存在' };
    const result = advanceRecord(records[index]);
    if (!result.changed) return { ok: true, changed: false, reason: result.reason, record: result.record };
    const next = records.with(index, result.record);
    await saveRecords(next);
    await syncDerivedState(next);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, changed: true, record: result.record };
  });
}

async function removeRecord(normalizedUrl) {
  return enqueueRecordsMutation(async () => {
    const records = await getRecords();
    const next = records.filter((record) => record.normalizedUrl !== normalizedUrl);
    if (next.length !== records.length) await saveRecords(next);
    await syncDerivedState(next);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, removed: next.length !== records.length };
  });
}

async function changeUrl(normalizedUrl, url) {
  return enqueueRecordsMutation(async () => {
    const records = await getRecords();
    const index = records.findIndex((record) => record.normalizedUrl === normalizedUrl);
    if (index < 0) return { ok: false, error: '记录不存在' };
    const normalized = normalizeUrl(url);
    if (records.some((record, i) => i !== index && record.normalizedUrl === normalized)) {
      return { ok: false, error: '这个 URL 已有记录' };
    }
    const next = records.with(index, updateRecordUrl(records[index], url));
    await saveRecords(next);
    await syncDerivedState(next);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, record: next[index] };
  });
}

function normalizeImportedRecord(record, now = Date.now()) {
  if (!record || typeof record !== 'object') throw new TypeError('备份中包含无效记录');
  const stage = Number(record.stage);
  if (!Number.isInteger(stage) || stage < 1 || stage > MAX_STAGE) throw new TypeError('备份中的进度无效');
  const url = String(record.url || '');
  const title = String(record.title || '').trim();
  const skinId = String(record.skinId || 'fluid-01');
  if (url.length > 4096 || title.length > 500 || skinId.length > 64) {
    throw new TypeError('备份中的文本字段过长');
  }
  const normalizedUrl = normalizeUrl(url);
  const completedAt = Number.isFinite(record.completedAt) ? record.completedAt : now;
  const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : completedAt;
  return {
    title: title || sourceDomain(url),
    url,
    normalizedUrl,
    sourceDomain: sourceDomain(url),
    stage,
    completedAt,
    nextReviewAt: stage === MAX_STAGE
      ? null
      : (Number.isFinite(record.nextReviewAt) ? record.nextReviewAt : nextReviewAtFor(stage, completedAt)),
    createdAt,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : completedAt,
    skinId,
  };
}

async function importRecords(rawRecords) {
  if (!Array.isArray(rawRecords) || rawRecords.length > 5000) throw new TypeError('请选择有效的 12730 备份文件');
  const incoming = rawRecords.map((record) => normalizeImportedRecord(record));
  return enqueueRecordsMutation(async () => {
    const current = await getRecords();
    const merged = new Map(current.map((record) => [record.normalizedUrl, record]));
    for (const record of incoming) {
      const existing = merged.get(record.normalizedUrl);
      if (!existing || record.updatedAt >= existing.updatedAt) merged.set(record.normalizedUrl, record);
    }
    const records = [...merged.values()];
    await saveRecords(records);
    await syncDerivedState(records);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, imported: incoming.length, total: records.length };
  });
}

async function setReducedMotion(value) {
  const settings = { ...(await getSettings()), reducedMotion: Boolean(value) };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  return { ok: true, settings };
}

export async function handleMessage(message) {
  if (!message || typeof message !== 'object') return { ok: false, error: '无效操作' };
  if (message.type === 'get-pet-state') {
    const [records, settings] = await Promise.all([getRecords(), getSettings()]);
    const normalized = normalizeUrl(message.page.url);
    const currentRecord = records.find((item) => item.normalizedUrl === normalized) ?? null;
    const dueRecord = selectNextDue(records);
    const reviewMode = message.mode === 'review';
    const record = reviewMode ? (dueRecord ?? currentRecord) : currentRecord;
    return { ok: true, record, currentRecord, dueRecord, isDue: Boolean(reviewMode && dueRecord), settings };
  }
  if (message.type === 'list-records') {
    const records = (await getRecords()).toSorted((a, b) => {
      const aTime = a.stage === MAX_STAGE ? Infinity : a.nextReviewAt;
      const bTime = b.stage === MAX_STAGE ? Infinity : b.nextReviewAt;
      return aTime - bTime || b.updatedAt - a.updatedAt;
    });
    return { ok: true, records };
  }
  if (message.type === 'open-library') {
    await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
    return { ok: true };
  }
  if (message.type === 'open-record') {
    if (!isWebUrl(message.url)) return { ok: false, error: '仅支持 http:// 或 https:// 链接' };
    await chrome.tabs.create({ url: message.url });
    return { ok: true };
  }
  if (message.type === 'mark-current') return markCurrent(message.tab);
  if (message.type === 'complete-review') return completeReview(message.normalizedUrl);
  if (message.type === 'remove-record') return removeRecord(message.normalizedUrl);
  if (message.type === 'change-url') return changeUrl(message.normalizedUrl, message.url);
  if (message.type === 'set-reduced-motion') return setReducedMotion(message.value);
  if (message.type === 'import-records') return importRecords(message.records);
  return { ok: false, error: '未知操作' };
}

async function handleToolbarClick(tab) {
  const records = await getRecords();
  await showPetOnTab(tab, selectNextDue(records) ? 'review' : 'current');
}

export async function handleCommand(command, tab) {
  if (command !== 'open-current-document') return;
  await showPetOnTab(tab, 'current');
}

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message || '操作失败，请重试' }));
    return true;
  });
  chrome.runtime.onInstalled.addListener(async () => syncDerivedState(await getRecords()));
  chrome.runtime.onStartup.addListener(async () => syncDerivedState(await getRecords()));
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REVIEW_ALARM) syncDerivedState().catch(console.error);
  });
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'local') requestBadgeRefresh();
  });
  chrome.action.onClicked.addListener((tab) => {
    handleToolbarClick(tab).catch((error) => console.warn('12730 pet injection failed', error));
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    handleCommand(command, tab).catch((error) => console.warn('12730 shortcut injection failed', error));
  });
}
