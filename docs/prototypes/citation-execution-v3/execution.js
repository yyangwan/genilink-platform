const $ = id => document.getElementById(id);
const labels = { in_progress: '执行中', delivered: '待验收', accepted: '已验收', cancelled: '已取消' };
let state = 'in_progress', mode = 'assign', delivery = null;
let currentOwner = '林悦 · 内容负责人', currentDue = '2026-10-30 18:00';
const archived = { title: '旧版实施说明（修订 2 归档）', url: 'https://example.com/archive/implementation-v2',
  notes: '历史交付已验收，仅属于修订 2，当前修订需要单独交付。', kind: '外部交付地址 · 历史人工登记' };
function redraw() {
  const historical = $('revision').value === '2', value = historical ? 'accepted' : state;
  $('planBadge').textContent = historical ? '历史计划批准' : '计划批准有效';
  $('revisionLabel').textContent = historical ? '修订 2 · 历史记录' : '修订 3 · 本修订单独执行';
  $('historyNotice').hidden = !historical; $('controls').hidden = historical;
  $('stateBadge').textContent = labels[value];
  for (const [id, status] of [['s2','in_progress'], ['s3','delivered'], ['s4','accepted']]) $(id).classList.toggle('active', value === status);
  $('deliver').hidden = value !== 'in_progress'; $('review').hidden = value !== 'delivered';
  $('cancel').hidden = ['accepted','cancelled'].includes(value); $('assign').disabled = ['accepted','cancelled'].includes(value);
  $('ownerLabel').textContent = historical ? '陈宁 · 产品负责人' : currentOwner;
  $('dueLabel').textContent = historical ? '2026-10-25 18:00' : currentDue;
  const shown = historical ? archived : delivery;
  $('deliveryPanel').hidden = !shown;
  document.querySelector('#deliveryPanel .head .tag').textContent = historical ? '历史交付已验收' : {delivered:'等待具名验收',accepted:'本次交付已验收',in_progress:'需修改后重新提交',cancelled:'执行已取消，保留原交付'}[state];
  if (shown) {
    $('artifactTitle').textContent = shown.title; $('artifactUrl').textContent = shown.url;
    $('deliveryNotes').textContent = shown.notes; document.querySelector('.artifact .tag').textContent = shown.kind;
  }
  document.querySelector('#deliveryPanel small').textContent = historical ? '属于修订 2 · 历史记录只读，不能自动用于当前任务。' : '属于修订 3 · 交付仍需审核，登记地址不会自动抓取或发布。';
  $('timeline').hidden = historical;
  let archive = $('archiveTimeline');
  if (!archive) {
    archive = document.createElement('ol'); archive.id = 'archiveTimeline'; archive.className = 'timeline';
    archive.innerHTML = '<li><b>历史交付已验收</b><span>品牌负责人 · 修订 2 · 2026-10-25 16:30</span><p>按修订 2 原标准验收，旧材料与原批准一起保留。</p></li>';
    $('timeline').after(archive);
  }
  archive.hidden = !historical;
}
function artifactFields() {
  const service = [1,2].includes($('artifactKind').selectedIndex);
  $('urlField').hidden = service; $('referenceField').hidden = !service;
  $('url').required = $('artifactKind').selectedIndex === 0; $('reference').required = service;
}
function open(kind) {
  mode = kind;
  $('assignment').hidden = kind !== 'assign'; $('delivery').hidden = kind !== 'deliver'; $('acceptance').hidden = kind !== 'review';
  $('return').hidden = kind !== 'review'; $('reason').value = '';
  document.querySelectorAll('.criterionCheck').forEach(input => input.checked = false);
  $('dialogTitle').textContent = {assign:'安排负责人和截止时间',deliver:'提交本修订的交付',review:'按原标准验收交付',cancel:'取消本修订的执行'}[kind];
  $('save').textContent = {assign:'保存安排',deliver:'提交交付，等待验收',review:'确认验收通过',cancel:'确认取消执行'}[kind];
  if (kind === 'deliver') artifactFields();
  $('editor').showModal(); document.body.style.overflow = 'hidden'; validate();
}
function close() { $('editor').close(); document.body.style.overflow = ''; }
function validate() {
  $('save').disabled = $('reason').value.trim().length < 5 || mode === 'review' && [...document.querySelectorAll('.criterionCheck')].some(input => !input.checked);
  $('return').disabled = $('reason').value.trim().length < 5;
}
function record(title) {
  const li = document.createElement('li'), b = document.createElement('b'), span = document.createElement('span'), p = document.createElement('p');
  b.textContent = title; span.textContent = '当前操作人 · 修订 3 · 刚刚'; p.textContent = $('reason').value;
  li.append(b,span,p); $('timeline').prepend(li); close(); redraw();
  $('message').textContent = '原型演示：操作已记录。任务与交付仍属于各自的原修订。';
}
for (const [id, kind] of [['assign','assign'],['deliver','deliver'],['review','review'],['cancel','cancel']]) $(id).onclick = () => open(kind);
$('close').onclick = close; $('editor').oncancel = event => { event.preventDefault(); close(); };
$('revision').onchange = redraw; $('reason').oninput = validate; $('artifactKind').onchange = artifactFields;
document.querySelectorAll('.criterionCheck').forEach(input => input.onchange = validate);
$('return').onclick = () => { state = 'in_progress'; record('交付退回修改'); };
$('form').onsubmit = event => {
  event.preventDefault(); if ($('save').disabled) return;
  if (mode === 'assign') {
    currentOwner = $('owner').value || '待安排'; currentDue = $('due').value.replace('T',' ') || '未设置'; record('调整负责人和截止时间');
  } else if (mode === 'deliver') {
    if ($('title').value.trim().length < 5) return;
    state = 'delivered'; delivery = {title:$('title').value, url:[1,2].includes($('artifactKind').selectedIndex) ? 'ContentOS 任务：' + $('reference').value : $('url').value,
      notes:$('reason').value, kind:$('artifactKind').value}; record('提交交付');
  } else if (mode === 'review') { state = 'accepted'; record('具名验收通过'); }
  else { state = 'cancelled'; record('取消执行'); }
};
redraw();
