(() => {
  const ROOT_ID = 'otter-12730-root';
  const existing = document.getElementById(ROOT_ID);
  if (existing) return;

  const root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <div id="otter-12730-pet" data-stage="0" role="button" tabindex="0" aria-label="打开一点">
      <div id="otter-12730-body"><div id="otter-12730-liquid"></div><div id="otter-12730-face"><i id="otter-12730-mouth"></i></div></div>
      <div id="otter-12730-feet"><i></i><i></i></div>
    </div>
    <section id="otter-12730-card" aria-live="polite" hidden></section>
    <div id="otter-12730-toast" role="status"></div>`;
  document.documentElement.append(root);

  const pet = root.querySelector('#otter-12730-pet');
  const card = root.querySelector('#otter-12730-card');
  const toast = root.querySelector('#otter-12730-toast');
  const liquid = root.querySelector('#otter-12730-liquid');
  let state = null;
  let mode = 'current';
  let x = 24;
  let y = Math.max(18, innerHeight - 142);
  let vx = 0.42;
  let dragging = false;
  let moved = false;
  let pointerId = null;
  let pointerOffsetX = 0;
  let pointerOffsetY = 0;
  let dragStartClientX = 0;
  let dragStartClientY = 0;
  let idleUntil = performance.now() + 1400;
  let toastTimer = null;

  function page() {
    const excerpt = String(globalThis.getSelection?.()?.toString() ?? '').trim().slice(0, 1000);
    return { title: document.title || '', url: location.href, ...(excerpt ? { excerpt } : {}) };
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function progress(stage) { return [0,25,50,75,100][stage] ?? 0; }
  function setPosition() {
    const maxX = Math.max(0, innerWidth - pet.offsetWidth);
    const maxY = Math.max(0, innerHeight - pet.offsetHeight);
    x = Math.min(maxX, Math.max(0, x));
    y = Math.min(maxY, Math.max(0, y));
    pet.style.transform = `translate3d(${x}px,${y}px,0) scaleX(${vx < 0 ? -1 : 1})`;
    positionCard();
  }
  function positionCard() {
    if (card.hidden) return;
    const cardWidth = Math.min(310, innerWidth - 24);
    const left = Math.min(innerWidth - cardWidth - 12, Math.max(12, x + pet.offsetWidth / 2 - cardWidth / 2));
    const preferredTop = y - card.offsetHeight - 12;
    const top = preferredTop >= 12 ? preferredTop : Math.min(innerHeight - card.offsetHeight - 12, y + pet.offsetHeight + 8);
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(12, top)}px`;
    toast.style.left = `${Math.min(innerWidth - 272, Math.max(12, x))}px`;
    toast.style.top = `${Math.max(12, y - 48)}px`;
  }
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
    positionCard();
  }
  async function send(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok && response?.error) throw new Error(response.error);
    return response;
  }
  async function load() {
    state = await send({ type:'get-pet-state', page:page(), mode });
    root.classList.toggle('o-reduced', Boolean(state?.settings?.reducedMotion));
    render();
  }
  function render() {
    const record = state?.record ?? null;
    const due = Boolean(state?.isDue);
    const stage = record?.stage ?? 0;
    const excerpt = record?.excerpt || page().excerpt || '';
    pet.dataset.stage = String(stage);
    liquid.style.setProperty('--fill', `${progress(stage)}%`);
    liquid.style.height = `${progress(stage)}%`;
    const domain = location.hostname.replace(/^www\./,'') || '当前页面';
    if (!record) {
      card.innerHTML = `<p class="o-eyebrow">重要的，不只见一次</p><h2 class="o-title">${escapeHtml(document.title || domain)}</h2><p class="o-meta">${escapeHtml(domain)}</p>${excerpt ? `<p class="o-excerpt">“${escapeHtml(excerpt)}”</p>` : ''}<div class="o-progress"><strong>0/4</strong><span>还没有收下</span></div><div class="o-actions"><button class="o-primary" data-action="mark">收下这条 · 第 1 次见面</button><button data-action="motion">${state?.settings?.reducedMotion ? '继续散步' : '安静陪伴'}</button><button data-action="library">我的收藏</button><button class="o-hide" data-action="hide">暂时收起宠物</button></div>`;
    } else {
      const label = stage === 4 ? '已完成 4 次相见' : due ? '今天待回看' : '等待下次回看';
      const next = stage === 4 ? '宠物已经长成。' : due ? '看完后，确认完成这次回看' : `下次回看：${new Date(record.nextReviewAt).toLocaleDateString('zh-CN')}`;
      card.innerHTML = `<p class="o-eyebrow">${label}</p><h2 class="o-title">${escapeHtml(record.title)}</h2><p class="o-meta">${escapeHtml(record.sourceDomain)} · ${escapeHtml(next)}</p>${excerpt ? `<p class="o-excerpt">“${escapeHtml(excerpt)}”</p>` : ''}<div class="o-progress"><strong>${stage}/4</strong><span>相见进度 · 宠物 ${progress(stage)}%</span></div><div class="o-actions">${due ? '<button class="o-primary" data-action="review">完成这次回看</button>' : ''}<button data-action="open">打开原网页</button><button data-action="motion">${state?.settings?.reducedMotion ? '继续散步' : '安静陪伴'}</button><button data-action="library">我的收藏</button><button class="o-hide" data-action="hide">暂时收起宠物</button></div>`;
    }
    positionCard();
  }
  async function act(action) {
    try {
      if (action === 'hide') { root.hidden = true; card.hidden = true; return; }
      if (action === 'mark') {
        const result = await send({ type:'mark-current', tab:page() });
        showToast(result.created ? '已经收下。完成第 1/4 次相见，宠物长到 25%。' : '这页已经收过了。');
      }
      if (action === 'review') {
        const result = await send({ type:'complete-review', normalizedUrl:state.record.normalizedUrl });
        showToast(result.changed ? `完成第 ${result.record.stage}/4 次相见。宠物又长大了一点。` : '现在还没到下一次回看。');
      }
      if (action === 'open') await send({ type:'open-record', url:state.record.url });
      if (action === 'library') await send({ type:'open-library' });
      if (action === 'motion') {
        const wasReduced = Boolean(state?.settings?.reducedMotion);
        await send({ type:'set-reduced-motion', value:!wasReduced });
        showToast(wasReduced ? '宠物继续巡游了。' : '宠物会待在这里。');
      }
      await load();
    } catch (error) { showToast(error.message || '操作失败，请重试'); }
  }

  function toggleCard() {
    card.hidden = !card.hidden;
    positionCard();
  }
  function endDrag(event) {
    if (!dragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    dragging = false;
    pet.classList.remove('dragging');
    if (pet.hasPointerCapture?.(event.pointerId)) pet.releasePointerCapture(event.pointerId);
    pointerId = null;
    idleUntil = performance.now() + 2600;
    setPosition();
    setTimeout(() => { moved = false; }, 0);
  }

  card.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const button = event.target.closest('button[data-action]');
    if (button) act(button.dataset.action);
  });
  pet.addEventListener('click', () => {
    if (!moved) toggleCard();
  });
  pet.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleCard(); }
  });
  pet.addEventListener('dragstart', (event) => event.preventDefault());
  pet.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dragging = true;
    moved = false;
    pointerId = event.pointerId;
    idleUntil = Infinity;
    pointerOffsetX = event.clientX - x;
    pointerOffsetY = event.clientY - y;
    dragStartClientX = event.clientX;
    dragStartClientY = event.clientY;
    card.hidden = true;
    pet.classList.add('dragging');
    pet.setPointerCapture(event.pointerId);
  });
  pet.addEventListener('pointermove', (event) => {
    if (!dragging || event.pointerId !== pointerId) return;
    event.preventDefault();
    const nextX = event.clientX - pointerOffsetX;
    const nextY = event.clientY - pointerOffsetY;
    if (Math.hypot(event.clientX - dragStartClientX, event.clientY - dragStartClientY) >= 5) moved = true;
    x = nextX;
    y = nextY;
    setPosition();
  });
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerdown', (event) => {
    if (!card.hidden && !root.contains(event.target)) card.hidden = true;
  });
  addEventListener('resize', setPosition);
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'show-pet') {
      mode = message.mode === 'review' ? 'review' : 'current';
      root.hidden = false;
      card.hidden = false;
      load().catch(() => {});
    }
    if (message.type === 'refresh-pet') load().catch(() => {});
  });

  function roam(now) {
    const systemReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!dragging && card.hidden && now > idleUntil && !state?.settings?.reducedMotion && !systemReduced) {
      x += vx;
      const maxX = Math.max(0, innerWidth - pet.offsetWidth);
      if (x >= maxX || x <= 0) { vx *= -1; x = Math.min(maxX, Math.max(0, x)); }
      setPosition();
    }
    requestAnimationFrame(roam);
  }
  let lastPageKey = `${location.href}\n${document.title}`;
  setInterval(() => {
    const nextPageKey = `${location.href}\n${document.title}`;
    if (nextPageKey !== lastPageKey) { lastPageKey = nextPageKey; load().catch(() => {}); }
  }, 1000);
  setPosition();
  globalThis.__OTTER_12730_TEST_HOOK__?.({
    root, pet, card, roam,
    snapshot: () => ({ x, y, dragging, moved, pointerId, idleUntil, mode }),
  });
  requestAnimationFrame(roam);
  load().catch((error) => showToast(error.message || '无法读取当前页面'));
})();
