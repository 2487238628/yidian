import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const studio = new URL('../studio/', import.meta.url);
const read = (file) => readFile(new URL(file, studio), 'utf8');

test('ModelScope Static 创空间入口与卡片配置完整', async () => {
  const [readme, html] = await Promise.all([read('README.md'), read('index.html')]);
  const frontMatter = readme.replaceAll('\r\n', '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(frontMatter, /^sdk: static$/m);
  assert.match(frontMatter, /^entry_file: index\.html$/m);
  assert.match(frontMatter, /^license: MIT License$/m);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>一点 · 重要的，不只见一次<\/title>/);
  assert.match(html, /12730-extension-unpacked\.zip/);
  assert.match(html, /不读取未选择的正文，不上传记录，不要求登录/);
  await Promise.all(['index.html','styles.css','app.js','icon.png','12730-extension-unpacked.zip'].map((file) => access(new URL(file, studio))));
});

test('创空间互动演示含四阶段成长和真实指针拖动', async () => {
  const script = await read('app.js');
  assert.match(script, /percent:25/);
  assert.match(script, /percent:50/);
  assert.match(script, /percent:75/);
  assert.match(script, /percent:100/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointermove/);
  assert.match(script, /setPointerCapture/);
});

test('创空间不依赖远程脚本、字体或追踪器', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
  assert.doesNotMatch(html, /analytics|segment|sentry|gtag/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
