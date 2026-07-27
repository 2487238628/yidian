import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const repo = new URL('../', import.meta.url);
const studio = new URL('../studio/', import.meta.url);
const read = (file) => readFile(new URL(file, studio), 'utf8');

test('ModelScope Static 创空间入口与卡片配置完整', async () => {
  const [readme, html] = await Promise.all([read('README.md'), read('index.html')]);
  const frontMatter = readme.replaceAll('\r\n', '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  assert.match(frontMatter, /^sdk: static$/m);
  assert.match(frontMatter, /^entry_file: index\.html$/m);
  assert.match(frontMatter, /^license: MIT License$/m);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /<title>一点｜工作与学习的收藏回看工具<\/title>/);
  assert.match(html, /<p class="kicker">工作与学习的收藏回看工具<\/p>/);
  assert.match(html, /重要的，<br><em>不只见一次。<\/em>/);
  assert.match(html, /yidian-1\.0\.0\.zip/);
  assert.match(html, /不读取未选择的正文，不上传记录，不要求登录/);
  assert.match(html, /id="features"/);
  assert.match(html, /我的收藏/);
  assert.match(html, /导入 \/ 导出备份/);
  assert.match(html, /收下整页或选段/);
  assert.match(html, /收藏集中管理/);
  assert.match(html, /查看源码 · 在 GitHub 支持一点/);
  assert.match(html, /Chrome 和 Edge 电脑浏览器/);
  assert.match(html, /href="contact\.html"/);
  assert.doesNotMatch(html, /Codex|艺术与文化管理研究者|任何浏览器/);
  await Promise.all(['index.html','contact.html','changelog.html','styles.css','app.js','icon.png','yidian-1.0.0.zip'].map((file) => access(new URL(file, studio))));
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

test('作者与联系页区分反馈、社群和作者入口', async () => {
  const html = await read('contact.html');
  assert.match(html, /<title>作者与联系 · 一点<\/title>/);
  assert.match(html, /id="feedback"/);
  assert.match(html, /id="community"/);
  assert.match(html, /终树 endTree/);
  assert.match(html, /github\.com\/2487238628/);
  assert.match(html, /docs\.qq\.com\/form\/page\/DZE9LR0hwVkRyemZn/);
  assert.match(html, /写下你在意的这一点/);
  assert.match(html, /有了去向，我会在更新记录里带回来/);
  assert.match(html, /xiaohongshu-endtree\.jpg/);
  assert.match(html, /1052658250/);
  assert.match(html, /群入口待开放/);
  await access(new URL('xiaohongshu-endtree.jpg', studio));
});
test('GitHub 反馈入口区分使用问题和功能建议', async () => {
  const [problem, idea, config] = await Promise.all([
    readFile(new URL('.github/ISSUE_TEMPLATE/problem.yml', repo), 'utf8'),
    readFile(new URL('.github/ISSUE_TEMPLATE/idea.yml', repo), 'utf8'),
    readFile(new URL('.github/ISSUE_TEMPLATE/config.yml', repo), 'utf8'),
  ]);
  assert.match(problem, /name: 使用问题/);
  assert.match(idea, /name: 功能建议/);
  assert.match(config, /blank_issues_enabled: false/);
});

test('更新记录页公开当前版本和反馈去向', async () => {
  const html = await read('changelog.html');
  assert.match(html, /<title>更新记录 · 一点<\/title>/);
  assert.match(html, /1\.0\.0 · 第一版/);
  assert.match(html, /1、2、7、30 天/);
  assert.match(html, /contact\.html#feedback/);
});


test('创空间不依赖远程脚本、字体或追踪器', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
  assert.doesNotMatch(html, /analytics|segment|sentry|gtag/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
