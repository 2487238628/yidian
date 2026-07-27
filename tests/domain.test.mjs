import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS, advanceRecord, createRecord, normalizeUrl, selectNextDue,
  upsertByNormalizedUrl, updateRecordUrl
} from '../extension/domain.mjs';

const T0 = Date.UTC(2026, 6, 1, 8);

function marked(overrides = {}) {
  return { ...createRecord({ title: '文档', url: 'https://example.com/doc?q=1#part', now: T0 }), ...overrides };
}

test('Mark 立即得到 25%，一天后到期', () => {
  const record = marked();
  assert.equal(record.stage, 1);
  assert.equal(record.nextReviewAt, T0 + DAY_MS);
});

test('Mark 保存选中文本并限制收藏上下文长度', () => {
  const record = createRecord({
    title: '文档', url: 'https://example.com/doc', excerpt: `  ${'x'.repeat(1_001)}  `, now: T0,
  });
  assert.equal(record.excerpt.length, 1_000);
  assert.equal(record.excerpt, 'x'.repeat(1_000));
});

test('正常 1/2/7/30 节奏对应 25/50/75/100', () => {
  let record = marked();
  const day2 = T0 + DAY_MS;
  record = advanceRecord(record, day2).record;
  assert.equal(record.stage, 2);
  assert.equal(record.nextReviewAt, T0 + 6 * DAY_MS);
  record = advanceRecord(record, T0 + 6 * DAY_MS).record;
  assert.equal(record.stage, 3);
  assert.equal(record.nextReviewAt, T0 + 29 * DAY_MS);
  record = advanceRecord(record, T0 + 29 * DAY_MS).record;
  assert.equal(record.stage, 4);
  assert.equal(record.nextReviewAt, null);
});

test('延迟完成从实际完成时间重新排期', () => {
  const late = T0 + 4 * DAY_MS;
  const stage2 = advanceRecord(marked(), late).record;
  assert.equal(stage2.nextReviewAt, late + 5 * DAY_MS);
});

test('未到期和快速重复点击都不会重复推进', () => {
  const first = advanceRecord(marked(), T0 + DAY_MS);
  assert.equal(first.changed, true);
  const duplicate = advanceRecord(first.record, T0 + DAY_MS);
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.record.stage, 2);
});

test('100% 后终止自动提醒', () => {
  const complete = { ...marked(), stage: 4, nextReviewAt: null };
  const result = advanceRecord(complete, T0 + 99 * DAY_MS);
  assert.equal(result.changed, false);
  assert.equal(result.reason, 'complete');
  assert.equal(result.record.nextReviewAt, null);
});

test('URL 去重只移除 fragment，保留 query', () => {
  assert.equal(normalizeUrl('https://example.com/doc?q=1#x'), 'https://example.com/doc?q=1');
  assert.notEqual(normalizeUrl('https://example.com/doc?q=1'), normalizeUrl('https://example.com/doc?q=2'));
  const original = marked();
  const duplicate = createRecord({ title: '同一页', url: 'https://example.com/doc?q=1#other', now: T0 + 1 });
  const result = upsertByNormalizedUrl([original], duplicate);
  assert.equal(result.created, false);
  assert.equal(result.records.length, 1);
});

test('到期选择按 nextReviewAt、createdAt 排序且只返回一份', () => {
  const a = marked({ normalizedUrl: 'https://a.test/', nextReviewAt: T0, createdAt: T0 + 2 });
  const b = marked({ normalizedUrl: 'https://b.test/', nextReviewAt: T0 - 1, createdAt: T0 + 9 });
  const c = marked({ normalizedUrl: 'https://c.test/', nextReviewAt: T0, createdAt: T0 + 1 });
  assert.equal(selectNextDue([a, b, c], T0).normalizedUrl, b.normalizedUrl);
  assert.equal(selectNextDue([a, c], T0).normalizedUrl, c.normalizedUrl);
});

test('失效链接可修改且保留进度', () => {
  const updated = updateRecordUrl(marked({ stage: 3 }), 'https://new.example.com/doc#top', T0 + 10);
  assert.equal(updated.stage, 3);
  assert.equal(updated.normalizedUrl, 'https://new.example.com/doc');
});

test('仅接受 http 和 https URL', () => {
  assert.equal(normalizeUrl('http://example.com/a#b'), 'http://example.com/a');
  assert.equal(normalizeUrl('https://example.com/a#b'), 'https://example.com/a');
  for (const url of ['javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/x']) {
    assert.throws(() => normalizeUrl(url), /仅支持 http:\/\/ 或 https:\/\//);
    assert.throws(() => createRecord({ title: '危险链接', url, now: T0 }), /仅支持 http:\/\/ 或 https:\/\//);
  }
});
