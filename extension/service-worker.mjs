import {
  addEncounter, advanceRecord, canAddEncounter, consolidateRecords, createRecord, isDue, MAX_ENCOUNTERS, MAX_EXCERPT_LENGTH, MAX_STAGE,
  nextReviewAtFor, normalizeUrl, restartRecord, selectNextDue, sourceDomain, updateRecordUrl
} from './domain.mjs';

const RECORDS_KEY = 'records';
const SETTINGS_KEY = 'settings';
const REVIEW_ALARM = 'yidian-next-review';
const LEGACY_REVIEW_ALARM = '12730-next-review';
const DUE_NOTIFICATION_ID = 'yidian-due';
const DUE_BADGE_COLOR = '#28735F';
const DEFAULT_ACTION_TITLE = '打开一点｜收下或回看当前内容';
const UNAVAILABLE_BADGE_COLOR = '#8A5200';

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

async function getRawRecords() {
  return (await chrome.storage.local.get(RECORDS_KEY))[RECORDS_KEY] ?? [];
}

async function getRecords() {
  return consolidateRecords(await getRawRecords()).records;
}

async function saveRecords(records) {
  await chrome.storage.local.set({ [RECORDS_KEY]: records });
}

async function getSettings() {
  return (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] ?? { reducedMotion: false, notifyOnDue: false };
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
  const dueCount = currentRecords.filter((record) => isDue(record, now)).length;
  await chrome.action.setBadgeBackgroundColor({ color: DUE_BADGE_COLOR });
  await chrome.action.setBadgeText({ text: dueCount > 9 ? '9+' : String(dueCount || '') });
  await chrome.action.setTitle({ title: dueCount ? `有 ${dueCount} 份收藏想见你` : '打开一点' });
}

function requestBadgeRefresh(records = null) {
  return enqueueBadgeRefresh(() => refreshBadge(records)).catch((error) => console.warn('yidian badge refresh failed', error));
}

async function syncDerivedState(records) {
  await scheduleNext(records).catch((error) => console.warn('yidian alarm scheduling failed', error));
  await requestBadgeRefresh(records);
}

// 到期提醒：默认关闭，用户在“我的收藏”里手动开启。用固定 id 重复创建即更新，避免刷屏。
async function maybeNotifyDue(records = null, now = Date.now()) {
  const settings = await getSettings();
  if (!settings.notifyOnDue) return;
  const currentRecords = records ?? await getRecords();
  const dueCount = currentRecords.filter((record) => isDue(record, now)).length;
  if (!dueCount) return;
  await chrome.notifications.create(DUE_NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title: '一点来找你了',
    message: `有 ${dueCount} 份收藏想见你。点开工具栏的一点，再见一面。`,
  }).catch((error) => console.warn('yidian notification failed', error));
}

function isMissingMessageReceiver(error) {
  const message = String(error?.message ?? error);
  return message.includes('Receiving end does not exist')
    || message.includes('Could not establish connection');
}

async function injectCurrentPet(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.getElementById('otter-yidian-root')?.remove(),
  });
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['pet.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['shared.js', 'pet.js'] });
}

async function setTabInjectionError(tabId) {
  if (!tabId) return;
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ tabId, color: UNAVAILABLE_BADGE_COLOR }),
    chrome.action.setBadgeText({ tabId, text: '!' }),
    chrome.action.setTitle({ tabId, title: '请在普通网页中使用一点' }),
  ]);
}

async function clearTabInjectionError(tabId) {
  if (!tabId) return;
  await Promise.allSettled([
    chrome.action.setBadgeBackgroundColor({ tabId, color: DUE_BADGE_COLOR }),
    chrome.action.setBadgeText({ tabId, text: '' }),
    chrome.action.setTitle({ tabId, title: DEFAULT_ACTION_TITLE }),
  ]);
}

async function showPetOnTab(tab, mode = 'current') {
  if (!tab?.id || !tab?.url || !isWebUrl(tab.url)) {
    await setTabInjectionError(tab?.id);
    throw new Error('请在普通网页中使用一点');
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
    const incoming = createRecord({ title: tab.title, url: tab.url, canonicalUrl: tab.canonicalUrl, excerpt: tab.excerpt });
    const pageNormalized = normalizeUrl(tab.url);
    const aliases = new Set([incoming.normalizedUrl, pageNormalized]);
    const created = !records.some((item) => aliases.has(item.normalizedUrl));
    let record = incoming;
    let next = [...records, incoming];
    let encountered = false;
    if (!created) {
      const promoted = records.map((item) => aliases.has(item.normalizedUrl) ? {
        ...item,
        canonicalUrl: incoming.canonicalUrl || item.canonicalUrl || '',
        normalizedUrl: incoming.normalizedUrl,
      } : item);
      next = consolidateRecords(promoted).records;
      const index = next.findIndex((item) => item.normalizedUrl === incoming.normalizedUrl);
      record = next[index];
      if (canAddEncounter(record)) {
        record = addEncounter(record, { excerpt: tab.excerpt });
        next = next.with(index, record);
        encountered = true;
      }
    }
    await saveRecords(next);
    await syncDerivedState(next);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, created, encountered, alreadySaved: !created && !encountered, record };
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
  const excerpt = String(record.excerpt || '').trim();
  const skinId = String(record.skinId || 'fluid-01');
  const canonicalUrl = String(record.canonicalUrl || '');
  const encounters = Array.isArray(record.encounters) ? record.encounters : [];
  if (canonicalUrl.length > 4096 || encounters.length > MAX_ENCOUNTERS) throw new TypeError('Backup encounter history is too large');
  for (const event of encounters) {
    if (!event || !['saved', 'review', 'encounter', 'restart'].includes(event.type)
      || !Number.isFinite(event.at) || String(event.excerpt || '').length > MAX_EXCERPT_LENGTH) {
      throw new TypeError('Backup contains an invalid encounter');
    }
  }
  if (url.length > 4096 || title.length > 500 || excerpt.length > MAX_EXCERPT_LENGTH || skinId.length > 64) {
    throw new TypeError('备份中的文本字段过长');
  }
  const normalizedUrl = normalizeUrl(canonicalUrl || url);
  const completedAt = Number.isFinite(record.completedAt) ? record.completedAt : now;
  const createdAt = Number.isFinite(record.createdAt) ? record.createdAt : completedAt;
  return {
    title: title || sourceDomain(url),
    excerpt,
    url,
    canonicalUrl: canonicalUrl ? normalizeUrl(canonicalUrl) : '',
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
    encounters,
  };
}

