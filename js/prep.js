/**
 * prep.js - 备课文档库模块
 * 子模块：📁 文档库(PDF/Word导入导出) | 📝 便利贴(要点备忘) | ✍️ 手写备课(平板)
 * 文档/手写图存 IndexedDB（本机）；便利贴存 localStorage（可云同步）
 */

// ---------- IndexedDB 封装 ----------
const DocDB = {
  db: null,
  _open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('teaching_workbench_docs', 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('handwriting')) db.createObjectStore('handwriting', { keyPath: 'id' });
      };
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  _tx(store, mode) { return this._open().then(db => db.transaction(store, mode).objectStore(store)); },
  put(store, val) {
    return this._tx(store, 'readwrite').then(os => new Promise((res, rej) => {
      const r = os.put(val); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    }));
  },
  getAll(store) {
    return this._tx(store, 'readonly').then(os => new Promise((res, rej) => {
      const r = os.getAll(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
    }));
  },
  get(store, id) {
    return this._tx(store, 'readonly').then(os => new Promise((res, rej) => {
      const r = os.get(id); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    }));
  },
  del(store, id) {
    return this._tx(store, 'readwrite').then(os => new Promise((res, rej) => {
      const r = os.delete(id); r.onsuccess = () => res(); r.onerror = () => rej(r.error);
    }));
  },
};

// ---------- 便利贴（localStorage，可云同步）----------
const STICKY_KEY = 'teaching_workbench_stickies';
const STICKY_COLORS = ['#FFF3B0', '#FFD6A5', '#CAFFBF', '#A0C4FF', '#BDB2FF', '#FFC6FF', '#FFADAD'];
function getStickies() {
  try { return JSON.parse(localStorage.getItem(STICKY_KEY) || '[]'); } catch (e) { return []; }
}
function saveStickies(list) {
  localStorage.setItem(STICKY_KEY, JSON.stringify(list));
  if (window.Sync && Sync.isLoggedIn()) Sync.scheduleSync();
}

// ---------- 模块外壳 ----------
Modules.lessonPrep = function () {
  App.prepTab = App.prepTab || 'docs';
  return `
    <div class="module-header">
      <div>
        <div class="module-title">备课文档库</div>
        <div class="module-subtitle">导入 PDF/Word 文档 · 便利贴要点备忘 · 平板手写备课</div>
      </div>
    </div>
    <div class="prep-tabs">
      <button class="prep-tab ${App.prepTab === 'docs' ? 'active' : ''}" onclick="switchPrepTab('docs')">📁 文档库</button>
      <button class="prep-tab ${App.prepTab === 'stickies' ? 'active' : ''}" onclick="switchPrepTab('stickies')">📝 便利贴</button>
      <button class="prep-tab ${App.prepTab === 'handwriting' ? 'active' : ''}" onclick="switchPrepTab('handwriting')">✍️ 手写备课</button>
    </div>
    <div id="prepTabContent"></div>
  `;
};

Modules.lessonPrep.init = function () {
  loadPrepTab();
};

function switchPrepTab(tab) {
  App.prepTab = tab;
  document.querySelectorAll('.prep-tab').forEach(b => b.classList.toggle('active', b.textContent.includes(
    tab === 'docs' ? '文档库' : tab === 'stickies' ? '便利贴' : '手写'
  )));
  loadPrepTab();
}

function loadPrepTab() {
  const box = document.getElementById('prepTabContent');
  if (!box) return;
  if (App.prepTab === 'docs') renderDocsTab(box);
  else if (App.prepTab === 'stickies') renderStickiesTab(box);
  else renderHandwritingTab(box);
}

// ==================== 文档库 ====================
function fmtSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
function fileType(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'doc' || ext === 'docx') return 'word';
  return 'other';
}

