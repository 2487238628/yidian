const stages = [
  { percent:0, progress:'进度 0/4', eyebrow:'第 1 步 · 收下当前内容', copy:'流程还没开始', button:'收下这条' },
  { percent:25, progress:'进度 1/4', eyebrow:'第 1 步完成 · 内容已收下', copy:'下一步：满 24 小时后，进行第 1 次回看', button:'模拟第 2 天' },
  { percent:50, progress:'进度 2/4', eyebrow:'第 2 步完成 · 第 1 次回看', copy:'下一步：第 7 天，再回看一次', button:'模拟第 7 天' },
  { percent:75, progress:'进度 3/4', eyebrow:'第 3 步完成 · 第 2 次回看', copy:'下一步：第 30 天，完成最后一次回看', button:'模拟第 30 天' },
  { percent:100, progress:'进度 4/4', eyebrow:'第 4 步完成 · 第 3 次回看', copy:'全部完成，宠物长成', button:'重新体验' },
];

const pet = document.querySelector('#demo-pet');
const lane = document.querySelector('#pet-stage');
const liquid = document.querySelector('#liquid');
const advance = document.querySelector('#advance');
let stage = 0;
let dragging = false;
let offset = 0;

function render() {
  const current = stages[stage];
  liquid.style.setProperty('--fill', `${current.percent}%`);
  document.querySelector('#percent').textContent = current.progress;
  document.querySelector('#demo-eyebrow').textContent = current.eyebrow;
  document.querySelector('#progress-copy').textContent = current.copy;
  advance.textContent = current.button;
  pet.setAttribute('aria-label', `可拖动的一点宠物，宠物成长 ${current.percent}%`);
  document.querySelectorAll('.rhythm li').forEach((item) => item.classList.toggle('done', Number(item.dataset.step) <= stage));
}

advance.addEventListener('click', () => { stage = stage === 4 ? 0 : stage + 1; render(); });
document.querySelector('#reset').addEventListener('click', () => { stage = 0; pet.classList.remove('manual'); pet.style.removeProperty('left'); render(); });

pet.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  dragging = true;
  pet.classList.add('dragging', 'manual');
  const petRect = pet.getBoundingClientRect();
  offset = event.clientX - petRect.left;
  pet.style.left = `${petRect.left - lane.getBoundingClientRect().left}px`;
  pet.setPointerCapture(event.pointerId);
});
pet.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  event.preventDefault();
  const max = lane.clientWidth - pet.offsetWidth;
  pet.style.left = `${Math.max(0, Math.min(max, event.clientX - lane.getBoundingClientRect().left - offset))}px`;
});
function endDrag(event) {
  if (!dragging) return;
  dragging = false;
  pet.classList.remove('dragging');
  if (pet.hasPointerCapture(event.pointerId)) pet.releasePointerCapture(event.pointerId);
}
pet.addEventListener('pointerup', endDrag);
pet.addEventListener('pointercancel', endDrag);
pet.addEventListener('dragstart', (event) => event.preventDefault());
render();
