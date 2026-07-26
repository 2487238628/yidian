import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../extension/manifest.json', import.meta.url)));

test('工具栏图标直接唤出网页宠物', () => {
  assert.equal('default_popup' in manifest.action, false);
  assert.equal(manifest.version, '0.4.1');
  assert.equal(manifest.action.default_title, '唤出一点宠物');
});

test('网页宠物保持 activeTab 最小授权且只有工具栏入口', () => {
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.ok(manifest.permissions.includes('scripting'));
  assert.deepEqual(Object.keys(manifest.action).sort(), ['default_icon','default_title']);
});