// ---------- 分类辅助（按学生 + 上课时间）----------
const WEEK_DAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
function getStudentsList() {
  try { return (DB.get('students', { list: [] }).list || []); } catch (e) { return []; }
}
// 取某学生的上课时段（来自排课），用于分类下拉
function getStudentClassSlots(studentName) {
  const schedule = (DB.get('schedule', { list: [] }).list) || [];
  return schedule
    .filter(s => s.studentName === studentName)
    .map(s => {
      const day = WEEK_DAYS[s.dayOfWeek] || ('周' + s.dayOfWeek);
      const label = `${day} ${s.startTime || ''}-${s.endTime || ''}` + (s.subject ? ` · ${s.subject}` : '');
      return { label, value: `${s.dayOfWeek}_${s.startTime}_${s.endTime}` };
    });
}
// 取文档中已存在的上课时间标签（用于筛选，避免排课变更后筛不到）
function getDocClassTimeTags(student) {
  return DocDB.getAll('documents').then(list => {
    const set = new Set();
    list.forEach(d => {
      if (d.classTime && (!student || !d.student || d.student === student)) set.add(d.classTime);
    });
    return Array.from(set);
  });
}
// 通用：根据学生下拉联动填充时间下拉
function populateTimeSelect(studentSelId, timeSelId, selectedTime) {
  const student = document.getElementById(studentSelId);
  const timeSel = document.getElementById(timeSelId);
  if (!student || !timeSel) return;
  const studentName = student.value || '';
  const slots = studentName ? getStudentClassSlots(studentName) : [];
  timeSel.innerHTML = '<option value="">— 不关联时间 —</option>' +
    slots.map(s => `<option value="${esc(s.label)}">${esc(s.label)}</option>`).join('');
  if (selectedTime !== undefined) timeSel.value = selectedTime;
}

function renderDocsTab(box) {
  App.docFilterStudent = App.docFilterStudent || 'all';
  App.docFilterTime = App.docFilterTime || 'all';
  const students = getStudentsList();
  const studentOpts = '<option value="all">全部学生</option>' +
    students.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  box.innerHTML = `
    <div class="flex gap-2 flex-wrap mb-3" style="align-items:center">
      <label class="btn btn-primary" style="cursor:pointer">
        📥 导入文档（PDF / Word）
        <input type="file" id="docImport" accept=".pdf,.doc,.docx" multiple hidden>
      </label>
      <span class="text-xs text-light">支持多选；文档存于本机，可随时导出下载</span>
    </div>
    <div class="doc-filters mb-3">
      <span class="text-sm text-light">分类筛选：</span>
      <select class="input input-sm" id="docFilterStudent">${studentOpts}</select>
      <select class="input input-sm" id="docFilterTime"><option value="all">全部时间</option></select>
      <button class="btn btn-sm btn-ghost" onclick="resetDocFilters()">重置</button>
      <span class="text-xs text-light">文档按「学生 + 上课时间」分类，导入或点卡片「归类」设置</span>
    </div>
    <div id="docList" class="item-grid"></div>
  `;
  document.getElementById('docFilterStudent').value = App.docFilterStudent;
  document.getElementById('docFilterTime').value = App.docFilterTime;
  document.getElementById('docImport').addEventListener('change', e => openImportTagsModal(e.target.files));
  document.getElementById('docFilterStudent').addEventListener('change', e => {
    App.docFilterStudent = e.target.value;
    App.docFilterTime = 'all';
    document.getElementById('docFilterTime').value = 'all';
    refreshDocFiltersAndList();
  });
  document.getElementById('docFilterTime').addEventListener('change', e => {
    App.docFilterTime = e.target.value;
    refreshDocFiltersAndList();
  });
  refreshDocFiltersAndList();
}

