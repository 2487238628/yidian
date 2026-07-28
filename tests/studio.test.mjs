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
  assert.match(html, /<a class="primary" href="#demo">看看怎么用<\/a>/);
  assert.doesNotMatch(html, /<a[^>]+href="#demo"[^>]*>收下一条<\/a>/);
  assert.match(html, /yidian-1\.0\.0\.zip/);
  assert.match(html, /不读取未选择的正文，不上传记录，不要求登录/);
  assert.match(html, /id="features"/);
  assert.match(html, /我的收藏/);
  assert.match(html, /查看日期与进度 · 打开原网页 · 删除 · 本地备份/);
  assert.match(html, /点击图标，收下一条/);
  assert.match(html, /出现数字，完成回看/);
  assert.match(html, /class="quiet-reminder"/);
  assert.match(html, /<img src="icon\.png" alt=""><i>1<\/i>/);
  assert.match(html, /到期时，图标旁出现数字。/);
  assert.match(html, /数字表示待回看的收藏数量。不弹窗，不催促；你点开时，一次带回一条。/);
  assert.match(html, /class="github-invite"[^>]*>[\s\S]*让一点继续长大[\s\S]*去点亮 Star ↗/);
  assert.match(html, /先把一点<br>放进浏览器。/);
  assert.match(html, /下载一点/);
  assert.match(html, /class="privacy-link" href="privacy\.html">查看完整隐私政策 →<\/a>/);
  assert.match(html, /Chrome、Edge 电脑版/);
  assert.match(html, /href="contact\.html"/);
  assert.doesNotMatch(html, /Codex|艺术与文化管理研究者|任何浏览器/);
  await Promise.all(['index.html','contact.html','changelog.html','privacy.html','styles.css','app.js','icon.png','yidian-1.0.0.zip'].map((file) => access(new URL(file, studio))));
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

test('反馈与联系页只保留受众需要的反馈、关注和作者入口', async () => {
  const html = await read('contact.html');
  assert.match(html, /<title>反馈与联系 · 一点<\/title>/);
  assert.match(html, /id="feedback"/);
  assert.match(html, /我是终树/);
  assert.match(html, /github\.com\/2487238628/);
  assert.match(html, /docs\.qq\.com\/form\/page\/DZE9LR0hwVkRyemZn/);
  assert.match(html, /写下反馈/);
  assert.match(html, /需要登录腾讯文档/);
  assert.match(html, /xiaohongshu-endtree\.jpg/);
  assert.match(html, /1052658250/);
  assert.match(html, /在小红书找到一点/);
  assert.match(html, /id="social"/);
  assert.doesNotMatch(html, /暂不建群|不同时维护微信群和飞书群|等出现一批|第一版不为|已开放|已公开/);
  await access(new URL('xiaohongshu-endtree.jpg', studio));
});
test('我的收藏用状态、动作和结果解释回看流程', async () => {
  const [html, script] = await Promise.all([
    readFile(new URL('extension/library.html', repo), 'utf8'),
    readFile(new URL('extension/library.js', repo), 'utf8'),
  ]);
  assert.match(html, /点击浏览器工具栏里的“一点”完成回看/);
  assert.match(html, /今天待回看/);
  assert.match(html, /已完成 4 次相见/);
  assert.match(html, /打开原网页/);
  assert.match(script, /已完成 \$\{record\.stage\}\/4 次/);
  assert.doesNotMatch(`${html}\n${script}`, /今天可回来|已经长成 · 100%|收下一条就已经完成 25%/);
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
  assert.match(html, /2026-07-28/);
  assert.match(html, /第 1 天收下，第 2、7、30 天/);
  assert.match(html, /不弹窗，也不强制打扰/);
  assert.match(html, /contact\.html#feedback/);
});


test('隐私页准确说明本地数据和最小权限边界', async () => {
  const html = await read('privacy.html');
  assert.match(html, /<title>隐私政策 · 一点<\/title>/);
  assert.match(html, /留在你的浏览器里/);
  assert.match(html, /不把收藏记录上传到服务器/);
  assert.match(html, /未选中的网页正文不会被保存/);
  assert.match(html, /读取当前标签页/);
  assert.match(html, /闹钟/);
  assert.match(html, /本地存储/);
  assert.match(html, /contact\.html#feedback/);
  assert.doesNotMatch(html, /云同步已经|自动收集|第三方分析/);
});

test('创空间不依赖远程脚本、字体或追踪器', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
  assert.doesNotMatch(html, /analytics|segment|sentry|gtag/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/);
});