async function importRecords(rawRecords) {
  if (!Array.isArray(rawRecords) || rawRecords.length > 5000) throw new TypeError('请选择有效的一点备份文件');
  const incoming = rawRecords.map((record) => normalizeImportedRecord(record));
  return enqueueRecordsMutation(async () => {
    const current = await getRecords();
    const merged = new Map(current.map((record) => [record.normalizedUrl, record]));
    for (const record of incoming) {
      const existing = merged.get(record.normalizedUrl);
      if (!existing || record.updatedAt >= existing.updatedAt) merged.set(record.normalizedUrl, record);
    }
    const records = consolidateRecords([...merged.values()]).records;
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

async function setNotifyOnDue(value) {
  const settings = { ...(await getSettings()), notifyOnDue: Boolean(value) };
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  if (!settings.notifyOnDue) await chrome.notifications.clear(DUE_NOTIFICATION_ID).catch(() => undefined);
  return { ok: true, settings };
}

export async function handleMessage(message) {
  if (!message || typeof message !== 'object') return { ok: false, error: '无效操作' };
  if (message.type === 'get-pet-state') {
    const [records, settings] = await Promise.all([getRecords(), getSettings()]);
    const normalized = normalizeUrl(message.page.canonicalUrl || message.page.url);
    const currentRecord = records.find((item) => item.normalizedUrl === normalized) ?? null;
    const dueRecord = selectNextDue(records);
    const reviewMode = message.mode === 'review';
    const record = reviewMode ? (dueRecord ?? currentRecord) : currentRecord;
    return {
      ok: true, record, currentRecord, dueRecord,
      isDue: Boolean(reviewMode && dueRecord),
      canEncounter: Boolean(currentRecord && canAddEncounter(currentRecord)),
      settings,
    };
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
  if (message.type === 'restart-journey') return restartJourney(message.normalizedUrl);
  if (message.type === 'remove-record') return removeRecord(message.normalizedUrl);
  if (message.type === 'change-url') return changeUrl(message.normalizedUrl, message.url);
  if (message.type === 'set-reduced-motion') return setReducedMotion(message.value);
  if (message.type === 'get-settings') return { ok: true, settings: await getSettings() };
  if (message.type === 'set-notify-on-due') return setNotifyOnDue(message.value);
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
  chrome.runtime.onInstalled.addListener(async () => {
    await chrome.alarms.clear(LEGACY_REVIEW_ALARM); // 清理 1.0.x 时代的旧闹钟名
    const migration = await migrateStoredRecords();
    await syncDerivedState(migration.records);
  });
  chrome.runtime.onStartup.addListener(async () => {
    const migration = await migrateStoredRecords();
    await syncDerivedState(migration.records);
    await maybeNotifyDue(migration.records).catch(() => undefined);
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REVIEW_ALARM) {
      syncDerivedState()
        .then(() => maybeNotifyDue())
        .catch(console.error);
    }
  });
  chrome.notifications?.onClicked.addListener(() => {
    chrome.tabs.create({ url: chrome.runtime.getURL('library.html') }).catch(() => undefined);
  });
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'local') requestBadgeRefresh();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearTabInjectionError(tabId);
  });
  chrome.action.onClicked.addListener((tab) => {
    handleToolbarClick(tab).catch((error) => console.warn('yidian pet injection failed', error));
  });
  chrome.commands.onCommand.addListener((command, tab) => {
    handleCommand(command, tab).catch((error) => console.warn('yidian shortcut injection failed', error));
  });
}
async function migrateStoredRecords() {
  return enqueueRecordsMutation(async () => {
    const result = consolidateRecords(await getRawRecords());
    if (result.changed) await saveRecords(result.records);
    return result;
  });
}
async function restartJourney(normalizedUrl) {
  return enqueueRecordsMutation(async () => {
    const records = await getRecords();
    const index = records.findIndex((record) => record.normalizedUrl === normalizedUrl);
    if (index < 0) return { ok: false, error: '\u8bb0\u5f55\u4e0d\u5b58\u5728' };
    const record = restartRecord(records[index]);
    const next = records.with(index, record);
    await saveRecords(next);
    await syncDerivedState(next);
    await refreshInjectedPets().catch(() => undefined);
    return { ok: true, record };
  });
}