// 刷新筛选器选项 + 文档列表
async function refreshDocFiltersAndList() {
  const students = getStudentsList();
  const student = App.docFilterStudent && App.docFilterStudent !== 'all' ? App.docFilterStudent : '';
  const sSel = document.getElementById('docFilterStudent');
  const tSel = document.getElementById('docFilterTime');
  if (sSel) {
    sSel.innerHTML = '<option value="all">全部学生</option>' +
      students.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
    sSel.value = App.docFilterStudent;
  }
  // 时间选项：排课时段 + 文档已有标签（取并集，保证能筛到）
  const scheduleSlots = student ? getStudentClassSlots(student).map(s => s.label) : [];
  const tagTimes = await getDocClassTimeTags(student);
  const timeSet = new Set([...scheduleSlots, ...tagTimes]);
  if (tSel) {
    tSel.innerHTML = '<option value="all">全部时间</option>' +
      Array.from(timeSet).map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    tSel.value = App.docFilterTime;
  }
  // 列表
  const el = document.getElementById('docList');
  if (!el) return;
  DocDB.getAll('documents').then(list => {
    list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    const filtered = list.filter(d => {
      if (student && d.student !== student) return false;
      if (App.docFilterTime && App.docFilterTime !== 'all' && d.classTime !== App.docFilterTime) return false;
      return true;
    });
    if (list.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">还没有文档，点击上方导入 PDF / Word</div></div>`;
      return;
    }
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-text">当前筛选条件下没有文档</div></div>`;
      return;
    }
    el.innerHTML = filtered.map(d => {
      const t = d.type;
      const icon = t === 'pdf' ? '📕' : t === 'word' ? '📘' : '📄';
      const stuColor = d.student ? getStudentColor(d.student) : '';
      const tags = (d.student || d.classTime) ? `
        <div class="doc-card-tags">
          ${d.student ? `<span class="doc-badge" style="${stuColor ? 'background:' + stuColor + '33;border-color:' + stuColor + ';' : ''}">👤 ${esc(d.student)}</span>` : ''}
          ${d.classTime ? `<span class="doc-badge doc-badge-time">🕒 ${esc(d.classTime)}</span>` : ''}
        </div>` : '';
      return `
        <div class="doc-card">
          <div class="doc-card-icon">${icon}</div>
          <div class="doc-card-body">
            <div class="doc-card-name" title="${esc(d.name)}">${esc(d.name)}</div>
            <div class="doc-card-meta">${esc((t === 'pdf' ? 'PDF' : t === 'word' ? 'Word' : '文档'))} · ${fmtSize(d.size)} · ${DB.formatDate(d.addedAt ? new Date(d.addedAt) : new Date(), 'YYYY-MM-DD')}</div>
            ${tags}
            <div class="flex gap-2 flex-wrap mt-2">
              ${t === 'pdf' ? `<button class="btn btn-xs btn-secondary" onclick="previewDoc('${d.id}')">👁 预览</button>` : ''}
              <button class="btn btn-xs btn-primary" onclick="exportDoc('${d.id}')">⬇️ 导出</button>
              <button class="btn btn-xs btn-secondary" onclick="tagDoc('${d.id}')">🏷 归类</button>
              <button class="btn btn-xs btn-danger" onclick="deleteDoc('${d.id}')">🗑 删除</button>
            </div>
          </div>
        </div>`;
    }).join('');
  }).catch(() => {
    el.innerHTML = `<div class="text-sm text-danger">文档库打开失败（浏览器可能不支持本地存储）</div>`;
  });
}

function resetDocFilters() {
  App.docFilterStudent = 'all';
  App.docFilterTime = 'all';
  refreshDocFiltersAndList();
}

// ---------- 导入并分类 ----------
let pendingImportFiles = [];
function openImportTagsModal(fileList) {
  pendingImportFiles = Array.from(fileList || []);
  if (pendingImportFiles.length === 0) return;
  const students = getStudentsList();
  const studentOpts = '<option value="">— 不关联学生 —</option>' +
    students.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('');
  const body = `
    <div class="form-row">
      <label class="form-label">关联学生</label>
      <select class="input" id="impStudent">${studentOpts}</select>
    </div>
    <div class="form-row">
      <label class="form-label">关联上课时间</label>
      <select class="input" id="impTime"><option value="">— 不关联时间 —</option></select>
      <div class="text-xs text-light mt-1">选择学生后，可从其排课时段中选择；也可留空稍后在卡片「归类」</div>
    </div>
    <div class="text-xs text-light">将为选中的 ${pendingImportFiles.length} 个文档统一设置分类</div>
  `;
  Modal.show(`导入并分类（${pendingImportFiles.length} 个）`, body, `
    <button class="btn btn-ghost" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
    <button class="btn btn-primary" onclick="confirmImportTags()">确定导入</button>
  `);
  const sSel = document.getElementById('impStudent');
  populateTimeSelect('impStudent', 'impTime');
  sSel.addEventListener('change', () => populateTimeSelect('impStudent', 'impTime'));
}

