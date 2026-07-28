const recordsRoot = document.querySelector('#records');
const status = document.querySelector('#status');
const template = document.querySelector('#record-template');
const progress = (stage) => [0, 25, 50, 75, 100][stage] ?? 0;

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '操作失败，请重试');
  return response;
}

function stateLabel(record, now = Date.now()) {
  if (record.stage === 4) return '已完成 4 次相见 · 宠物长成';
  if (record.nextReviewAt <= now) return `今天待回看 · 已完成 ${record.stage}/4 次相见`;
  return `等待下次回看 · 已完成 ${record.stage}/4 次相见`;
}

function nextLabel(record) {
  if (record.stage === 4) return '四次相见已经完成';
  return `下次回看：${new Date(record.nextReviewAt).toLocaleDateString('zh-CN')}`;
}

function render(records) {
  const now = Date.now();
  document.querySelector('#total').textContent = records.length;
  document.querySelector('#due').textContent = records.filter((item) => item.stage < 4 && item.nextReviewAt <= now).length;
  document.querySelector('#complete').textContent = records.filter((item) => item.stage === 4).length;
  recordsRoot.replaceChildren();
  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = '还没有收藏。去任意普通网页点击“一点”图标，再点“收下这条”。';
    recordsRoot.append(empty);
    return;
  }
  for (const record of records) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.url = record.normalizedUrl;
    node.querySelector('.record-state').textContent = stateLabel(record, now);
    node.querySelector('h2').textContent = record.title;
    node.querySelector('.record-meta').textContent = `${record.sourceDomain} · ${nextLabel(record)}`;
    const excerpt = node.querySelector('.record-excerpt');
    if (record.excerpt) { excerpt.textContent = `“${record.excerpt}”`; excerpt.hidden = false; }
    node.querySelector('.progress span').style.width = `${progress(record.stage)}%`;
    node.querySelector('.progress').setAttribute('aria-label', `已完成 ${record.stage}/4 次相见，宠物成长 ${progress(record.stage)}%`);
    node.querySelector('.open').addEventListener('click', () => send({ type:'open-record', url:record.url }).catch(showError));
    node.querySelector('.delete').addEventListener('click', async () => {
      if (!confirm(`删除“${record.title}”的本地记录？`)) return;
      try { await send({ type:'remove-record', normalizedUrl:record.normalizedUrl }); await load('记录已删除'); }
      catch (error) { showError(error); }
    });
    recordsRoot.append(node);
  }
}

function showError(error) { status.textContent = error.message || '操作失败，请重试'; }

async function load(message = '') {
  const response = await send({ type:'list-records' });
  render(response.records);
  status.textContent = message;
}

document.querySelector('#export').addEventListener('click', async () => {
  try {
    const { records } = await send({ type:'list-records' });
    const blob = new Blob([JSON.stringify({ version:1, exportedAt:new Date().toISOString(), records }, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yidian-backup-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    status.textContent = `已导出 ${records.length} 份记录`;
  } catch (error) { showError(error); }
});

document.querySelector('#import').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 5_000_000) {
    showError(new Error('备份文件不能超过 5 MB'));
    event.target.value = '';
    return;
  }
  try {
    const payload = JSON.parse(await file.text());
    const result = await send({ type:'import-records', records:payload.records ?? payload });
    await load(`已合并 ${result.imported} 份记录`);
  } catch (error) { showError(error); }
  event.target.value = '';
});

load().catch(showError);