async function confirmImportTags() {
  const student = document.getElementById('impStudent') ? document.getElementById('impStudent').value : '';
  const classTime = document.getElementById('impTime') ? document.getElementById('impTime').value : '';
  Modal.close(document.querySelector('.modal-overlay'));
  await saveDocsWithTags(pendingImportFiles, student, classTime);
  pendingImportFiles = [];
}

async function saveDocsWithTags(files, student, classTime) {
  let ok = 0;
  for (const f of files) {
    const t = fileType(f.name);
    if (t === 'other') { Toast.show('仅支持 PDF / Word：' + f.name); continue; }
    await DocDB.put('documents', {
      id: DB.uid(),
      name: f.name,
      type: t,
      mime: f.type,
      size: f.size,
      blob: f,
      addedAt: Date.now(),
      student: student || '',
      classTime: classTime || '',
    });
    ok++;
  }
  Toast.show(`已导入 ${ok} 个文档` + (student ? `（${student}${classTime ? ' · ' + classTime : ''}）` : ''));
  refreshDocFiltersAndList();
}

// 给已有文档补打 / 修改分类标签
function tagDoc(id) {
  DocDB.get('documents', id).then(d => {
    if (!d) return;
    const students = getStudentsList();
    const studentOpts = '<option value="">— 不关联学生 —</option>' +
      students.map(s => `<option value="${esc(s.name)}" ${d.student === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const body = `
      <div class="form-row">
        <label class="form-label">关联学生</label>
        <select class="input" id="tagStudent">${studentOpts}</select>
      </div>
      <div class="form-row">
        <label class="form-label">关联上课时间</label>
        <select class="input" id="tagTime"><option value="">— 不关联时间 —</option></select>
      </div>
    `;
    Modal.show('编辑归类', body, `
      <button class="btn btn-ghost" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
      <button class="btn btn-primary" onclick="confirmTagDoc('${id}')">保存</button>
    `);
    populateTimeSelect('tagStudent', 'tagTime', d.classTime);
    document.getElementById('tagStudent').addEventListener('change', () => populateTimeSelect('tagStudent', 'tagTime'));
  });
}

async function confirmTagDoc(id) {
  const student = document.getElementById('tagStudent') ? document.getElementById('tagStudent').value : '';
  const classTime = document.getElementById('tagTime') ? document.getElementById('tagTime').value : '';
  const d = await DocDB.get('documents', id);
  if (!d) return;
  d.student = student;
  d.classTime = classTime;
  await DocDB.put('documents', d);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已更新归类');
  refreshDocFiltersAndList();
}

async function exportDoc(id) {
  const d = await DocDB.get('documents', id);
  if (!d) return;
  const url = URL.createObjectURL(d.blob);
  const a = document.createElement('a');
  a.href = url; a.download = d.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  Toast.show('已开始导出：' + d.name);
}

async function previewDoc(id) {
  const d = await DocDB.get('documents', id);
  if (!d) return;
  const url = URL.createObjectURL(d.blob);
  const body = `<iframe src="${url}" style="width:100%;height:70vh;border:0;border-radius:8px"></iframe>`;
  Modal.show('预览：' + d.name, body, `<button class="btn btn-primary" onclick="Modal.close(document.querySelector('.modal-overlay'));setTimeout(()=>URL.revokeObjectURL('${url}'),1000)">关闭</button>`);
}

async function deleteDoc(id) {
  if (!confirm('确定删除该文档？此操作不可恢复。')) return;
  await DocDB.del('documents', id);
  Toast.show('已删除');
  refreshDocFiltersAndList();
}

// ==================== 便利贴 ====================
function renderStickiesTab(box) {
  const list = getStickies();
  box.innerHTML = `
    <div class="flex gap-2 flex-wrap mb-3" style="align-items:center">
      <button class="btn btn-primary" onclick="addSticky()">➕ 新增便利贴</button>
      <span class="text-xs text-light">拖动可移动位置 · 点击文字编辑 · 便利贴会随账号云同步</span>
    </div>
    <div class="sticky-board" id="stickyBoard">
      ${list.length === 0 ? '<div class="empty-state" style="position:static"><div class="empty-state-icon">📝</div><div class="empty-state-text">还没有便利贴，点击「新增便利贴」记录备课要点</div></div>' : ''}
    </div>
  `;
  const board = document.getElementById('stickyBoard');
  list.forEach(s => board.appendChild(buildStickyEl(s)));
  bindStickyDrag();
}

function buildStickyEl(s) {
  const el = document.createElement('div');
  el.className = 'sticky-note';
  el.dataset.id = s.id;
  el.style.left = (s.x || 20) + 'px';
  el.style.top = (s.y || 20) + 'px';
  el.style.background = s.color || '#FFF3B0';
  el.innerHTML = `
    <div class="sticky-toolbar">
      <div class="sticky-colors">
        ${STICKY_COLORS.map(c => `<span class="sticky-color ${c === s.color ? 'sel' : ''}" style="background:${c}" data-c="${c}"></span>`).join('')}
      </div>
      <button class="sticky-del" title="删除">✕</button>
    </div>
    <textarea class="sticky-text" placeholder="输入要点备忘...">${esc(s.text || '')}</textarea>
  `;
  // 颜色切换
  el.querySelectorAll('.sticky-color').forEach(sp => sp.addEventListener('click', e => {
    e.stopPropagation();
    el.style.background = sp.dataset.c;
    const cur = getStickies().find(x => x.id === s.id);
    if (cur) { cur.color = sp.dataset.c; saveStickies(getStickies()); }
    el.querySelectorAll('.sticky-color').forEach(x => x.classList.toggle('sel', x.dataset.c === sp.dataset.c));
  }));
  // 删除
  el.querySelector('.sticky-del').addEventListener('click', e => {
    e.stopPropagation();
    const nl = getStickies().filter(x => x.id !== s.id);
    saveStickies(nl);
    el.remove();
    if (nl.length === 0) renderStickiesTab(document.getElementById('prepTabContent'));
  });
  // 文字编辑
  el.querySelector('.sticky-text').addEventListener('input', e => {
    const cur = getStickies().find(x => x.id === s.id);
    if (cur) { cur.text = e.target.value; saveStickies(getStickies()); }
  });
  return el;
}

function addSticky() {
  const list = getStickies();
  const s = {
    id: DB.uid(),
    text: '',
    color: STICKY_COLORS[list.length % STICKY_COLORS.length],
    x: 30 + (list.length % 5) * 30,
    y: 30 + (list.length % 5) * 30,
  };
  list.push(s);
  saveStickies(list);
  const board = document.getElementById('stickyBoard');
  const empty = board.querySelector('.empty-state');
  if (empty) empty.remove();
  board.appendChild(buildStickyEl(s));
  bindStickyDrag();
}

function bindStickyDrag() {
  document.querySelectorAll('.sticky-note').forEach(el => {
    const textarea = el.querySelector('.sticky-text');
    el.addEventListener('pointerdown', e => {
      if (e.target === textarea || e.target.closest('.sticky-toolbar')) return; // 文字/工具不触发拖动
      e.preventDefault();
      const board = document.getElementById('stickyBoard');
      const rect = board.getBoundingClientRect();
      const startX = e.clientX, startY = e.clientY;
      const ox = parseFloat(el.style.left) || 0, oy = parseFloat(el.style.top) || 0;
      el.setPointerCapture(e.pointerId);
      el.classList.add('dragging');
      const move = ev => {
        let nx = ox + (ev.clientX - startX);
        let ny = oy + (ev.clientY - startY);
        nx = Math.max(0, Math.min(nx, board.clientWidth - el.offsetWidth));
        ny = Math.max(0, Math.min(ny, board.clientHeight - el.offsetHeight));
        el.style.left = nx + 'px';
        el.style.top = ny + 'px';
      };
      const up = ev => {
        el.releasePointerCapture(ev.pointerId);
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        const cur = getStickies().find(x => x.id === el.dataset.id);
        if (cur) { cur.x = parseFloat(el.style.left); cur.y = parseFloat(el.style.top); saveStickies(getStickies()); }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  });
}

// ==================== 手写备课 ====================
let hwCanvas = null, hwCtx = null, hwUndoStack = [], hwCurrentId = null;

function renderHandwritingTab(box) {
  box.innerHTML = `
    <div class="hw-toolbar flex gap-2 flex-wrap mb-3" style="align-items:center">
      <input type="color" id="hwColor" value="#222222" title="画笔颜色" style="width:38px;height:34px;border:none;background:none;cursor:pointer">
      <label class="text-sm">粗细</label>
      <input type="range" id="hwWidth" min="1" max="24" value="4" style="width:110px">
      <button class="btn btn-sm btn-secondary" onclick="hwSetEraser(false)">✏️ 画笔</button>
      <button class="btn btn-sm btn-secondary" onclick="hwSetEraser(true)">🩹 橡皮</button>
      <button class="btn btn-sm btn-secondary" onclick="hwUndo()">↩️ 撤销</button>
      <button class="btn btn-sm btn-danger" onclick="hwClear()">🧹 清空</button>
      <input class="input" id="hwName" placeholder="本页名称（如：二次函数1）" style="max-width:200px">
      <button class="btn btn-sm btn-primary" onclick="hwSave()">💾 保存本页</button>
    </div>
    <div class="hw-canvas-wrap">
      <canvas id="hwCanvas" class="hw-canvas"></canvas>
    </div>
    <div class="mt-3">
      <div class="font-semibold mb-2">已保存的手写备课页</div>
      <div id="hwList" class="item-grid"></div>
    </div>
  `;
  setupHWCanvas();
  DocDB.getAll('handwriting').then(list => {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const el = document.getElementById('hwList');
    if (list.length === 0) { el.innerHTML = `<div class="text-sm text-light">还没有保存的手写页</div>`; return; }
    el.innerHTML = list.map(h => `
      <div class="doc-card">
        <img class="hw-thumb" src="${h.dataUrl}" alt="">
        <div class="doc-card-body">
          <div class="doc-card-name">${esc(h.name || '手写页')}</div>
          <div class="doc-card-meta">${DB.formatDate(h.createdAt ? new Date(h.createdAt) : new Date(), 'YYYY-MM-DD HH:mm')}</div>
          <div class="flex gap-2 flex-wrap mt-2">
            <button class="btn btn-xs btn-secondary" onclick="hwEdit('${h.id}')">✏️ 继续画</button>
            <button class="btn btn-xs btn-primary" onclick="hwExport('${h.id}')">⬇️ 导出</button>
            <button class="btn btn-xs btn-danger" onclick="hwDelete('${h.id}')">🗑</button>
          </div>
        </div>
      </div>`).join('');
  });
}

function setupHWCanvas() {
  const canvas = document.getElementById('hwCanvas');
  if (!canvas) return;
  hwCanvas = canvas;
  const wrap = canvas.parentElement;
  // 设置像素尺寸（适配高分屏 + 平板）
  const dpr = window.devicePixelRatio || 1;
  const w = wrap.clientWidth || 800;
  const h = Math.max(360, Math.min(640, w * 0.7));
  canvas.style.width = '100%';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  hwCtx = ctx;
  hwUndoStack = [];

  let drawing = false, lastX = 0, lastY = 0, erasing = false;
  canvas.addEventListener('pointerdown', e => {
    drawing = true;
    const r = canvas.getBoundingClientRect();
    lastX = e.clientX - r.left; lastY = e.clientY - r.top;
    canvas.setPointerCapture(e.pointerId);
    // 快照用于撤销
    pushUndo();
    drawDot(lastX, lastY);
  });
  canvas.addEventListener('pointermove', e => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    drawLine(lastX, lastY, x, y);
    lastX = x; lastY = y;
  });
  canvas.addEventListener('pointerup', e => { drawing = false; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} });
  canvas.addEventListener('pointerleave', () => { drawing = false; });
}

function pushUndo() {
  try { hwUndoStack.push(hwCanvas.toDataURL()); if (hwUndoStack.length > 25) hwUndoStack.shift(); } catch (e) {}
}
function drawDot(x, y) {
  const color = document.getElementById('hwColor').value;
  const width = parseInt(document.getElementById('hwWidth').value);
  const erasing = hwEraser;
  hwCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  hwCtx.fillStyle = color;
  hwCtx.beginPath();
  hwCtx.arc(x, y, erasing ? width * 2 : width / 2, 0, Math.PI * 2);
  hwCtx.fill();
}
function drawLine(x1, y1, x2, y2) {
  const color = document.getElementById('hwColor').value;
  const width = parseInt(document.getElementById('hwWidth').value);
  const erasing = hwEraser;
  hwCtx.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
  hwCtx.strokeStyle = color;
  hwCtx.lineWidth = erasing ? width * 2 : width;
  hwCtx.beginPath();
  hwCtx.moveTo(x1, y1);
  hwCtx.lineTo(x2, y2);
  hwCtx.stroke();
}
let hwEraser = false;
function hwSetEraser(on) { hwEraser = on; Toast.show(on ? '已切换橡皮' : '已切换画笔'); }

function hwUndo() {
  if (hwUndoStack.length === 0) return;
  const data = hwUndoStack.pop();
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    hwCtx.clearRect(0, 0, hwCanvas.width, hwCanvas.height);
    hwCtx.drawImage(img, 0, 0, hwCanvas.width / dpr, hwCanvas.height / dpr);
  };
  img.src = data;
}
function hwClear() {
  if (!confirm('清空当前画布？')) return;
  const dpr = window.devicePixelRatio || 1;
  hwCtx.clearRect(0, 0, hwCanvas.width, hwCanvas.height);
  hwCtx.fillStyle = '#ffffff';
  hwCtx.fillRect(0, 0, hwCanvas.width / dpr, hwCanvas.height / dpr);
  hwUndoStack = [];
}

async function hwSave() {
  const name = document.getElementById('hwName').value.trim() || ('手写备课 ' + DB.formatDate(new Date(), 'MM-DD HH:mm'));
  const dataUrl = hwCanvas.toDataURL('image/png');
  await DocDB.put('handwriting', { id: hwCurrentId || DB.uid(), name, dataUrl, createdAt: Date.now() });
  hwCurrentId = null;
  Toast.show('已保存：' + name);
  renderHandwritingTab(document.getElementById('prepTabContent'));
}

async function hwEdit(id) {
  const h = await DocDB.get('handwriting', id);
  if (!h) return;
  hwCurrentId = id;
  document.getElementById('hwName').value = h.name || '';
  const img = new Image();
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    hwCtx.clearRect(0, 0, hwCanvas.width, hwCanvas.height);
    hwCtx.drawImage(img, 0, 0, hwCanvas.width / dpr, hwCanvas.height / dpr);
  };
  img.src = h.dataUrl;
  Toast.show('已载入，可继续手写');
}

function hwExport(id) {
  DocDB.get('handwriting', id).then(h => {
    if (!h) return;
    const a = document.createElement('a');
    a.href = h.dataUrl; a.download = (h.name || '手写备课') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    Toast.show('已导出图片');
  });
}

async function hwDelete(id) {
  if (!confirm('删除该手写页？')) return;
  await DocDB.del('handwriting', id);
  Toast.show('已删除');
  renderHandwritingTab(document.getElementById('prepTabContent'));
}
