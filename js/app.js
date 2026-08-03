/**
 * app.js - 主控制器 + 全部功能模块
 */

// ==================== 全局状态 ====================
const App = {
  currentModule: 'dashboard',
  aiPanelOpen: false,
  aiRole: 'ta',
  pomodoro: {
    running: false,
    mode: 'lesson', // 'lesson' | 'prep'
    timeLeft: 25 * 60,
    interval: null,
    taskId: null,
  },
  calendarDate: new Date(),
  scheduleView: 'week', // 'week' | 'month' | 'student'
  selectedStudent: null,
  billingPeriodType: 'month', // 'month' | 'week' | 'custom'
  billingPeriod: '',
  billingCustomStart: '',
  billingCustomEnd: '',
};

// ==================== Toast ====================
const Toast = {
  show(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
};

// ==================== Modal ====================
const Modal = {
  show(title, bodyHTML, footerHTML = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="icon-btn modal-close-btn">
            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div class="modal-body">${bodyHTML}</div>
        ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close-btn').onclick = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return overlay;
  },
  close(overlay) {
    if (overlay) overlay.remove();
  }
};

// ==================== 工具函数 ====================
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => Toast.show('已复制到剪贴板'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); Toast.show('已复制到剪贴板'); } catch (e) { Toast.show('复制失败'); }
    ta.remove();
  }
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 容错读取文本文件：先按 UTF-8 解码，若含替换字符（非 UTF-8）则回退 GBK/GB18030，
// 兼容 Excel 导出的旧文件，避免导入中文变成乱码
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      let u8 = new Uint8Array(e.target.result);
      let start = 0;
      if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) start = 3; // 去 UTF-8 BOM
      const slice = u8.subarray(start);
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(slice);
      if (!utf8.includes('�')) { resolve(utf8); return; }
      try { resolve(new TextDecoder('gb18030').decode(slice)); }
      catch (err) { resolve(utf8); }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

// 把「UTF-8 字节被当成单字节编码(Latin-1)读」产生的乱码还原为中文；无法还原返回 null
function reverseMojibake(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch (e) { return null; }
}
// 检测单个字符串是否乱码：返回 null / {type:'mojibake',fixed} / {type:'unrecoverable'}
function detectGarbled(str) {
  if (!str || typeof str !== 'string') return null;
  if (str.includes('�')) return { type: 'unrecoverable' };
  const fixed = reverseMojibake(str);
  if (fixed && fixed !== str && /[一-鿿]/.test(fixed)) return { type: 'mojibake', fixed };
  return null;
}

// ==================== PWA / 启动画面 ====================
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

function hideLaunchScreen() {
  const screen = document.getElementById('launchScreen');
  if (!screen) return;
  if (isStandalone()) {
    // PWA 模式下显示启动画面，营造原生 App 启动感
    screen.style.display = 'flex';
    screen.style.opacity = '1';
    setTimeout(() => {
      screen.style.opacity = '0';
      screen.style.transition = 'opacity 0.35s ease';
      setTimeout(() => {
        screen.style.display = 'none';
      }, 350);
    }, 700);
  } else {
    screen.style.display = 'none';
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js')
    .then(reg => {
      console.log('[PWA] ServiceWorker registered:', reg.scope);
      // 主动检查更新（拉取最新 sw.js）
      try { reg.update(); } catch (e) {}
      // 新版本就绪后：让旧 SW 立即让位并刷新页面，避免一直停留在旧缓存
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
            nw.postMessage('skipWaiting');
          }
        });
      });
    })
    .catch(err => console.warn('[PWA] ServiceWorker registration failed:', err));
  // SW 激活后要求本页刷新（根治顽固旧缓存）
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data === 'sw-reload') location.reload();
  });
}

// PWA 安装提示
let deferredInstallPrompt = null;
function isIOSSafari() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && /WebKit/.test(ua) && !/(CriOS|FxiOS|OPiOS|mercury)/.test(ua);
}

function showInstallBannerIfNeeded() {
  // 已安装或已经关闭过则不再提示
  if (isStandalone()) return;
  const dismissed = localStorage.getItem('pwa_install_dismissed');
  if (dismissed === '1') return;
  const banner = document.getElementById('installBanner');
  if (!banner) return;
  // iOS 上改为手动添加引导文案
  if (isIOSSafari()) {
    banner.querySelector('.install-banner-title').textContent = '添加到主屏幕';
    banner.querySelector('.install-banner-desc').textContent = '点击分享按钮 → 添加到主屏幕，即可全屏使用';
  }
  banner.style.display = 'flex';
}

function trackInstallPrompt() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    App.installPrompt = e;
    showInstallBannerIfNeeded();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    App.installPrompt = null;
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
    Toast.show('已添加到主屏幕，可以像 App 一样使用');
  });

  // iOS Safari 没有 beforeinstallprompt，延迟提示手动添加
  if (isIOSSafari()) {
    setTimeout(showInstallBannerIfNeeded, 1500);
  }
}

function dismissInstallBanner() {
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('pwa_install_dismissed', '1');
}

function promptInstallPWA() {
  const prompt = App.installPrompt || deferredInstallPrompt;
  if (!prompt) {
    // iOS 不支持 beforeinstallprompt，给出手动添加提示
    Modal.show('添加到主屏幕', `
      <div class="pwa-guide">
        <p><strong>iPhone / iPad 添加步骤：</strong></p>
        <ol>
          <li>点击下方 Safari 的<span class="share-icon">分享按钮</span>（方框+向上箭头）</li>
          <li>在菜单中找到并点击<strong>「添加到主屏幕」</strong></li>
          <li>点击右上角<strong>「添加」</strong>即可</li>
        </ol>
        <p class="pwa-guide-note">添加后，从主屏幕打开即可全屏使用，无需浏览器地址栏。</p>
      </div>
    `);
    return;
  }
  prompt.prompt();
  prompt.userChoice.then(choice => {
    if (choice.outcome === 'accepted') {
      Toast.show('应用正在安装');
    }
    deferredInstallPrompt = null;
    App.installPrompt = null;
  });
}

// ==================== 初始化 ====================
function init() {
  registerServiceWorker();
  trackInstallPrompt();
  initData();
  applyPersonalization();
  applyScheduleTheme();
  // 初始化排课周视图，默认当前周
  if (!App.scheduleWeekStart) App.scheduleWeekStart = getWeekMonday(new Date());
  autoContinueSchedule(App.scheduleWeekStart);
  bindGlobalEvents();
  preventHorizontalBodyDrag();
  switchModule('dashboard');
  // 初始化云同步（登录后自动拉取）
  if (typeof initSync === 'function') initSync();
  hideLaunchScreen();
  window.__appReady = true; // 启动自检通过，避免触发自动绕过 SW 重刷
}

// 手机端：阻止 body 层面的水平拖动/橡皮筋回弹，但保留内部滚动容器（如 schedule-scroll）的横向滚动
function preventHorizontalBodyDrag() {
  if (typeof window === 'undefined') return;
  let startX = 0, startY = 0;
  document.addEventListener('touchstart', function(e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!e.touches.length) return;
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    const dx = Math.abs(x - startX);
    const dy = Math.abs(y - startY);
    // 如果水平位移大于垂直位移，且不在可横向滚动的容器内，则阻止默认行为
    if (dx > dy && dx > 10) {
      let el = e.target;
      let allow = false;
      while (el && el !== document.body) {
        const st = window.getComputedStyle(el);
        if (st.overflowX === 'auto' || st.overflowX === 'scroll' || el.classList.contains('schedule-scroll')) {
          allow = true;
          break;
        }
        el = el.parentElement;
      }
      if (!allow) e.preventDefault();
    }
  }, { passive: false });
}

function bindGlobalEvents() {
  // 导航点击
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const module = item.dataset.module;
      switchModule(module);
      // 移动端关闭侧边栏
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // 菜单切换
  document.getElementById('menuToggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay').addEventListener('click', closeSidebar);

  // AI 面板切换
  document.getElementById('aiToggle').addEventListener('click', toggleAIPanel);
  document.getElementById('aiClose').addEventListener('click', closeAIPanel);

  // AI 角色切换
  document.querySelectorAll('.ai-role-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ai-role-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      App.aiRole = btn.dataset.role;
      renderAIChat();
    });
  });

  // AI 发送
  document.getElementById('aiSendBtn').addEventListener('click', sendAIMessage);
  document.getElementById('aiInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendAIMessage();
    }
  });

  // 番茄钟
  document.getElementById('pomodoroToggleBtn').addEventListener('click', togglePomodoro);
  document.getElementById('pomodoroCloseBtn').addEventListener('click', closePomodoro);

  // 导入导出
  document.getElementById('exportDataBtn').addEventListener('click', exportData);
  document.getElementById('importDataBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', importData);

  // 响应式：窗口大小变化
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) closeSidebar();
  });
}

// ==================== 布局管理 ====================
function switchModule(name) {
  App.currentModule = name;
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.module === name);
  });
  const main = document.getElementById('mainContent');
  const moduleName = MODULE_NAMES[name] || name;
  main.innerHTML = `<div class="module" id="moduleContainer"></div>`;
  const container = document.getElementById('moduleContainer');

  const renderFn = Modules[name];
  if (renderFn) {
    container.innerHTML = renderFn();
    if (typeof renderFn.init === 'function') {
      renderFn.init();
    }
    // 绑定模块内事件
    bindModuleEvents(name);
    // 个性化设置：绑定头像上传
    if (name === 'personalize') bindAvatarUpload();
  } else {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🚧</div><div class="empty-state-text">模块开发中...</div></div>`;
  }
  main.scrollTop = 0;

  // 排课表横屏时，在 body 层级追加一个不受旋转容器影响的退出按钮（兜底）
  updateBodyLandscapeExitButton();
}

// 原地刷新个性化模块内容并保留滚动位置（背景/头像等子项变更时用，避免整页跳回顶部）
function rerenderPersonalizeKeepScroll() {
  const main = document.getElementById('mainContent');
  const container = document.getElementById('moduleContainer');
  if (main && container && App.currentModule === 'personalize' && typeof Modules['personalize'] === 'function') {
    const prevScroll = main.scrollTop;
    container.innerHTML = Modules['personalize']();
    if (typeof Modules['personalize'].init === 'function') Modules['personalize'].init();
    bindModuleEvents('personalize');
    bindAvatarUpload();
    main.scrollTop = prevScroll;
  }
}

function updateBodyLandscapeExitButton() {
  let btn = document.getElementById('schBodyExitLandscape');
  const need = App.currentModule === 'schedule' && App.scheduleLandscape;
  if (!need) {
    if (btn) btn.remove();
    return;
  }
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'schBodyExitLandscape';
    btn.className = 'sch-exit-landscape';
    btn.textContent = '✕ 退出横屏';
    btn.onclick = () => { App.scheduleLandscape = false; switchModule('schedule'); };
    document.body.appendChild(btn);
  }
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

function toggleAIPanel() {
  App.aiPanelOpen = !App.aiPanelOpen;
  const panel = document.getElementById('aiPanel');
  const main = document.getElementById('mainContent');
  if (App.aiPanelOpen) {
    panel.classList.add('open');
    if (window.innerWidth > 1200) main.classList.add('ai-open');
    renderAIChat();
  } else {
    panel.classList.remove('open');
    main.classList.remove('ai-open');
  }
}
function closeAIPanel() {
  App.aiPanelOpen = false;
  document.getElementById('aiPanel').classList.remove('open');
  document.getElementById('mainContent').classList.remove('ai-open');
}

// ==================== 模块名称映射 ====================
const MODULE_NAMES = {
  dashboard: '首页总览',
  todo: '每日任务',
  calendar: '日历看板',
  countdown: '考试倒计时',
  schedule: '排课管理',
  studentManagement: '学生管理',
  lessonPrep: '备课文档库',
  studentHours: '课消台账',
  grades: '成绩档案',
  report: '学情报告',
  billing: '课时结算',
  ledger: '记账',
  feedback: '课后反馈生成',
  scoreCalc: '中考分数测算',
  materials: '素材库',
  examBank: '真题集',
  errorBoard: '错题收集板',
  statistics: '学习时长统计',
  aiAssistant: 'AI 对话助手',
  personalize: '个性化设置',
};

// ==================== 模块事件绑定 ====================
function bindModuleEvents(name) {
  const fn = Modules[name];
  if (fn && typeof fn.bindEvents === 'function') {
    fn.bindEvents();
  }
}

// ==================== AI 助手 ====================
function renderAIChat() {
  const area = document.getElementById('aiChatArea');
  const chats = DB.get('aiChats', { ta: [], prep: [] });
  const messages = chats[App.aiRole] || [];
  if (messages.length === 0) {
    const roleText = App.aiRole === 'ta'
      ? '我是理科助教，可以帮你写课后反馈、备课出题、解析知识点。'
      : '我是备考助手，可以帮你梳理考点、解析习题、制定复习计划。';
    area.innerHTML = `<div class="ai-welcome"><p>👋 你好！</p><p>${roleText}</p><p>输入问题开始对话吧。</p></div>`;
    return;
  }
  area.innerHTML = messages.map(m => {
    const cls = m.role === 'user' ? 'user' : 'ai';
    return `<div class="chat-msg ${cls}">${esc(m.content).replace(/\n/g, '<br>')}</div>`;
  }).join('');
  area.scrollTop = area.scrollHeight;
}

function sendAIMessage() {
  const input = document.getElementById('aiInput');
  const text = input.value.trim();
  if (!text) return;

  const chats = DB.get('aiChats', { ta: [], prep: [] });
  if (!chats[App.aiRole]) chats[App.aiRole] = [];
  chats[App.aiRole].push({ id: DB.uid(), role: 'user', content: text, timestamp: Date.now() });
  DB.set('aiChats', chats);

  input.value = '';
  renderAIChat();

  // 模拟AI回复
  setTimeout(() => {
    const reply = generateAIReply(text, App.aiRole);
    chats[App.aiRole].push({ id: DB.uid(), role: 'ai', content: reply, timestamp: Date.now() });
    DB.set('aiChats', chats);
    renderAIChat();
  }, 800);
}

function generateAIReply(text, role) {
  const lower = text.toLowerCase();
  const replies = {
    ta: {
      feedback: `好的，帮你生成课后反馈模板：\n\n【家长您好】\n今天我们主要学习了____知识点。课堂表现方面，孩子____（积极回答/认真听讲/偶有走神）。目前掌握较好的是____，仍需加强的是____。建议课后重点复习____，完成____练习。下节课我们将学习____。\n\n如需调整可以告诉我具体内容。`,
      question: `帮你出几道练习题：\n\n1. 基础题：____\n2. 进阶题：____\n3. 拓展题：____\n\n请告诉我具体学科和知识点，我可以出更精准的题目。`,
      plan: `备课思路建议：\n\n1. 课前回顾（5分钟）：复习上节课重点\n2. 新知讲解（15分钟）：核心概念+例题\n3. 课堂练习（15分钟）：分层练习\n4. 拓展提升（10分钟）：难题挑战\n5. 总结反馈（5分钟）：知识点梳理+作业布置\n\n请告诉我具体课程内容，我来细化。`,
      default: `收到你的问题。作为理科助教，我可以帮你：\n• 撰写课后反馈话术\n• 备课出题\n• 解析知识点\n• 制定教学计划\n\n请告诉我具体需求，比如"帮我写一段初二数学的课后反馈"。`,
    },
    prep: {
      point: `帮你梳理考点：\n\n核心考点：\n1. ____（高频，分值大）\n2. ____（中等频率，需理解）\n3. ____（低频但易错）\n\n建议复习顺序：先掌握1、2，再攻克3。\n请告诉我具体科目和章节，我来细化考点。`,
      exercise: `习题解析思路：\n\n第一步：审题——提取已知条件和求解目标\n第二步：联想——关联相关知识点和公式\n第三步：列式——建立已知与未知的联系\n第四步：求解——注意计算细节\n第五步：检验——代入验证结果合理性\n\n请把题目发给我，我来具体解析。`,
      plan: `备考复习计划建议：\n\n第一阶段（基础）：通读教材，整理笔记，完成课后习题\n第二阶段（强化）：专题训练，突破难点，整理错题\n第三阶段（冲刺）：模拟真题，查漏补缺，回顾错题\n\n请告诉我考试科目和剩余时间，我来制定详细计划。`,
      default: `收到你的问题。作为备考助手，我可以帮你：\n• 梳理考点\n• 解析习题\n• 制定复习计划\n• 整理背诵笔记\n\n请告诉我具体需求，比如"帮我梳理初级会计的资产章节考点"。`,
    }
  };

  const set = replies[role];
  if (/反馈|feedback|家长/.test(lower)) return set.feedback || set.default;
  if (/题|出题|练习/.test(lower)) return set.question || set.exercise || set.default;
  if (/计划|规划|安排|备课/.test(lower)) return set.plan;
  if (/考点|重点|知识点/.test(lower)) return set.point || set.default;
  if (/解析|讲解|怎么做|怎么做/.test(lower)) return set.exercise || set.default;
  return set.default;
}

// ==================== 番茄钟 ====================
function togglePomodoro() {
  const p = App.pomodoro;
  if (p.running) {
    clearInterval(p.interval);
    p.running = false;
    document.getElementById('pomodoroToggleBtn').textContent = '▶';
    document.getElementById('pomodoroToggleBtn').classList.remove('running');
  } else {
    p.running = true;
    document.getElementById('pomodoroToggleBtn').textContent = '⏸';
    document.getElementById('pomodoroToggleBtn').classList.add('running');
    p.interval = setInterval(() => {
      p.timeLeft--;
      updatePomodoroDisplay();
      if (p.timeLeft <= 0) {
        clearInterval(p.interval);
        p.running = false;
        document.getElementById('pomodoroToggleBtn').textContent = '▶';
        document.getElementById('pomodoroToggleBtn').classList.remove('running');
        // 记录学习时长
        const studyTime = DB.get('studyTime', { records: [] });
        const duration = DB.get('settings', Models.settings).pomodoroWorkMin;
        studyTime.records.push({
          id: DB.uid(),
          type: p.mode === 'lesson' ? 'lesson' : 'prep',
          duration: duration,
          date: DB.formatDate(),
          label: p.mode === 'lesson' ? '备课计时' : '备考学习'
        });
        DB.set('studyTime', studyTime);
        Toast.show('番茄钟完成！已记录学习时长 ' + duration + ' 分钟');
        p.timeLeft = DB.get('settings', Models.settings).pomodoroWorkMin * 60;
        updatePomodoroDisplay();
      }
    }, 1000);
  }
}

function updatePomodoroDisplay() {
  const min = Math.floor(App.pomodoro.timeLeft / 60);
  const sec = App.pomodoro.timeLeft % 60;
  document.getElementById('pomodoroTime').textContent =
    String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function closePomodoro() {
  if (App.pomodoro.running) {
    clearInterval(App.pomodoro.interval);
    App.pomodoro.running = false;
  }
  document.getElementById('pomodoroFloat').style.display = 'none';
}

function startPomodoroForTask(taskId, mode) {
  App.pomodoro.taskId = taskId;
  App.pomodoro.mode = mode;
  App.pomodoro.timeLeft = DB.get('settings', Models.settings).pomodoroWorkMin * 60;
  document.getElementById('pomodoroLabel').textContent = mode === 'lesson' ? '备课计时' : '备考学习';
  document.getElementById('pomodoroFloat').style.display = 'block';
  updatePomodoroDisplay();
  if (!App.pomodoro.running) togglePomodoro();
}

// ==================== 导入导出 ====================
function exportData() {
  const data = DB.exportAll();
  const blob = new Blob(['﻿' + JSON.stringify(data, null, 2)], { type: 'application/json; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `教培工作台备份_${DB.formatDate()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.show('数据已导出');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  readFileText(file).then(text => {
    try {
      const data = JSON.parse(text);
      if (DB.importAll(data)) {
        Toast.show('数据导入成功，正在刷新...');
        setTimeout(() => location.reload(), 1000);
      } else {
        Toast.show('导入失败：数据格式错误');
      }
    } catch (err) {
      Toast.show('导入失败：' + err.message);
    }
  }).catch(err => Toast.show('读取文件失败：' + err.message));
  e.target.value = '';
}

// ==================== 模块定义 ====================
const Modules = {};

// ---------- 1. 首页总览 ----------
Modules.dashboard = function() {
  const todos = DB.get('todo', { list: [] }).list;
  const todayTodos = todos.filter(t => !t.completed && (!t.isRecurring || isRecurringToday(t)));
  const schedule = DB.get('schedule', { list: [] }).list;
  const weekRange = DB.getWeekRange();
  const weekClasses = schedule.filter(s => {
    const ds = getSlotActualDate(s);
    if (!ds) return false;
    const d = new Date(ds + 'T00:00:00');
    return d >= weekRange.start && d <= weekRange.end && s.status === 'pending';
  });
  const monthRange = DB.getMonthRange();
  const monthDone = schedule.filter(s => {
    const ds = getSlotActualDate(s);
    if (!ds) return false;
    const d = new Date(ds + 'T00:00:00');
    return d >= monthRange.start && d <= monthRange.end && s.status === 'done';
  });
  const studyTime = DB.get('studyTime', { records: [] }).records;
  const weekStudy = studyTime.filter(r => {
    const d = new Date(r.date);
    return d >= weekRange.start && d <= weekRange.end;
  });
  const weekPrepTime = weekStudy.filter(r => r.type === 'prep').reduce((s, r) => s + r.duration, 0);
  const countdowns = DB.get('countdown', { list: [] }).list;
  const nextExam = countdowns.filter(c => new Date(c.date) >= new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const shStudents = DB.get('studentHours', { list: [] }).list;
  const lowHours = shStudents.filter(s => (s.totalHours - s.usedHours) <= 3);

  let countdownHTML = '';
  if (nextExam) {
    const days = DB.daysBetween(new Date(), new Date(nextExam.date));
    countdownHTML = `<div class="stat-card" style="grid-column: span 2;">
      <div class="flex items-center gap-2"><span class="stat-icon">⏰</span><span class="stat-label">${esc(nextExam.name)}</span></div>
      <div class="stat-value text-warning">${days} 天</div>
      <div class="stat-extra">考试日期：${nextExam.date}</div>
    </div>`;
  }

  let lowHoursHTML = '';
  if (lowHours.length > 0) {
    lowHoursHTML = `<div class="card" style="border-color: var(--color-warning);">
      <div class="card-title">⚠️ 课时不足预警</div>
      ${lowHours.map(s => `<div class="flex justify-between items-center mb-2">
        <span>${esc(s.name)}</span>
        <span class="text-warning font-bold">剩余 ${s.totalHours - s.usedHours} 课时</span>
      </div>`).join('')}
    </div>`;
  }

  return `
    <div class="module-header">
      <div>
        <div class="module-title">首页总览</div>
        <div class="module-subtitle">${localStorage.getItem('sync_username') || '用户'}，欢迎回来</div>
      </div>
    </div>

    <!-- PWA 安装提示条 -->
    <div id="installBanner" class="install-banner" style="display:none;">
      <div class="install-banner-content">
        <img src="icons/icon-192.png" alt="" width="40" height="40">
        <div class="install-banner-text">
          <div class="install-banner-title">添加到主屏幕</div>
          <div class="install-banner-desc">像原生 App 一样使用，无需每次打开浏览器</div>
        </div>
      </div>
      <div class="install-banner-actions">
        <button class="btn btn-sm btn-ghost" onclick="dismissInstallBanner()">稍后</button>
        <button class="btn btn-sm btn-primary" onclick="promptInstallPWA()">安装</button>
      </div>
    </div>

    <div class="grid-4 mb-4">
      <div class="stat-card">
        <span class="stat-icon">📚</span>
        <span class="stat-label">本周待上课</span>
        <span class="stat-value">${weekClasses.length}</span>
        <span class="stat-extra">节</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">✅</span>
        <span class="stat-label">本月已上课</span>
        <span class="stat-value">${monthDone.length}</span>
        <span class="stat-extra">节（课消）</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">⏱️</span>
        <span class="stat-label">本周备考时长</span>
        <span class="stat-value">${Math.floor(weekPrepTime / 60)}<span style="font-size:16px">h</span>${weekPrepTime % 60}<span style="font-size:16px">m</span></span>
        <span class="stat-extra">分钟</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📝</span>
        <span class="stat-label">今日待办</span>
        <span class="stat-value">${todayTodos.length}</span>
        <span class="stat-extra">条任务</span>
      </div>
    </div>

    ${countdownHTML ? `<div class="grid-2 mb-4">${countdownHTML}<div class="stat-card">
      <div class="flex items-center gap-2"><span class="stat-icon">📊</span><span class="stat-label">学生总数</span></div>
      <div class="stat-value">${students.length}</div>
      <div class="stat-extra">在管学生</div>
    </div></div>` : ''}

    <div class="grid-2">
      <div class="card">
        <div class="card-title">📋 今日待办</div>
        ${todayTodos.length > 0 ? todayTodos.slice(0, 5).map(t => `
          <div class="todo-item">
            <div class="todo-checkbox" onclick="toggleTodo('${t.id}')"></div>
            <div class="todo-content">
              <div class="todo-text">${esc(t.text)}</div>
              <div class="todo-meta">
                <span class="tag ${t.type === 'teach' ? 'tag-sage' : 'tag-tan'}">${t.type === 'teach' ? '教学' : '备考'}</span>
              </div>
            </div>
          </div>
        `).join('') : '<div class="empty-state"><div class="empty-state-text">暂无待办任务</div></div>'}
      </div>

      <div>
        ${lowHoursHTML}
        <div class="card">
          <div class="card-title">⚡ 快捷操作</div>
          <div class="flex flex-wrap gap-2">
            <button class="btn btn-primary" onclick="switchModule('todo')">添加任务</button>
            <button class="btn btn-secondary" onclick="switchModule('schedule')">查看排课</button>
            <button class="btn btn-secondary" onclick="switchModule('feedback')">生成反馈</button>
            <button class="btn btn-secondary" onclick="toggleAIPanel()">AI助手</button>
          </div>
        </div>
      </div>
    </div>
  `;
};
Modules.dashboard.bindEvents = function() {};
Modules.dashboard.init = function() {};

function isRecurringToday(todo) {
  if (!todo.isRecurring || !todo.recurringDays) return true;
  const today = new Date().getDay();
  return todo.recurringDays.includes(today === 0 ? 7 : today);
}

function toggleTodo(id) {
  const data = DB.get('todo', { list: [] });
  const todo = data.list.find(t => t.id === id);
  if (todo) {
    todo.completed = !todo.completed;
    todo.completedAt = todo.completed ? DB.formatDate() : null;
    DB.set('todo', data);
    switchModule(App.currentModule);
  }
}

// ---------- 2. 每日任务 ----------
Modules.todo = function() {
  const data = DB.get('todo', { list: [] });
  const teachTodos = data.list.filter(t => t.type === 'teach');
  const prepTodos = data.list.filter(t => t.type === 'prep');

  function renderTodoList(todos) {
    if (todos.length === 0) return '<div class="empty-state"><div class="empty-state-text">暂无任务，点击上方添加</div></div>';
    const active = todos.filter(t => !t.completed);
    const done = todos.filter(t => t.completed);
    let html = '';
    if (active.length > 0) {
      html += active.map(t => renderTodoItem(t)).join('');
    }
    if (done.length > 0) {
      html += `<div class="todo-section-title">已完成 (${done.length})</div>`;
      html += done.slice(0, 10).map(t => renderTodoItem(t)).join('');
    }
    return html || '<div class="empty-state"><div class="empty-state-text">暂无任务</div></div>';
  }

  function renderTodoItem(t) {
    const recurringText = t.isRecurring ? `每日循环` : '';
    const pomoText = t.pomodoroCount ? `🍅 ×${t.pomodoroCount}` : '';
    return `
      <div class="todo-item ${t.completed ? 'completed' : ''}">
        <div class="todo-checkbox ${t.completed ? 'checked' : ''}" onclick="toggleTodo('${t.id}')"></div>
        <div class="todo-content">
          <div class="todo-text">${esc(t.text)}</div>
          <div class="todo-meta">
            ${recurringText ? `<span class="todo-meta-item">🔄 ${recurringText}</span>` : ''}
            ${pomoText ? `<span class="todo-meta-item">${pomoText}</span>` : ''}
            <span class="todo-meta-item">${DB.formatDate(t.createdAt, 'MM-DD')}</span>
          </div>
        </div>
        <div class="todo-actions">
          <button class="todo-action-btn" title="番茄钟" onclick="startPomodoroForTask('${t.id}', '${t.type === 'teach' ? 'lesson' : 'prep'}')">🍅</button>
          <button class="todo-action-btn" title="顺延" onclick="postponeTodo('${t.id}')">⏭️</button>
          <button class="todo-action-btn" title="删除" onclick="deleteTodo('${t.id}')">🗑️</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="module-header">
      <div>
        <div class="module-title">每日任务</div>
        <div class="module-subtitle">教学任务 & 备考任务 · 支持番茄计时</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddTodoModal()">➕ 添加任务</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">📚 教学任务</div>
        ${renderTodoList(teachTodos)}
      </div>
      <div class="card">
        <div class="card-title">📖 备考任务</div>
        ${renderTodoList(prepTodos)}
      </div>
    </div>
  `;
};
Modules.todo.bindEvents = function() {};
Modules.todo.init = function() {};

function showAddTodoModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">任务内容</label>
      <textarea class="textarea" id="todoText" placeholder="输入任务内容..."></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">任务类型</label>
      <div class="segmented">
        <button class="active" data-type="teach">教学任务</button>
        <button data-type="prep">备考任务</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">每日循环</label>
      <div class="flex items-center gap-2">
        <input type="checkbox" id="todoRecurring" style="width:20px;height:20px">
        <span class="text-sm text-secondary">设为每日固定循环任务</span>
      </div>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addTodo()">添加</button>`;
  const overlay = Modal.show('添加任务', body, footer);
  let selectedType = 'teach';
  overlay.querySelectorAll('.segmented button').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.segmented button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedType = btn.dataset.type;
    };
  });
  overlay._selectedType = () => selectedType;
}

function addTodo() {
  const text = document.getElementById('todoText').value.trim();
  if (!text) { Toast.show('请输入任务内容'); return; }
  const isRecurring = document.getElementById('todoRecurring').checked;
  const overlay = document.querySelector('.modal-overlay');
  const type = overlay._selectedType ? overlay._selectedType() : 'teach';
  const data = DB.get('todo', { list: [] });
  data.list.push({
    id: DB.uid(),
    text,
    type,
    completed: false,
    isRecurring,
    recurringDays: isRecurring ? [1,2,3,4,5,6,7] : [],
    createdAt: DB.formatDate(),
    pomodoroCount: 0,
  });
  DB.set('todo', data);
  Modal.close(overlay);
  Toast.show('任务已添加');
  switchModule('todo');
}

function deleteTodo(id) {
  const data = DB.get('todo', { list: [] });
  data.list = data.list.filter(t => t.id !== id);
  DB.set('todo', data);
  switchModule('todo');
}

function postponeTodo(id) {
  const data = DB.get('todo', { list: [] });
  const todo = data.list.find(t => t.id === id);
  if (todo) {
    // 顺延即重新创建为今天的任务
    todo.createdAt = DB.formatDate();
    DB.set('todo', data);
    Toast.show('任务已顺延');
    switchModule('todo');
  }
}

// ---------- 3. 日历看板 ----------
Modules.calendar = function() {
  const date = App.calendarDate;
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay() || 7;
  const daysInMonth = lastDay.getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const events = DB.get('calendar', { events: [] }).events;
  const schedule = DB.get('schedule', { list: [] }).list;

  // 合并日历事件和排课
  const allEvents = [...events];
  schedule.forEach(s => {
    if (s.date) {
      allEvents.push({
        title: `${s.studentName} ${s.subject || ''}`,
        date: s.date,
        type: 'teach',
      });
    }
  });

  const weekDays = ['一', '二', '三', '四', '五', '六', '日'];
  let cellsHTML = '';

  // 上月填充
  for (let i = startWeekday - 2; i >= 0; i--) {
    cellsHTML += `<div class="calendar-cell other-month"><div class="cal-day-num">${prevMonthDays - i}</div></div>`;
  }

  // 本月
  const today = new Date();
  for (let d = 1; d <= daysInMonth; d++) {
    const cellDate = new Date(year, month, d);
    const dateStr = DB.formatDate(cellDate);
    const dayEvents = allEvents.filter(e => e.date === dateStr);
    const isToday = DB.isSameDay(cellDate, today);
    let eventsHTML = dayEvents.slice(0, 3).map(e => {
      const cls = e.type === 'teach' ? 'cal-event-teach' : e.type === 'prep' ? 'cal-event-prep' : 'cal-event-important';
      return `<div class="calendar-event ${cls}">${esc(e.title)}</div>`;
    }).join('');
    if (dayEvents.length > 3) eventsHTML += `<div class="calendar-event text-light">+${dayEvents.length - 3} 更多</div>`;
    cellsHTML += `<div class="calendar-cell ${isToday ? 'today' : ''}" onclick="addCalendarEvent('${dateStr}')">
      <div class="cal-day-num">${d}</div>${eventsHTML}
    </div>`;
  }

  // 下月填充
  const totalCells = startWeekday - 1 + daysInMonth;
  const remaining = (7 - totalCells % 7) % 7;
  for (let d = 1; d <= remaining; d++) {
    cellsHTML += `<div class="calendar-cell other-month"><div class="cal-day-num">${d}</div></div>`;
  }

  return `
    <div class="module-header">
      <div>
        <div class="module-title">日历看板</div>
        <div class="module-subtitle">上课排课 & 备考计划 · 一目了然</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-secondary" onclick="changeCalendarMonth(-1)">◀ 上月</button>
        <button class="btn btn-secondary" onclick="changeCalendarMonth(0)">本月</button>
        <button class="btn btn-secondary" onclick="changeCalendarMonth(1)">下月 ▶</button>
        <button class="btn btn-primary" onclick="addCalendarEvent('${DB.formatDate(new Date())}')">➕ 添加事件</button>
      </div>
    </div>

    <div class="card">
      <div class="text-center mb-3" style="font-size:18px;font-weight:600">${year}年${month + 1}月</div>
      <div class="calendar-grid">
        ${weekDays.map(d => `<div class="calendar-day-header">周${d}</div>`).join('')}
        ${cellsHTML}
      </div>
      <div class="flex gap-3 mt-3 text-xs text-light">
        <span>🟢 教学/排课</span>
        <span>🟡 备考计划</span>
        <span>🔴 重要节点</span>
      </div>
    </div>
  `;
};
Modules.calendar.bindEvents = function() {};
Modules.calendar.init = function() {};

function changeCalendarMonth(delta) {
  if (delta === 0) {
    App.calendarDate = new Date();
  } else {
    App.calendarDate.setMonth(App.calendarDate.getMonth() + delta);
  }
  switchModule('calendar');
}

function addCalendarEvent(defaultDate) {
  const body = `
    <div class="form-group">
      <label class="form-label">事件标题</label>
      <input class="input" id="calEventTitle" placeholder="如：期中考试、复习计划...">
    </div>
    <div class="form-group">
      <label class="form-label">日期</label>
      <input type="date" class="input" id="calEventDate" value="${defaultDate}">
    </div>
    <div class="form-group">
      <label class="form-label">类型</label>
      <select class="select" id="calEventType">
        <option value="teach">教学/排课</option>
        <option value="prep">备考计划</option>
        <option value="important">重要节点</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <textarea class="textarea" id="calEventNotes" placeholder="可选备注..."></textarea>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveCalendarEvent()">保存</button>`;
  Modal.show('添加日历事件', body, footer);
}

function saveCalendarEvent() {
  const title = document.getElementById('calEventTitle').value.trim();
  const date = document.getElementById('calEventDate').value;
  const type = document.getElementById('calEventType').value;
  const notes = document.getElementById('calEventNotes').value.trim();
  if (!title || !date) { Toast.show('请填写标题和日期'); return; }
  const data = DB.get('calendar', { events: [] });
  data.events.push({ id: DB.uid(), title, date, type, notes });
  DB.set('calendar', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('事件已添加');
  switchModule('calendar');
}

// ---------- 4. 考试倒计时 ----------
Modules.countdown = function() {
  const data = DB.get('countdown', { list: [] });
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const sorted = data.list.sort((a, b) => new Date(a.date) - new Date(b.date));

  return `
    <div class="module-header">
      <div>
        <div class="module-title">考试倒计时</div>
        <div class="module-subtitle">证书考试 & 重要考试剩余天数</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddCountdownModal()">➕ 添加考试</button>
      </div>
    </div>

    ${sorted.length > 0 ? `<div class="grid-2">` + sorted.map(c => {
      const days = DB.daysBetween(today, new Date(c.date));
      const isPast = days < 0;
      const colorClass = days <= 30 ? 'text-danger' : days <= 60 ? 'text-warning' : '';
      return `
        <div class="card ${isPast ? '' : ''}" style="${isPast ? 'opacity:0.6' : ''}">
          <div class="flex justify-between items-center">
            <div>
              <div class="font-semibold" style="font-size:16px">${esc(c.name)}</div>
              <div class="text-sm text-light mt-2">${c.date}</div>
              <span class="tag ${c.type === 'cert' ? 'tag-mauve' : 'tag-sage'}">${c.type === 'cert' ? '证书考试' : '普通考试'}</span>
            </div>
            <div class="text-center">
              <div class="font-bold ${colorClass}" style="font-size:36px">${isPast ? '已过' : days}</div>
              ${!isPast ? '<div class="text-xs text-light">天后</div>' : ''}
            </div>
          </div>
          <div class="flex gap-2 mt-3">
            <button class="btn btn-sm btn-secondary" onclick="deleteCountdown('${c.id}')">删除</button>
          </div>
        </div>
      `;
    }).join('') + `</div>` : '<div class="empty-state"><div class="empty-state-icon">⏰</div><div class="empty-state-text">暂无倒计时，点击上方添加</div></div>'}
  `;
};
Modules.countdown.bindEvents = function() {};
Modules.countdown.init = function() {};

function showAddCountdownModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">考试名称</label>
      <input class="input" id="cdName" placeholder="如：初级会计实务、教师资格证">
    </div>
    <div class="form-group">
      <label class="form-label">考试日期</label>
      <input type="date" class="input" id="cdDate">
    </div>
    <div class="form-group">
      <label class="form-label">类型</label>
      <select class="select" id="cdType">
        <option value="cert">证书考试</option>
        <option value="exam">普通考试</option>
      </select>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addCountdown()">添加</button>`;
  Modal.show('添加考试倒计时', body, footer);
}

function addCountdown() {
  const name = document.getElementById('cdName').value.trim();
  const date = document.getElementById('cdDate').value;
  const type = document.getElementById('cdType').value;
  if (!name || !date) { Toast.show('请填写名称和日期'); return; }
  const data = DB.get('countdown', { list: [] });
  data.list.push({ id: DB.uid(), name, date, type, createdAt: DB.formatDate() });
  DB.set('countdown', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('倒计时已添加');
  switchModule('countdown');
}

function deleteCountdown(id) {
  const data = DB.get('countdown', { list: [] });
  data.list = data.list.filter(c => c.id !== id);
  DB.set('countdown', data);
  switchModule('countdown');
}

// ---------- 5. 排课管理（Canvas图片导出 + 自动延续）----------
Modules.schedule = function() {
  const data = DB.get('schedule', { list: [] });
  const students = DB.get('students', { list: [] }).list;
  const weekStart = App.scheduleWeekStart || getWeekMonday(new Date());

  // 确保已有排课有 weekStart 字段
  data.list.forEach(s => { if (!s.weekStart) s.weekStart = weekStart; });

  // 筛选本周排课
  const weekSlots = data.list.filter(s => s.weekStart === weekStart);

  if (App.scheduleView === 'student') {
    return renderStudentScheduleView(students, weekSlots, weekStart);
  }
  return renderTeacherScheduleView(students, weekSlots, weekStart);
};
Modules.schedule.bindEvents = function() {
  // 学生视图：渲染家长版Canvas预览
  if (App.scheduleView === 'student') {
    const students = DB.get('students', { list: [] }).list;
    if (students.length > 0) {
      const selId = App.selectedStudent || students[0].id;
      const canvas = document.getElementById('parentCanvas_' + selId);
      if (canvas) {
        const weekStart = canvas.dataset.weekstart || getWeekMonday(new Date());
        renderScheduleToCanvas(canvas, weekStart, selId);
      }
    }
  }
};
function renderTeacherScheduleView(students, weekSlots, weekStart) {
  const weekDays = ['周一','周二','周三','周四','周五','周六','周日'];

  // 计算周范围
  const monDate = new Date(weekStart);
  const sunDate = new Date(monDate);
  sunDate.setDate(sunDate.getDate() + 6);
  const weekRange = `${DB.formatDate(monDate, 'YYYY年MM月DD日')} — ${DB.formatDate(sunDate, 'MM月DD日')}`;

  // ---- 固定标准时段 8:00-21:00，课程超出范围时自动延展 ----
  // 这样"没课的时间段"也会完整呈现；不规则时间（如 07:30 / 22:00）也能显示
  const BASE_START = 8, BASE_END = 21;
  let minHour = BASE_START, maxHour = BASE_END;
  weekSlots.forEach(s => {
    const sh = parseInt((s.startTime || '').split(':')[0]);
    const ep = (s.endTime || '').split(':');
    const ehRaw = ep[0] ? parseInt(ep[0]) : (isNaN(sh) ? 8 : sh + 1);
    const em = ep[1] ? parseInt(ep[1]) : 0;
    if (!isNaN(sh)) {
      minHour = Math.min(minHour, sh);
      maxHour = Math.max(maxHour, isNaN(ehRaw) ? sh + 1 : ehRaw + (em > 0 ? 1 : 0));
    }
  });
  minHour = Math.max(7, Math.min(minHour, BASE_START));   // 不早于 7 点
  maxHour = Math.min(23, Math.max(maxHour, BASE_END));    // 不晚于 23 点

  const slotStartH = (slot) => { const h = parseInt((slot.startTime || '').split(':')[0]); return isNaN(h) ? 8 : h; };
  const slotEndH = (slot) => {
    const eh = slot.endTime ? parseInt(slot.endTime.split(':')[0]) : slotStartH(slot) + 1;
    return isNaN(eh) ? slotStartH(slot) + 1 : eh;
  };

  // 按 天_起始小时 分组
  const slotsByDayStart = {};
  weekSlots.forEach(s => {
    const key = `${s.dayOfWeek}_${slotStartH(s)}`;
    if (!slotsByDayStart[key]) slotsByDayStart[key] = [];
    slotsByDayStart[key].push(s);
  });
  // 记录某天某小时行是否被上方跨行块覆盖（避免重复渲染）
  const dayBusyUntil = {};

  // 整行无课的小时集合（用于压缩空时段）
  const occupiedHours = new Set();
  weekSlots.forEach(s => { for (let h = slotStartH(s); h < slotEndH(s); h++) occupiedHours.add(h); });

  // ---- 构建HTML表格 ----
  let tableHTML = '<table class="schedule-table"><thead><tr><th>时间</th>';
  weekDays.forEach((d, i) => {
    const dayDate = new Date(monDate);
    dayDate.setDate(dayDate.getDate() + i);
    const dateLabel = `${dayDate.getMonth() + 1}/${dayDate.getDate()}`;
    tableHTML += `<th><div class="th-weekday">${d}</div><div class="th-date">${dateLabel}</div></th>`;
  });
  tableHTML += '</tr></thead><tbody>';

  for (let h = minHour; h < maxHour; h++) {
    const rowCls = occupiedHours.has(h) ? '' : ' class="empty-row"';
    tableHTML += `<tr${rowCls}><td class="time-col">${String(h).padStart(2,'0')}:00-${String(h + 1).padStart(2,'0')}:00</td>`;
    for (let day = 1; day <= 7; day++) {
      if (dayBusyUntil[day] && dayBusyUntil[day] > h) continue; // 被上方跨行块覆盖，跳过
      const key = `${day}_${h}`;
      const slots = slotsByDayStart[key] || [];
      if (slots.length > 0) {
        const dur = Math.max(1, ...slots.map(s => slotEndH(s) - slotStartH(s)));
        dayBusyUntil[day] = h + dur;
        // 课程块撑满整格（含跨多行的 2 小时课），不再留白半截
        const slotH = Math.max(40, Math.round((dur * 48 - 6 * (slots.length - 1)) / slots.length));
        tableHTML += `<td rowspan="${dur}" style="padding:3px;vertical-align:top">`;
        tableHTML += `<div style="display:flex;flex-direction:column;gap:3px;height:100%;box-sizing:border-box">`;
        slots.forEach(slot => {
          const statusClass = `slot-${slot.status}`;
          const studentColor = getStudentColor(slot.studentName);
          // 主色块 = 学生色；状态用配色标注（左上圆点 + 文字），与导出图例同色
          const statusDot = { pending:'#6A9B5A', done:'#9AA09A', changed:'#C8A040', leave:'#B07080' }[slot.status] || '#9AA09A';
          const statusText = { pending:'待上课', done:'已上完', changed:'已调课', leave:'请假' }[slot.status] || '';
          tableHTML += `<div class="schedule-slot ${statusClass}" onclick="editScheduleSlot('${slot.id}')" style="flex:1;min-height:${slotH}px;margin:0;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;overflow:hidden;padding:4px 6px;background:${studentColor}">
            <div style="display:flex;align-items:center;gap:4px">
              <span style="width:9px;height:9px;border-radius:50%;background:${statusDot};display:inline-block;flex:none;box-shadow:0 0 0 1px rgba(0,0,0,0.12)"></span>
              <span class="slot-student-name" style="font-weight:600;font-size:11px;color:#3A3A3A">${esc(slot.studentName)}</span>
            </div>
            <div style="font-size:10px;color:#5A5A5A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(slot.subject || '')} · ${slot.startTime}-${slot.endTime || ''}</div>
            ${statusText ? `<div style="font-size:9px;color:${statusDot};font-weight:600">${statusText}</div>` : ''}
          </div>`;
        });
        tableHTML += `</div></td>`;
      } else {
        const defaultTime = String(h).padStart(2,'0') + ':00';
        tableHTML += `<td class="empty-slot" style="cursor:pointer" onclick="addScheduleSlot(${day}, '${defaultTime}')"><span class="add-hint">+</span></td>`;
      }
    }
    tableHTML += '</tr>';
  }
  tableHTML += '</tbody></table>';
  tableHTML = `<div class="sch-desktop"><div class="schedule-scroll">${tableHTML}</div></div>`;

  // ===== 手机端：固定6时段紧凑表（早中晚各两节，课程时间按真实起止显示）=====
  const BASE_BLOCKS = [
    { label: '早①', time: '08:00-10:00', start: '08:00', end: '10:00' },
    { label: '早②', time: '10:00-12:00', start: '10:00', end: '12:00' },
    { label: '午①', time: '14:00-16:00', start: '14:00', end: '16:00' },
    { label: '午②', time: '16:00-18:00', start: '16:00', end: '18:00' },
    { label: '晚①', time: '19:00-21:00', start: '19:00', end: '21:00' },
  ];
  // 晚②：有课才显示
  const hasEvening2 = weekSlots.some(s => (s.startTime || '') >= '21:00');
  const FIXED_BLOCKS = hasEvening2
    ? [...BASE_BLOCKS, { label: '晚②', time: '21:00-23:00', start: '21:00', end: '23:00' }]
    : BASE_BLOCKS;

  // 构建 block → day → slot[] 映射（同一天同一 block 可有多节课）
  const blockSlots = FIXED_BLOCKS.map(block => {
    const map = {};
    weekSlots.forEach(s => {
      const st = s.startTime || '00:00';
      if (st >= block.start && st < block.end) {
        if (!map[s.dayOfWeek]) map[s.dayOfWeek] = [];
        map[s.dayOfWeek].push(s);
      }
    });
    return map;
  });

  const isLandscape = !!App.scheduleLandscape;
  let mobileHTML = `<div class="sch-mobile${isLandscape ? ' sch-landscape' : ''}">`;

  // 横屏切换
  mobileHTML += `<div class="sch-mode-toggle">
    <button class="btn btn-sm ${isLandscape ? 'btn-primary' : 'btn-secondary'}" onclick="App.scheduleLandscape=${!isLandscape};switchModule('schedule')">📱 ${isLandscape ? '退出横屏' : '横屏模式'}</button>
  </div>`;

  if (weekSlots.length === 0) {
    mobileHTML += '<div class="sch-compact-empty-state">本周暂无排课<br><button class="btn btn-sm btn-primary" style="margin-top:10px" onclick="addScheduleSlot(1,\'\')">+ 添加排课</button></div>';
  } else {
    // 7 列（无左侧标签列）
    mobileHTML += '<table class="sch-compact-table sch-fixed-blocks"><thead><tr>';
    weekDays.forEach((d, i) => {
      const dayDate = new Date(monDate); dayDate.setDate(dayDate.getDate() + i);
      mobileHTML += `<th>${d}<br><span class="sch-compact-date">${dayDate.getMonth()+1}/${dayDate.getDate()}</span></th>`;
    });
    mobileHTML += '</tr></thead><tbody>';

    FIXED_BLOCKS.forEach((block, bi) => {
      // 时段分隔行
      if (bi === 0) {
        mobileHTML += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">上 午</span></td></tr>';
      } else if (bi === 2) {
        mobileHTML += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">下 午</span></td></tr>';
      } else if (bi === 4) {
        mobileHTML += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">晚 上</span></td></tr>';
      }

      mobileHTML += '<tr class="sch-block-row">';
      const slots = blockSlots[bi];
      for (let day = 1; day <= 7; day++) {
        const cellList = slots[day];
        if (cellList && cellList.length) {
          let cellHTML = '';
          cellList.forEach(slot => {
            const studentColor = getStudentColor(slot.studentName);
            const isDone = slot.status === 'done';
            const opacity = isDone ? '0.5' : '1';
            const statusDot = { pending:'#6A9B5A', done:'#9AA09A', changed:'#C8A040', leave:'#B07080' }[slot.status] || '#9AA09A';
            cellHTML += `<div class="sch-compact-cell" style="background:${studentColor};opacity:${opacity}" onclick="editScheduleSlot('${slot.id}')">
              <div class="sch-compact-name">${esc(slot.studentName)} <span class="sch-compact-dot" style="background:${statusDot}"></span></div>
              <div class="sch-compact-info">${slot.startTime}-${slot.endTime || ''} ${esc(slot.subject || '')}</div>
            </div>`;
          });
          mobileHTML += `<td class="sch-compact-td">${cellHTML}</td>`;
        } else {
          mobileHTML += `<td class="sch-compact-td sch-compact-empty" onclick="addScheduleSlot(${day},'${block.start}')">+</td>`;
        }
      }
      mobileHTML += '</tr>';
    });
    mobileHTML += '</tbody></table>';
    mobileHTML += `<div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-light)">
      <button class="btn btn-sm btn-primary" onclick="exportScheduleCanvas('teacher', '${weekStart}')">📥 导出图片</button>
    </div>`;
  }
  mobileHTML += '</div>';
  // 横屏退出按钮改由 switchModule 统一在 body 层级创建，避免被旋转容器/系统栏遮挡

  // 统计
  const totalClasses = weekSlots.length;
  const doneCount = weekSlots.filter(s => s.status === 'done').length;
  const changedCount = weekSlots.filter(s => s.status === 'changed').length;
  const leaveCount = weekSlots.filter(s => s.status === 'leave').length;
  const uniqueStudents = new Set(weekSlots.map(s => s.studentName)).size;

  // 学生色板图例
  const studentSet = [...new Set(weekSlots.map(s => s.studentName))];
  let legendHTML = '';
  studentSet.forEach(name => {
    if (!name) return;
    const color = getStudentColor(name);
    legendHTML += `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px">
      <span style="width:12px;height:12px;border-radius:50%;background:${color};display:inline-block"></span> ${esc(name)}
    </span>`;
  });

  return `
    <div class="module-header">
      <div>
        <div class="module-title">排课管理</div>
        <div class="module-subtitle">教师视图（自用） · ${weekRange}</div>
      </div>
      <div class="module-actions">
        <div class="segmented">
          <button class="${App.scheduleView === 'week' ? 'active' : ''}" onclick="App.scheduleView='week';App.scheduleWeekStart='${weekStart}';switchModule('schedule')">教师视图</button>
          <button class="${App.scheduleView === 'student' ? 'active' : ''}" onclick="App.scheduleView='student';switchModule('schedule')">学生视图</button>
        </div>
      </div>
    </div>

    <!-- 学生名单快速管理 -->
    <div class="card" style="margin-bottom:12px">
      <div class="flex justify-between items-center" style="cursor:pointer" onclick="toggleStudentList()">
        <div class="card-title" style="margin-bottom:0">👥 学生名单（${students.length}人）</div>
        <span style="font-size:12px;color:var(--color-secondary)">展开管理 ▼</span>
      </div>
      <div id="studentListPanel" style="display:none;margin-top:12px">
        ${students.length === 0 ? '<div class="text-light text-sm">暂无学生，请在下方添加</div>' : students.map(s => `
          <div class="flex justify-between items-center p-2" style="border-bottom:1px solid var(--border-light)">
            <span class="flex items-center gap-2"><span style="width:14px;height:14px;border-radius:50%;background:${getStudentColor(s.name)};display:inline-block"></span><span class="font-semibold">${esc(s.name)}</span></span>
            <span class="text-sm text-secondary">${esc(s.phone || '')}</span>
            <div class="flex gap-2">
              <button class="btn btn-xs btn-secondary" onclick="editStudent('${s.id}')">✏️ 编辑</button>
              <button class="btn btn-xs btn-danger" onclick="deleteStudent('${s.id}')">🗑</button>
            </div>
          </div>
        `).join('')}
        <button class="btn btn-sm btn-primary mt-2" onclick="addStudent()">➕ 添加学生</button>
      </div>
    </div>

    <!-- 周导航条 -->
    <div class="schedule-weekbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <div class="weekbar-nav" style="display:flex;align-items:center;gap:8px;width:100%">
        <button class="btn btn-sm btn-icon" onclick="changeScheduleWeek(-7)">◀</button>
        <span class="weekbar-title" style="flex:1;text-align:center;font-weight:600;font-size:15px">${weekRange}</span>
        <button class="btn btn-sm btn-icon" onclick="changeScheduleWeek(7)">▶</button>
      </div>
      <div class="weekbar-actions" style="display:flex;gap:8px;width:100%;flex-wrap:wrap">
        <button class="btn btn-sm btn-secondary" onclick="changeScheduleWeek(0)">📍 本周</button>
        <button class="btn btn-sm btn-secondary" onclick="manualCopySchedule()">📋 从上周复制</button>
        <button class="btn btn-sm btn-primary" onclick="addScheduleSlot(1,'')">➕ 添加排课</button>
      </div>
    </div>

    <div class="card">
      <div class="flex justify-between items-center mb-3">
        <div class="card-title" style="margin-bottom:0">📋 本周排课表</div>
        <div class="flex gap-2">
          <button class="btn btn-sm btn-danger" onclick="cleanupOrphanSchedule()">🧹 清理无学生排课</button>
          <button class="btn btn-sm btn-primary" onclick="exportScheduleCanvas('teacher', '${weekStart}')">📸 导出图片</button>
        </div>
      </div>
      ${tableHTML}
      ${mobileHTML}
      <div class="flex gap-3 mt-3 text-xs text-light flex-wrap">
        <span>🟢 待上课</span><span>⚪ 已上完</span><span>🟡 调课</span><span>🔴 请假</span>
      </div>
    </div>

    <div class="card mt-3">
      <div class="card-title">📊 本周统计</div>
      <div class="grid-4">
        <div class="stat-item"><div class="stat-value">${totalClasses}</div><div class="stat-label">总课时</div></div>
        <div class="stat-item"><div class="stat-value">${uniqueStudents}</div><div class="stat-label">学生数</div></div>
        <div class="stat-item"><div class="stat-value">${doneCount}</div><div class="stat-label">已上完</div></div>
        <div class="stat-item"><div class="stat-value">${changedCount + leaveCount}</div><div class="stat-label">调课/请假</div></div>
      </div>
      ${legendHTML ? `<div style="margin-top:12px;font-size:12px">📌 科目色板：${legendHTML}</div>` : ''}
    </div>
  `;
}

// ---------- 学生版排课视图（家长版）----------
function renderStudentScheduleView(students, weekSlots, weekStart) {
  const monDate = new Date(weekStart);
  const sunDate = new Date(monDate);
  sunDate.setDate(sunDate.getDate() + 6);
  const weekRange = `${DB.formatDate(monDate, 'YYYY年MM月DD日')} — ${DB.formatDate(sunDate, 'MM月DD日')}`;

  if (students.length === 0) {
    return `
      <div class="module-header">
        <div><div class="module-title">排课管理</div><div class="module-subtitle">学生视图（对外展示）</div></div>
        <div class="module-actions">
          <div class="segmented">
            <button onclick="App.scheduleView='week';switchModule('schedule')">教师视图</button>
            <button class="active">学生视图</button>
          </div>
        </div>
      </div>
      <div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">请先在"排课管理"中添加学生</div></div>
    `;
  }

  const selId = App.selectedStudent || students[0].id;
  const selected = students.find(s => s.id === selId) || students[0];

  // 该生本周排课（优先按 studentId 匹配，防止姓名乱码后看不到课）
  const studentSlots = weekSlots.filter(s =>
    (s.studentId && s.studentId === selected.id) || s.studentName === selected.name
  );
  studentSlots.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));

  // 周导览
  let navHTML = '<div class="schedule-weekbar" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
  navHTML += `<div class="weekbar-nav" style="display:flex;align-items:center;gap:8px;width:100%">`;
  navHTML += `<button class="btn btn-sm btn-icon" onclick="changeScheduleWeek(-7)">◀</button>`;
  navHTML += `<span class="weekbar-title" style="flex:1;text-align:center;font-weight:600;font-size:15px">${weekRange}</span>`;
  navHTML += `<button class="btn btn-sm btn-icon" onclick="changeScheduleWeek(7)">▶</button>`;
  navHTML += `</div>`;
  navHTML += `<div class="weekbar-actions" style="display:flex;gap:8px;width:100%;flex-wrap:wrap">`;
  navHTML += `<button class="btn btn-sm btn-secondary" onclick="changeScheduleWeek(0)">📍 本周</button>`;
  navHTML += `</div>`;
  navHTML += '</div>';

  let studentListHTML = '<div class="flex gap-2 flex-wrap mb-3">';
  students.forEach(s => {
    const active = s.id === selId ? 'btn-primary' : 'btn-secondary';
    studentListHTML += `<button class="btn btn-sm ${active}" onclick="App.selectedStudent='${s.id}';switchModule('schedule')">${esc(s.name)}</button>`;
  });
  studentListHTML += '</div>';

  // 家长版Canvas预览区域
  const previewId = 'parentPreview_' + selected.id.replace(/[^a-zA-Z0-9]/g,'');

  // 分享文本
  const weekDays = ['周一','周二','周三','周四','周五','周六','周日'];
  let shareText = `【${esc(selected.name)}同学 排课表】\n${weekRange}\n`;
  weekDays.forEach((dayName, idx) => {
    const dayNum = idx + 1;
    const daySlots = studentSlots.filter(s => s.dayOfWeek === dayNum);
    if (daySlots.length > 0) {
      shareText += `\n${dayName}：\n`;
      daySlots.forEach(c => {
        shareText += `  ${c.startTime}-${c.endTime} ${c.subject || ''}\n`;
      });
    }
  });
  shareText += `\n如有调整请提前联系，谢谢配合！`;

  return `
    <div class="module-header">
      <div><div class="module-title">排课管理</div><div class="module-subtitle">学生视图（对外展示） · ${weekRange}</div></div>
      <div class="module-actions">
        <div class="segmented">
          <button onclick="App.scheduleView='week';switchModule('schedule')">教师视图</button>
          <button class="active">学生视图</button>
        </div>
      </div>
    </div>
    ${navHTML}
    ${studentListHTML}

    <!-- 手机端：学生视图紧凑表，只显示学科+时间 -->
    <div class="sch-mobile${App.scheduleLandscape ? ' sch-landscape' : ''}">
      <div class="card">
        <div class="flex justify-between items-center" style="margin-bottom:8px">
          <div class="card-title" style="margin-bottom:0">📋 ${esc(selected.name)} 本周课程</div>
          <div style="display:flex;gap:6px;flex:none">
            <button class="btn btn-sm btn-secondary" onclick="addStudentExtraSlot('${selected.id}','${esc(selected.name)}')" style="padding:4px 8px;font-size:11px">➕ 加课</button>
            <button class="btn btn-sm ${App.scheduleLandscape ? 'btn-primary' : 'btn-secondary'}" onclick="App.scheduleLandscape=${!App.scheduleLandscape};switchModule('schedule')" style="padding:4px 8px;font-size:11px">📱 ${App.scheduleLandscape ? '退出横屏' : '横屏'}</button>
          </div>
        </div>
        ${(() => {
          const weekDays2 = ['周一','周二','周三','周四','周五','周六','周日'];
          const stSlots = weekSlots.filter(s =>
            (s.studentId && s.studentId === selected.id) || s.studentName === selected.name
          );
          // 学生视图专属加课（独立存储，不影响教师视图/结算）
          const extraAll = DB.get('studentExtra', { list: [] }).list;
          const stExtras = extraAll.filter(e => e.studentId === selected.id && e.weekStart === weekStart);

          const BASE_BLOCKS2 = [
            { label: '早①', time: '08:00-10:00', start: '08:00', end: '10:00' },
            { label: '早②', time: '10:00-12:00', start: '10:00', end: '12:00' },
            { label: '午①', time: '14:00-16:00', start: '14:00', end: '16:00' },
            { label: '午②', time: '16:00-18:00', start: '16:00', end: '18:00' },
            { label: '晚①', time: '19:00-21:00', start: '19:00', end: '21:00' },
          ];
          const hasEve2 = stSlots.some(s => (s.startTime || '') >= '21:00') || stExtras.some(e => (e.startTime || '') >= '21:00');
          const FIXED_BLOCKS2 = hasEve2
            ? [...BASE_BLOCKS2, { label: '晚②', time: '21:00-23:00', start: '21:00', end: '23:00' }]
            : BASE_BLOCKS2;

          // 每个 block 每天一个数组：常规课 + 加课（可多条共存）
          const blockSlots2 = FIXED_BLOCKS2.map(block => {
            const map = {};
            stSlots.forEach(s => {
              const st = s.startTime || '00:00';
              if (st >= block.start && st < block.end) {
                if (!map[s.dayOfWeek]) map[s.dayOfWeek] = [];
                map[s.dayOfWeek].push({ ...s, _extra: false });
              }
            });
            stExtras.forEach(e => {
              const st = e.startTime || '00:00';
              if (st >= block.start && st < block.end) {
                if (!map[e.dayOfWeek]) map[e.dayOfWeek] = [];
                map[e.dayOfWeek].push({ ...e, _extra: true });
              }
            });
            return map;
          });

          const addBar = '<div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px solid var(--border-light);display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'
            + `<button class="btn btn-sm btn-secondary" onclick="addStudentExtraSlot('${selected.id}','${esc(selected.name)}')">➕ 加其他课程</button>`
            + `<button class="btn btn-sm btn-primary" onclick="exportScheduleCanvas('parent', '${weekStart}', '${selected.id}')">📥 导出图片</button>`
            + `<button class="btn btn-sm btn-secondary copy-btn" onclick='copyToClipboard(${JSON.stringify(shareText)});this.classList.add("copied");setTimeout(()=>this.classList.remove("copied"),1500)'>📋 复制文本</button>`
            + '</div>';

          if (stSlots.length === 0 && stExtras.length === 0) {
            return '<div class="sch-compact-empty-state">本周暂无排课，可点下方「加其他课程」补充</div>' + addBar;
          }

          let mh = '<table class="sch-compact-table sch-fixed-blocks"><thead><tr>';
          weekDays2.forEach((d, i) => {
            const dd = new Date(monDate); dd.setDate(dd.getDate() + i);
            mh += `<th>${d}<br><span class="sch-compact-date">${dd.getMonth()+1}/${dd.getDate()}</span></th>`;
          });
          mh += '</tr></thead><tbody>';

          FIXED_BLOCKS2.forEach((block, bi) => {
            if (bi === 0) {
              mh += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">上 午</span></td></tr>';
            } else if (bi === 2) {
              mh += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">下 午</span></td></tr>';
            } else if (bi === 4) {
              mh += '<tr class="sch-period-sep"><td colspan="7"><span class="sch-period-label">晚 上</span></td></tr>';
            }

            mh += '<tr class="sch-block-row">';
            const slots = blockSlots2[bi];
            for (let day = 1; day <= 7; day++) {
              const cellList = slots[day];
              if (cellList && cellList.length) {
                let cellHTML = '';
                cellList.forEach(slot => {
                  if (slot._extra) {
                    // 加课：虚线边框浅色块，点按可删除
                    cellHTML += `<div class="sch-compact-cell sch-extra-cell" onclick="deleteStudentExtraSlot('${slot.id}')" title="点按删除此加课">
                      <div class="sch-compact-name">➕${esc(slot.subject || '加课')}</div>
                      <div class="sch-compact-info">${slot.startTime}-${slot.endTime || ''}</div>
                    </div>`;
                  } else {
                    const studentColor = getStudentColor(slot.studentName);
                    const isDone = slot.status === 'done';
                    const opacity = isDone ? '0.5' : '1';
                    const statusDot = { pending:'#6A9B5A', done:'#9AA09A', changed:'#C8A040', leave:'#B07080' }[slot.status] || '#9AA09A';
                    cellHTML += `<div class="sch-compact-cell" style="background:${studentColor};opacity:${opacity}">
                      <div class="sch-compact-name"><span class="sch-compact-dot" style="background:${statusDot}"></span>${esc(slot.subject || '')}</div>
                      <div class="sch-compact-info">${slot.startTime}-${slot.endTime || ''}</div>
                    </div>`;
                  }
                });
                mh += `<td class="sch-compact-td">${cellHTML}</td>`;
              } else {
                mh += '<td class="sch-compact-td sch-compact-empty">+</td>';
              }
            }
            mh += '</tr>';
          });
          mh += '</tbody></table>';
          mh += addBar;
          return mh;
        })()}
      </div>
    </div>
    <!-- 横屏退出按钮由 switchModule 统一在 body 层级创建 -->

    <div class="sch-desktop grid-2">
      <div class="card">
        <div class="flex justify-between items-center mb-3">
          <div class="card-title" style="margin-bottom:0">📸 ${esc(selected.name)} 排课预览</div>
          <button class="btn btn-sm btn-primary" onclick="exportScheduleCanvas('parent', '${weekStart}', '${selected.id}')">📥 保存图片</button>
        </div>
        <div id="${previewId}" style="width:100%;overflow-x:auto">
          <canvas id="parentCanvas_${selected.id}" style="width:100%;max-width:800px;height:auto;border-radius:8px;border:1px solid var(--border)" data-weekstart="${weekStart}" data-studentid="${selected.id}"></canvas>
        </div>
        ${studentSlots.length === 0 ? '<div class="empty-state" style="padding:20px"><div class="empty-state-text">该生本周暂无排课</div></div>' : ''}
      </div>

      <div class="card">
        <div class="card-title">📤 分享文本</div>
        <div class="lesson-doc" style="font-size:13px">${esc(shareText)}</div>
        <div class="flex gap-2 mt-3">
          <button class="btn btn-primary copy-btn" onclick='copyToClipboard(${JSON.stringify(shareText)});this.classList.add("copied");setTimeout(()=>this.classList.remove("copied"),1500)'>📋 复制文本</button>
        </div>
      </div>
    </div>
  `;
}

// ---------- 周切换 ----------
function changeScheduleWeek(delta) {
  if (delta === 0) {
    App.scheduleWeekStart = getWeekMonday(new Date());
  } else {
    const d = new Date(App.scheduleWeekStart);
    d.setDate(d.getDate() + delta);
    App.scheduleWeekStart = getWeekMonday(d);
  }
  // 自动延续
  const didContinue = autoContinueSchedule(App.scheduleWeekStart);
  if (didContinue) Toast.show('已自动从上周复制排课');
  switchModule('schedule');
}

function manualCopySchedule() {
  const curWeek = App.scheduleWeekStart;
  const schedule = DB.get('schedule', { list: [], lastAutoWeek: '' });

  // 检查当前周是否已有数据
  const hasData = schedule.list.some(s => s.weekStart === curWeek);
  if (hasData) {
    if (!confirm('当前周已有排课数据，覆盖前的内容将丢失。确定从上周复制？')) return;
    // 删掉当前周数据
    schedule.list = schedule.list.filter(s => s.weekStart !== curWeek);
  }

  // 强制延续
  schedule.lastAutoWeek = '';
  DB.set('schedule', schedule);
  const ok = autoContinueSchedule(curWeek);
  Toast.show(ok ? '已从上周复制排课' : '上周无排课数据可复制');
  switchModule('schedule');
}

// 截断Canvas文本，确保不超出方框
function truncateCanvasText(ctx, text, maxWidth) {
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 0 && ctx.measureText(t + '…').width > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

// ---------- 排课Canvas渲染 ----------
function renderScheduleToCanvas(canvas, weekStart, studentId) {
  const schedule = DB.get('schedule', { list: [] });
  const weekSlots = schedule.list.filter(s => s.weekStart === weekStart);
  const students = DB.get('students', { list: [] }).list;

  const isParent = !!studentId;
  let displaySlots = weekSlots;
  let title = '一周排课总览（教师版）';
  let subTitle = '';

  if (isParent) {
    const stu = students.find(s => s.id === studentId);
    if (stu) {
      displaySlots = weekSlots.filter(s =>
        (s.studentId && s.studentId === stu.id) || s.studentName === stu.name
      );
      title = `${stu.name}同学 一周课程安排`;
      // 合并学生视图专属加课（虚线块显示，不影响教师视图数据）
      const extras = DB.get('studentExtra', { list: [] }).list
        .filter(e => e.studentId === studentId && e.weekStart === weekStart)
        .map(e => ({ ...e, _extra: true, status: 'pending' }));
      displaySlots = displaySlots.concat(extras);
    }
  }

  const monDate = new Date(weekStart);
  const sunDate = new Date(monDate);
  sunDate.setDate(sunDate.getDate() + 6);
  const weekRange = `${DB.formatDate(monDate, 'YYYY/MM/DD')} — ${DB.formatDate(sunDate, 'MM/DD')}`;

  const weekDays = ['周一','周二','周三','周四','周五','周六','周日'];

  // ---- 固定标准时段 8:00-21:00，课程超出时自动延展 ----
  const BASE_START = 8, BASE_END = 21;
  let minHour = BASE_START, maxHour = BASE_END;
  displaySlots.forEach(s => {
    const sh = parseInt((s.startTime || '').split(':')[0]);
    const ep = (s.endTime || '').split(':');
    const ehRaw = ep[0] ? parseInt(ep[0]) : (isNaN(sh) ? 8 : sh + 1);
    const em = ep[1] ? parseInt(ep[1]) : 0;
    if (!isNaN(sh)) {
      minHour = Math.min(minHour, sh);
      maxHour = Math.max(maxHour, isNaN(ehRaw) ? sh + 1 : ehRaw + (em > 0 ? 1 : 0));
    }
  });
  minHour = Math.max(7, Math.min(minHour, BASE_START));
  maxHour = Math.min(23, Math.max(maxHour, BASE_END));
  const hourRows = [];
  for (let h = minHour; h < maxHour; h++) hourRows.push(h);

  const slotStartH = (slot) => { const h = parseInt((slot.startTime || '').split(':')[0]); return isNaN(h) ? 8 : h; };
  const slotEndH = (slot) => {
    const eh = slot.endTime ? parseInt(slot.endTime.split(':')[0]) : slotStartH(slot) + 1;
    return isNaN(eh) ? slotStartH(slot) + 1 : eh;
  };

  // 行模型：有课的小时行高正常，无课的小时行压缩（缩小空白空间）
  const FULL_ROW_H = 36;
  const EMPTY_ROW_H = 12;
  const hourOccupied = {};
  hourRows.forEach(h => { hourOccupied[h] = displaySlots.some(s => slotStartH(s) <= h && slotEndH(s) > h); });
  const rowHOf = (h) => hourOccupied[h] ? FULL_ROW_H : EMPTY_ROW_H;
  const hourY = {};
  let _cum = 0;
  hourRows.forEach(h => { hourY[h] = _cum; _cum += rowHOf(h); });
  const contentH = _cum;

  // 占用格（用于周末无课虚框）
  const occupiedCells = {};
  displaySlots.forEach(s => {
    for (let h = slotStartH(s); h < slotEndH(s); h++) occupiedCells[`${s.dayOfWeek}_${h}`] = true;
  });

  // Canvas尺寸（按小时行数，紧凑布局）
  const DPR = 2;
  const canvasWidth = 720;
  const leftMargin = 60;
  const colWidth = 90;
  const headerH = 36;
  const titleH = 80;
  const legendH = isParent ? 40 : 56;
  const statsH = 40;
  const rowCount = hourRows.length;
  const totalWidth = leftMargin + colWidth * 7;
  const totalHeight = titleH + headerH + contentH + legendH + statsH + 30;

  canvas.width = totalWidth * DPR;
  canvas.height = totalHeight * DPR;
  canvas.style.width = totalWidth + 'px';
  canvas.style.height = totalHeight + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);

  // 背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  // 顶部分隔线
  ctx.fillStyle = '#9BA88B';
  ctx.fillRect(0, 0, totalWidth, 4);

  // 标题
  ctx.fillStyle = '#3A3A3A';
  ctx.font = 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(title, leftMargin, 28);

  ctx.fillStyle = '#888888';
  ctx.font = '11px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(weekRange, leftMargin, 46);

  // 学期标签
  const year = monDate.getFullYear();
  const month = monDate.getMonth() + 1;
  const semester = month >= 2 && month <= 7 ? '春季学期' : '秋季学期';
  ctx.fillStyle = '#9BA88B';
  ctx.font = '10px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText(`${year}年 ${semester}`, leftMargin, 62);

  // 表格底色
  ctx.fillStyle = '#FAFAF8';
  ctx.fillRect(leftMargin, titleH, colWidth * 7, headerH);
  // 时间列底色
  ctx.fillStyle = '#F5F3F0';
  ctx.fillRect(0, titleH, leftMargin, headerH + contentH);

  // 网格线
  ctx.strokeStyle = '#E5E5E0';
  ctx.lineWidth = 0.5;
  // 竖线
  for (let i = 0; i <= 7; i++) {
    const x = leftMargin + i * colWidth;
    ctx.beginPath();
    ctx.moveTo(x, titleH);
    ctx.lineTo(x, titleH + headerH + contentH);
    ctx.stroke();
  }
  // 横线
  ctx.beginPath();
  ctx.moveTo(0, titleH);
  ctx.lineTo(totalWidth, titleH);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, titleH + headerH);
  ctx.lineTo(totalWidth, titleH + headerH);
  ctx.stroke();
  hourRows.forEach(h => {
    const y2 = titleH + headerH + hourY[h];
    ctx.beginPath();
    ctx.moveTo(0, y2);
    ctx.lineTo(totalWidth, y2);
    ctx.stroke();
  });

  // 表头文字
  ctx.fillStyle = '#555';
  ctx.font = 'bold 10px "PingFang SC","Microsoft YaHei",sans-serif';
  const dateLabel = weekDays.map((d, i) => {
    const d2 = new Date(monDate);
    d2.setDate(d2.getDate() + i);
    return `${d} ${DB.formatDate(d2, 'MM/DD')}`;
  });
  ctx.fillText('时间', 12, titleH + 22);
  for (let i = 0; i < 7; i++) {
    ctx.fillText(dateLabel[i], leftMargin + 6 + colWidth * i, titleH + 22);
  }

  // 时段标签（有课显示时间，无课显示占位，缩小空间）
  hourRows.forEach(h => {
    const yTop = titleH + headerH + hourY[h];
    const rh = rowHOf(h);
    if (hourOccupied[h]) {
      ctx.fillStyle = '#666';
      ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(`${String(h).padStart(2,'0')}:00`, 6, yTop + rh / 2 + 3);
    } else {
      ctx.fillStyle = '#C9C9C4';
      ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText('—', 26, yTop + rh / 2 + 3);
    }
  });

  // 周末无课虚框
  hourRows.forEach(h => {
    const yTop = titleH + headerH + hourY[h];
    const rh = rowHOf(h);
    for (let day = 6; day <= 7; day++) {
      if (occupiedCells[`${day}_${h}`]) continue;
      const x = leftMargin + (day - 1) * colWidth + 4;
      const w = colWidth - 8;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = '#DDD';
      ctx.strokeRect(x, yTop + 4, w, rh - 8);
      ctx.setLineDash([]);
      if (rh >= FULL_ROW_H) {
        ctx.fillStyle = '#CCC';
        ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillText('非上课日', x + w / 2 - 20, yTop + rh / 2);
      }
    }
  });

  // 绘制课程格子（按真实时长跨行，浮点小时精确覆盖起止时间）
  displaySlots.forEach(slot => {
    const sf = parseFloat(slot.startTime) || slotStartH(slot);
    const ef = slot.endTime ? (parseFloat(slot.endTime) || slotEndH(slot)) : sf + 1;
    const day = slot.dayOfWeek;
    const x = leftMargin + (day - 1) * colWidth + 3;
    const w = colWidth - 6;
    const fHour = Math.floor(sf);
    const y = titleH + headerH + hourY[fHour] + (sf - fHour) * rowHOf(fHour) + 3;
    const blockH = Math.max(rowHOf(fHour) - 6, (ef - sf) * FULL_ROW_H - 6);
    const isExtra = slot._extra === true;
    // 颜色：家长版优先科目色，回退学生色；教师版用学生色
    const baseColor = isParent
      ? (getSubjectColor(slot.subject) || getStudentColor(slot.studentName))
      : getStudentColor(slot.studentName);

    // 自适应字体：大块用大字，小块用小字
    const big = blockH >= 48;
    const titleFont = big ? 'bold 13px' : 'bold 11px';
    const subFont = big ? '10px' : '9px';
    const titleY = big ? y + 16 : y + 12;
    const timeY = big ? y + 30 : y + 23;
    const notesY = big ? y + 42 : y + 33;
    const dotR = big ? 4 : 3;
    const dotX = x + 8;
    const dotY = big ? y + 10 : y + 8;
    const textX = x + 16;
    const maxTextW = w - 20;

    if (isExtra) {
      // 加课：浅色背景 + 虚线边框
      ctx.fillStyle = 'rgba(83,74,183,0.08)';
      ctx.fillRect(x, y, w, blockH);
      ctx.strokeStyle = '#534AB7';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, blockH - 1);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = baseColor;
      ctx.fillRect(x, y, w, blockH);
    }

    // 状态标记点
    const statusColors = { pending: '#6A9B5A', done: '#999', changed: '#C8A040', leave: '#B07080' };
    ctx.fillStyle = statusColors[slot.status] || '#999';
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fill();

    // 科目名（大字加粗）
    ctx.fillStyle = isExtra ? '#534AB7' : '#2A2A2A';
    ctx.font = titleFont + ' "PingFang SC","Microsoft YaHei",sans-serif';
    if (isParent) {
      const subjText = (slot.subject || '课程') + (isExtra ? ' ➕' : '');
      ctx.fillText(truncateCanvasText(ctx, subjText, maxTextW), textX, titleY);
    } else {
      const label = slot.studentName + (slot.subject ? ' · ' + slot.subject : '');
      ctx.fillText(truncateCanvasText(ctx, label, maxTextW), textX, titleY);
    }

    // 完整时间段（突出显示）
    ctx.fillStyle = isExtra ? '#7B6FD0' : '#666';
    ctx.font = subFont + ' "PingFang SC","Microsoft YaHei",sans-serif';
    const timeInfo = `${slot.startTime}-${slot.endTime || ''}`;
    ctx.fillText(truncateCanvasText(ctx, timeInfo, maxTextW), textX, timeY);

    // 备注或状态文字
    if (slot.notes) {
      ctx.fillStyle = '#999';
      ctx.font = subFont + ' "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(truncateCanvasText(ctx, slot.notes, maxTextW), textX, notesY);
    } else if (big) {
      // 大格子额外显示状态
      const statusLabels = { pending: '待上课', done: '已上完', changed: '已调课', leave: '请假' };
      ctx.fillStyle = '#999';
      ctx.font = subFont + ' "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(statusLabels[slot.status] || '', textX, notesY);
    }
  });

  // 底部图例
  const legendY = titleH + headerH + contentH + 14;
  if (isParent) {
    ctx.fillStyle = '#999';
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('图例：🟢 待上课  ⚪ 已上完  🟡 调课  🔴 请假', leftMargin, legendY);
  } else {
    const studentSet = [...new Set(displaySlots.map(s => s.studentName).filter(Boolean))];
    ctx.fillStyle = '#999';
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('学生色板：', leftMargin, legendY);
    let lx = leftMargin + 56;
    studentSet.forEach(name => {
      const color = getStudentColor(name);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx + 5, legendY - 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#555';
      ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(name, lx + 13, legendY);
      lx += ctx.measureText(name).width + 30;
    });
    // 第二行：状态图例
    ctx.fillStyle = '#999';
    ctx.font = '9px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('状态：🟢 待上课  ⚪ 已上完  🟡 调课  🔴 请假', leftMargin, legendY + 18);
  }

  // 底部版权
  ctx.fillStyle = '#CCC';
  ctx.font = '8px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.fillText('教培备考工作台 · ' + DB.formatDate(new Date(), 'YYYY-MM-DD'), leftMargin, totalHeight - 10);
}

// ---------- Canvas导出图片 ----------
// 导出时隐藏自定义背景
function hideExportBg() {
  const layer = document.getElementById('customBgLayer');
  if (layer) { layer._prevDisplay = layer.style.display; layer.style.display = 'none'; }
}
function restoreExportBg() {
  const layer = document.getElementById('customBgLayer');
  if (layer) { layer.style.display = layer._prevDisplay || ''; delete layer._prevDisplay; }
}

function exportScheduleCanvas(viewType, weekStart, studentId) {
  hideExportBg();
  try {
  let canvas;
  if (viewType === 'teacher') {
    // 创建临时canvas
    canvas = document.createElement('canvas');
    renderScheduleToCanvas(canvas, weekStart, null);
  } else {
    // 使用已有的预览canvas
    canvas = document.getElementById('parentCanvas_' + studentId);
    if (!canvas) {
      canvas = document.createElement('canvas');
      renderScheduleToCanvas(canvas, weekStart, studentId);
    } else {
      // 重新渲染以确保数据最新
      renderScheduleToCanvas(canvas, weekStart, studentId);
    }
  }

  // 导出为PNG
  const link = document.createElement('a');
  link.download = viewType === 'teacher'
    ? `排课表_教师版_${weekStart}.png`
    : `排课表_家长版_${weekStart}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  Toast.show('图片已下载，可微信发送给家长');
  } finally {
    restoreExportBg();
  }
}

// ---------- 添加/编辑/删除排课 ----------

// 根据 weekStart(周一) + dayOfWeek 计算这节课的实际上课日期
function getSlotActualDate(slot) {
  if (slot.weekStart && slot.dayOfWeek) {
    const d = new Date(slot.weekStart);
    d.setDate(d.getDate() + (slot.dayOfWeek - 1));
    return DB.formatDate(d, 'YYYY-MM-DD');
  }
  return slot.doneDate || slot.date || '';
}

// 根据起止时间计算这节课的课时（小时），例如 19:00-21:30 → 2.5
function calcSlotHours(slot) {
  const start = slot.startTime || '';
  const end = slot.endTime || '';
  if (!start || !end) return 2; // 无时间则兜底 2 小时
  const parse = t => {
    const [h, m] = String(t).split(':').map(Number);
    return { h: isNaN(h) ? 0 : h, m: isNaN(m) ? 0 : m };
  };
  const s = parse(start), e = parse(end);
  const startMin = s.h * 60 + s.m;
  const endMin = e.h * 60 + e.m;
  if (endMin <= startMin) return 2;
  return (endMin - startMin) / 60;
}
// 把小时数格式化为最多两位小数的字符串（2.00→2，2.50→2.5，1.75→1.75）
function formatDecimalHours(h) {
  if (typeof h !== 'number' || isNaN(h)) return '0';
  return h.toFixed(2).replace(/\.00$/, '').replace(/(\.[0-9])0$/, '$1');
}

function addScheduleSlot(day, time) {
  const students = DB.get('students', { list: [] }).list;
  const studentOptions = students.length > 0
    ? students.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')
    : '<option value="">请先在左侧"学生名单"中添加学生</option>';

  // 根据time推断结束时间（默认2小时），若无time则取当前整点
  const defaultStart = time || (String(new Date().getHours()).padStart(2,'0') + ':00');
  const endTime = parseInt(defaultStart.split(':')[0]) + 2;
  const defaultEnd = String(endTime).padStart(2,'0') + ':00';

  const body = `
    <div class="form-group">
      <label class="form-label">学生姓名</label>
      <select class="select" id="schStudent">${studentOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">星期</label>
      <select class="select" id="schDay">
        <option value="1" ${day===1?'selected':''}>周一</option>
        <option value="2" ${day===2?'selected':''}>周二</option>
        <option value="3" ${day===3?'selected':''}>周三</option>
        <option value="4" ${day===4?'selected':''}>周四</option>
        <option value="5" ${day===5?'selected':''}>周五</option>
        <option value="6" ${day===6?'selected':''}>周六</option>
        <option value="7" ${day===7?'selected':''}>周日</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">科目</label>
      <input class="input" id="schSubject" placeholder="如：数学、物理">
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">开始时间</label>
        <input type="time" class="input" id="schStart" value="${defaultStart}">
      </div>
      <div class="form-group">
        <label class="form-label">结束时间</label>
        <input type="time" class="input" id="schEnd" value="${defaultEnd}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">状态</label>
      <select class="select" id="schStatus">
        <option value="pending">待上课</option>
        <option value="done">已上完</option>
        <option value="changed">调课</option>
        <option value="leave">请假</option>
      </select>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveScheduleSlot()">保存</button>`;
  Modal.show('添加排课', body, footer);
}

function saveScheduleSlot() {
  const studentName = document.getElementById('schStudent').value;
  if (!studentName) { Toast.show('请先添加学生'); return; }
  const dayOfWeek = parseInt(document.getElementById('schDay').value);
  const subject = document.getElementById('schSubject').value.trim();
  const startTime = document.getElementById('schStart').value;
  const endTime = document.getElementById('schEnd').value;
  const status = document.getElementById('schStatus').value;
  const weekStart = App.scheduleWeekStart || getWeekMonday(new Date());
  // 根据名字找学生ID，方便后续按ID关联清理
  const students = DB.get('students', { list: [] }).list;
  const stu = students.find(s => s.name === studentName);
  const studentId = stu ? stu.id : '';

  const data = DB.get('schedule', { list: [], lastAutoWeek: '' });
  const actualDate = (() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + (dayOfWeek - 1));
    return DB.formatDate(d, 'YYYY-MM-DD');
  })();
  data.list.push({
    id: DB.uid(), studentId, studentName, dayOfWeek, startTime, endTime,
    subject, status, date: actualDate, notes: '', weekStart
  });
  DB.set('schedule', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('排课已添加');
  switchModule('schedule');
}

function editScheduleSlot(id) {
  const data = DB.get('schedule', { list: [] });
  const slot = data.list.find(s => s.id === id);
  if (!slot) return;

  const body = `
    <div class="form-group">
      <label class="form-label">学生</label>
      <input class="input" value="${esc(slot.studentName)}" disabled>
    </div>
    <div class="form-group">
      <label class="form-label">科目</label>
      <input class="input" id="editSchSubject" value="${esc(slot.subject || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">星期</label>
      <select class="select" id="editSchDay">${[1,2,3,4,5,6,7].map(d => `<option value="${d}" ${d === (slot.dayOfWeek||1) ? 'selected' : ''}>${['周一','周二','周三','周四','周五','周六','周日'][d-1]}</option>`).join('')}</select>
    </div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">开始</label><input type="time" class="input" id="editSchStart" value="${slot.startTime}"></div>
      <div class="form-group"><label class="form-label">结束</label><input type="time" class="input" id="editSchEnd" value="${slot.endTime || ''}"></div>
    </div>
    <div class="form-group">
      <label class="form-label">状态</label>
      <select class="select" id="editSchStatus">
        <option value="pending" ${slot.status==='pending'?'selected':''}>待上课</option>
        <option value="done" ${slot.status==='done'?'selected':''}>已上完</option>
        <option value="changed" ${slot.status==='changed'?'selected':''}>调课</option>
        <option value="leave" ${slot.status==='leave'?'selected':''}>请假</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <textarea class="textarea" id="editSchNotes" placeholder="如：调至周三16:00">${esc(slot.notes || '')}</textarea>
    </div>
  `;
  const footer = `
    <button class="btn btn-danger" onclick="deleteScheduleSlot('${id}')">删除</button>
    <button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
    <button class="btn btn-primary" onclick="updateScheduleSlot('${id}')">保存</button>
  `;
  Modal.show('编辑排课', body, footer);
}

function updateScheduleSlot(id) {
  const data = DB.get('schedule', { list: [] });
  const slot = data.list.find(s => s.id === id);
  if (!slot) return;
  const oldDay = slot.dayOfWeek, oldStart = slot.startTime, oldEnd = slot.endTime;
  const oldActual = getSlotActualDate(slot);

  slot.subject = document.getElementById('editSchSubject').value.trim();
  slot.dayOfWeek = parseInt(document.getElementById('editSchDay').value);
  slot.startTime = document.getElementById('editSchStart').value;
  slot.endTime = document.getElementById('editSchEnd').value;
  slot.status = document.getElementById('editSchStatus').value;
  slot.notes = document.getElementById('editSchNotes').value.trim();

  // 标记"已上完"时记录完成日期（用实际上课日期，而不是今天点标记的日期）
  if (slot.status === 'done') {
    slot.doneDate = getSlotActualDate(slot);
  } else {
    slot.doneDate = null;
  }

  DB.set('schedule', data);
  Modal.close(document.querySelector('.modal-overlay'));

  // 时间或星期有改动 → 询问作用范围（前面的课几乎不改动）
  const changed = slot.dayOfWeek !== oldDay || slot.startTime !== oldStart || slot.endTime !== oldEnd;
  if (changed) {
    promptScheduleChangeRange(slot.id, oldActual);
    return;
  }
  Toast.show('排课已更新');
  switchModule('schedule');
}

// 改上课时间时，选择作用范围（不改动前面的课）
function promptScheduleChangeRange(slotId, thisActualDate) {
  const data = DB.get('schedule', { list: [] });
  const slot = data.list.find(s => s.id === slotId);
  if (!slot) return;
  const todayStr = DB.formatDate(new Date(), 'YYYY-MM-DD');
  const body = `
    <div class="text-sm text-secondary mb-2">已修改「${esc(slot.studentName)} · ${esc(slot.subject || '')}」的上课时间。要应用到哪些课？</div>
    <div class="form-group">
      <label class="form-label">作用范围</label>
      <select class="select" id="rangeMode">
        <option value="this">仅这一节（${esc(thisActualDate)}）</option>
        <option value="after" selected>仅此日期之后的课（前面的不动）</option>
        <option value="all">该生该科目该星期的全部课</option>
        <option value="custom">自定义起止日期</option>
      </select>
    </div>
    <div id="customRange" style="display:none" class="grid-2">
      <div class="form-group"><label class="form-label">从</label><input type="date" class="input" id="rangeFrom" value="${esc(thisActualDate)}"></div>
      <div class="form-group"><label class="form-label">到</label><input type="date" class="input" id="rangeTo" value="${esc(todayStr)}"></div>
    </div>`;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'));switchModule('schedule')">取消</button><button class="btn btn-primary" onclick="applyScheduleChangeRange('${slotId}')">应用</button>`;
  Modal.show('修改作用范围', body, footer);
  const sel = document.getElementById('rangeMode');
  sel.onchange = () => { document.getElementById('customRange').style.display = sel.value === 'custom' ? 'grid' : 'none'; };
}

function applyScheduleChangeRange(slotId) {
  const data = DB.get('schedule', { list: [] });
  const slot = data.list.find(s => s.id === slotId);
  if (!slot) return;
  const mode = document.getElementById('rangeMode').value;
  const targets = data.list.filter(s => s.id !== slot.id && s.studentName === slot.studentName && s.subject === slot.subject && s.dayOfWeek === slot.dayOfWeek);
  let affected = 0;
  targets.forEach(t => {
    const d = getSlotActualDate(t);
    let apply = false;
    if (mode === 'all') apply = true;
    else if (mode === 'after') apply = d >= getSlotActualDate(slot);
    else if (mode === 'custom') {
      const from = document.getElementById('rangeFrom').value;
      const to = document.getElementById('rangeTo').value;
      apply = (!from || d >= from) && (!to || d <= to);
    }
    if (apply) {
      t.startTime = slot.startTime;
      t.endTime = slot.endTime;
      affected++;
    }
  });
  DB.set('schedule', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show(mode === 'this' ? '已更新这一节' : `已同步修改 ${affected} 节课（前面的课未动）`);
  switchModule('schedule');
}

function deleteScheduleSlot(id) {
  const data = DB.get('schedule', { list: [] });
  data.list = data.list.filter(s => s.id !== id);
  DB.set('schedule', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已删除');
  switchModule('schedule');
}

// ---------- 学生视图专属加课（独立存储 studentExtra，不影响教师视图/课时结算）----------
function addStudentExtraSlot(studentId, studentName) {
  const WD = ['周一','周二','周三','周四','周五','周六','周日'];
  const dayChips = WD.map((d, i) =>
    `<label class="day-chip" data-day="${i+1}" onclick="this.classList.toggle('active')">${d}</label>`
  ).join('');
  const body = `
    <div class="text-sm text-secondary mb-3">给 <strong>${esc(studentName)}</strong> 加一节额外课程（如学校课程、其他辅导班）。只显示在学生视图和导出图片里，<strong>不会</strong>出现在你的教师排课表和课时结算中。</div>
    <div class="form-group">
      <label class="form-label">科目名称</label>
      <input class="input" id="extraSubject" placeholder="如：学校自习 / 钢琴课 / 篮球" autocomplete="off">
    </div>
    <div class="form-group">
      <label class="form-label">星期（点选）</label>
      <div class="day-chip-group" id="extraDays">${dayChips}</div>
    </div>
    <div class="grid-2">
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">开始时间</label>
        <input class="input" id="extraStart" type="time" value="16:00">
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label class="form-label">结束时间</label>
        <input class="input" id="extraEnd" type="time" value="18:00">
      </div>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
    <button class="btn btn-primary" onclick="saveStudentExtraSlot('${studentId}','${esc(studentName)}')">保存</button>
  `;
  Modal.show('➕ 加其他课程', body, footer);
}

function saveStudentExtraSlot(studentId, studentName) {
  const subject = document.getElementById('extraSubject').value.trim();
  const start = document.getElementById('extraStart').value;
  const end = document.getElementById('extraEnd').value;
  const dayEls = document.querySelectorAll('#extraDays .day-chip.active');
  if (!subject) { Toast.show('请填写科目名称', 'error'); return; }
  if (!dayEls.length) { Toast.show('请选择星期', 'error'); return; }
  if (!start) { Toast.show('请选择开始时间', 'error'); return; }
  const data = DB.get('studentExtra', { list: [] });
  const weekStart = App.scheduleWeekStart || getWeekMonday(new Date());
  dayEls.forEach(el => {
    data.list.push({
      id: 'extra_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      studentId,
      studentName,
      weekStart,
      dayOfWeek: Number(el.dataset.day),
      startTime: start,
      endTime: end || '',
      subject,
    });
  });
  DB.set('studentExtra', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已添加（仅学生视图可见）');
  switchModule('schedule');
}

function deleteStudentExtraSlot(id) {
  if (!confirm('删除这节加课？（不影响教师排课表）')) return;
  const data = DB.get('studentExtra', { list: [] });
  data.list = data.list.filter(e => e.id !== id);
  DB.set('studentExtra', data);
  Toast.show('已删除');
  switchModule('schedule');
}

// ---------- 学生名单管理（独立于课消）----------
function toggleStudentList() {
  const panel = document.getElementById('studentListPanel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function addStudent() {
  const paletteHTML = STUDENT_COLOR_PALETTE.map((c, i) =>
    `<span class="color-swatch student-swatch" style="background:${c}" data-color="${c}" onclick="selectStudentColor(this,'${c}')" title="色板${i+1}"></span>`
  ).join('');
  const body = `
    <div class="form-group">
      <label class="form-label">学生姓名 *</label>
      <input class="input" id="newStudentName" placeholder="输入学生姓名" autocomplete="off">
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">年级</label>
        <input class="input" id="newStudentGrade" placeholder="如：初二">
      </div>
      <div class="form-group">
        <label class="form-label">学校</label>
        <input class="input" id="newStudentSchool" placeholder="如：实验中学">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">班级</label>
        <input class="input" id="newStudentClass" placeholder="如：英语初二基础班">
      </div>
      <div class="form-group">
        <label class="form-label">家长姓名</label>
        <input class="input" id="newStudentParent" placeholder="如：李伟">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">家长手机</label>
      <input class="input" id="newStudentPhone" placeholder="用于结算备注">
    </div>
    <div class="form-group">
      <label class="form-label">标签（用空格分隔）</label>
      <input class="input" id="newStudentTags" placeholder="如：晚辅 重点学生 薄弱">
    </div>
    <div class="form-group">
      <label class="form-label">学生性格</label>
      <input class="input" id="newStudentPersonality" placeholder="如：活泼开朗 / 内向沉稳 / 思维活跃">
    </div>
    <div class="form-group">
      <label class="form-label">个人色板</label>
      <div class="color-swatch-grid" id="studentColorGrid">${paletteHTML}</div>
      <div class="flex items-center gap-2 mt-2">
        <span class="text-xs text-secondary">自定义：</span>
        <input type="color" class="color-picker" id="studentColorPicker" value="#FFB3BA" onchange="document.querySelectorAll('.student-swatch').forEach(s=>s.classList.remove('active'));document.getElementById('studentColorValue').value=this.value">
        <input type="hidden" id="studentColorValue" value="">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">备注（可选）</label>
      <input class="input" id="newStudentNotes" placeholder="如：数学基础薄弱，需要加强计算能力">
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveNewStudent()">保存</button>`;
  Modal.show('添加学生', body, footer);
}

function saveNewStudent() {
  const name = document.getElementById('newStudentName').value.trim();
  if (!name) { Toast.show('请输入姓名'); return; }
  const colorVal = document.getElementById('studentColorValue').value;
  const tagsInput = document.getElementById('newStudentTags').value.trim();
  const data = DB.get('students', { list: [] });
  data.list.push({
    id: DB.uid(),
    name,
    grade: document.getElementById('newStudentGrade').value.trim(),
    school: document.getElementById('newStudentSchool').value.trim(),
    className: document.getElementById('newStudentClass').value.trim(),
    parentName: document.getElementById('newStudentParent').value.trim(),
    phone: document.getElementById('newStudentPhone').value.trim(),
    notes: document.getElementById('newStudentNotes').value.trim(),
    personality: document.getElementById('newStudentPersonality').value.trim(),
    tags: tagsInput ? tagsInput.split(/\s+/).filter(Boolean) : [],
    color: colorVal || null,
    status: 'active',
    createdAt: DB.formatDate(new Date(), 'YYYY-MM-DD'),
    subjects: [],
    graduation: { enabled: false, targetDate: '' },
  });
  DB.set('students', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('学生已添加');
  switchModule(App.currentModule === 'studentManagement' ? 'studentManagement' : 'schedule');
}

function selectStudentColor(el, color) {
  document.querySelectorAll('.student-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('studentColorValue').value = color;
  document.getElementById('studentColorPicker').value = color;
}

function editStudent(id) {
  const data = DB.get('students', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  const paletteHTML = STUDENT_COLOR_PALETTE.map((c, i) => {
    const active = (s.color === c) ? 'active' : '';
    return `<span class="color-swatch student-swatch ${active}" style="background:${c}" data-color="${c}" onclick="selectStudentColorEdit(this,'${c}')" title="色板${i+1}"></span>`;
  }).join('');
  const body = `
    <div class="form-group">
      <label class="form-label">学生姓名</label>
      <input class="input" id="editStudentName" value="${esc(s.name)}" autocomplete="off">
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">年级</label>
        <input class="input" id="editStudentGrade" value="${esc(s.grade || '')}" placeholder="如：初二">
      </div>
      <div class="form-group">
        <label class="form-label">学校</label>
        <input class="input" id="editStudentSchool" value="${esc(s.school || '')}" placeholder="如：实验中学">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">班级</label>
        <input class="input" id="editStudentClass" value="${esc(s.className || '')}" placeholder="如：英语初二基础班">
      </div>
      <div class="form-group">
        <label class="form-label">家长姓名</label>
        <input class="input" id="editStudentParent" value="${esc(s.parentName || '')}" placeholder="如：李伟">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">家长手机</label>
      <input class="input" id="editStudentPhone" value="${esc(s.phone || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">标签（用空格分隔）</label>
      <input class="input" id="editStudentTags" value="${esc((s.tags || []).join(' '))}" placeholder="如：晚辅 重点学生 薄弱">
    </div>
    <div class="form-group">
      <label class="form-label">学生性格</label>
      <input class="input" id="editStudentPersonality" value="${esc(s.personality || '')}" placeholder="如：活泼开朗 / 内向沉稳 / 思维活跃">
    </div>
    <div class="form-group">
      <label class="form-label">个人色板</label>
      <div class="color-swatch-grid" id="studentColorGrid">${paletteHTML}</div>
      <div class="flex items-center gap-2 mt-2">
        <span class="text-xs text-secondary">自定义：</span>
        <input type="color" class="color-picker" id="studentColorPickerEdit" value="${esc(s.color || '#FFB3BA')}" onchange="document.querySelectorAll('.student-swatch').forEach(s=>s.classList.remove('active'));document.getElementById('editStudentColorValue').value=this.value">
        <input type="hidden" id="editStudentColorValue" value="${esc(s.color || '')}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <input class="input" id="editStudentNotes" value="${esc(s.notes || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">结课设置</label>
      <div class="flex gap-2 flex-wrap">
        <button class="btn btn-sm btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'));editGraduation('${id}')">🎓 结课设置</button>
      </div>
      <div class="text-xs text-light mt-1">设置结课目标，预测结课周。</div>
    </div>
  `;
  const footer = `<button class="btn btn-danger" onclick="deleteStudent('${id}')">删除</button><button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveEditStudent('${id}')">保存</button>`;
  Modal.show('编辑学生', body, footer);
}

function selectStudentColorEdit(el, color) {
  document.querySelectorAll('.student-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('editStudentColorValue').value = color;
  document.getElementById('studentColorPickerEdit').value = color;
}

function saveEditStudent(id) {
  const data = DB.get('students', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  s.name = document.getElementById('editStudentName').value.trim();
  s.grade = document.getElementById('editStudentGrade').value.trim();
  s.school = document.getElementById('editStudentSchool').value.trim();
  s.className = document.getElementById('editStudentClass').value.trim();
  s.parentName = document.getElementById('editStudentParent').value.trim();
  s.phone = document.getElementById('editStudentPhone').value.trim();
  const tagsInput = document.getElementById('editStudentTags').value.trim();
  s.tags = tagsInput ? tagsInput.split(/\s+/).filter(Boolean) : [];
  s.personality = document.getElementById('editStudentPersonality').value.trim();
  s.notes = document.getElementById('editStudentNotes').value.trim();
  const colorVal = document.getElementById('editStudentColorValue').value;
  s.color = colorVal || null;
  DB.set('students', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已更新');
  switchModule(App.currentModule === 'studentManagement' ? 'studentManagement' : 'schedule');
}

function deleteStudent(id) {
  const data = DB.get('students', { list: [] });
  const student = data.list.find(x => x.id === id);
  const studentName = student ? student.name : '';
  if (!confirm('确定删除该学生【' + studentName + '】？排课表上该学生的所有记录也将同步删除。')) return;
  data.list = data.list.filter(x => x.id !== id);
  DB.set('students', data);
  // 同步删除该学生在排课表中的所有记录（包括已上过的课）
  // 按 studentId 优先匹配；旧数据可能没有 studentId，再按 studentName 兜底
  const schedule = DB.get('schedule', { list: [], lastAutoWeek: '' });
  const before = schedule.list.length;
  schedule.list = schedule.list.filter(sl => {
    if (sl.studentId && sl.studentId === id) return false;
    return sl.studentName !== studentName;
  });
  DB.set('schedule', schedule);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已删除，并清理排课表 ' + (before - schedule.list.length) + ' 条记录');
  switchModule(App.currentModule === 'studentManagement' ? 'studentManagement' : 'schedule');
}

// ---------- 学生各科目固定上课时间管理 ----------
// 数据结构：每个科目一条记录，含整体起止日期 + 多个上课时段(sessions)
//   student.subjects = [{ id, subject, startDate, endDate,
//     sessions: [{ days:[1,3], startTime:'19:00', endTime:'21:00' }, ...] }]
// 兼容旧数据：旧记录顶层有 days/startTime/endTime，用 normalizeSubject 迁移为 sessions
function normalizeSubject(sub) {
  if (!sub) return sub;
  if (Array.isArray(sub.sessions) && sub.sessions.length) return sub;
  const days = Array.isArray(sub.days) ? sub.days : [sub.dayOfWeek || 1];
  sub.sessions = [{ days, startTime: sub.startTime || '19:00', endTime: sub.endTime || '21:00' }];
  return sub;
}

// 一键清理排课表中"学生名单里已不存在"的孤儿排课（含已上课记录）
function cleanupOrphanSchedule() {
  const students = DB.get('students', { list: [] }).list;
  const names = new Set(students.map(s => s.name).filter(Boolean));
  const ids = new Set(students.map(s => s.id).filter(Boolean));
  const schedule = DB.get('schedule', { list: [], lastAutoWeek: '' });
  const before = schedule.list.length;
  schedule.list = schedule.list.filter(sl => {
    if (sl.studentId && ids.has(sl.studentId)) return true;
    // 旧数据没有 studentId，按名字兜底
    return names.has(sl.studentName);
  });
  const removed = before - schedule.list.length;
  DB.set('schedule', schedule);
  Toast.show(`已清理 ${removed} 条无学生排课`);
  if (removed > 0) switchModule('schedule');
}

// ---------- 结课设置 + 预测 ----------
// 每周课时由用户直接手填（不再依赖已移除的科目时段），剩余课时也手填，二者齐全即预测结课周
function computeGraduationForecast(student) {
  const g = student.graduation || {};
  const weeklyHours = g.weeklyHours != null && g.weeklyHours !== '' ? Number(g.weeklyHours) : 0;
  const remaining = g.remainingHours != null && g.remainingHours !== '' ? Number(g.remainingHours) : 0;
  if (!weeklyHours || !remaining || remaining <= 0) return null;
  const weeks = Math.ceil(remaining / weeklyHours);
  const predicted = new Date();
  predicted.setDate(predicted.getDate() + weeks * 7);
  return { weeklyHours, remaining, weeks, predicted: DB.formatDate(predicted, 'YYYY-MM-DD') };
}

function editGraduation(studentId) {
  const data = DB.get('students', { list: [] });
  const s = data.list.find(x => x.id === studentId);
  if (!s) return;
  if (!s.graduation) s.graduation = { enabled: false, targetDate: '', startDate: '', weeklyHours: '', remainingHours: '' };
  const g = s.graduation;
  const forecast = computeGraduationForecast(s);
  const forecastHTML = forecast
    ? `<div class="lesson-doc text-sm" style="margin-top:8px">
        每周上课：${forecast.weeklyHours} 节<br>
        剩余课时：${forecast.remaining} 节<br>
        预计还需约 <strong>${forecast.weeks}</strong> 周 → 预测结课 <strong>${forecast.predicted}</strong>
      </div>`
    : `<div class="text-xs text-light mt-2">在下方填写「每周课时」和「预估剩余课时」两项，即可自动估算预测结课时间（均为手动填写，不取自课消台账）。</div>`;
  const body = `
    <div class="form-group">
      <label class="form-label">是否有结课时间</label>
      <label class="switch-toggle">
        <input type="checkbox" id="gradEnabled" ${g.enabled ? 'checked' : ''} onchange="document.getElementById('gradDateWrap').style.display=this.checked?'block':'none'">
        <span class="slider"></span>
        <span style="margin-left:8px">${g.enabled ? '有结课时间' : '暂不设置（长期）'}</span>
      </label>
    </div>
    <div id="gradDateWrap" class="form-group" style="display:${g.enabled ? 'block' : 'none'}">
      <label class="form-label">结课目标日期（自由设定）</label>
      <input type="date" class="input" id="gradDate" value="${esc(g.targetDate || '')}">
    </div>
    <div class="form-group">
      <label class="form-label">几号开始加课</label>
      <input type="date" class="input" id="gradStart" value="${esc(g.startDate || '')}">
      <div class="text-xs text-light mt-1">设定从某天起开始加课（如考前冲刺），仅作备注/提醒，不影响已排课。</div>
    </div>
    <div class="form-group">
      <label class="form-label">每周课时（节/周）</label>
      <input type="number" class="input" id="gradWeekly" min="0" step="1" value="${esc(g.weeklyHours || '')}" placeholder="如：3">
      <div class="text-xs text-light mt-1">当前每周实际上的课节数，用于预测结课周。</div>
    </div>
    <div class="form-group">
      <label class="form-label">预估剩余课时（节）</label>
      <input type="number" class="input" id="gradRemain" min="0" step="1" value="${esc(g.remainingHours || '')}" placeholder="如：40">
    </div>
    ${forecastHTML}`;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveGraduation('${studentId}')">保存</button>`;
  Modal.show('结课设置 · ' + s.name, body, footer);
}

function saveGraduation(studentId) {
  const data = DB.get('students', { list: [] });
  const s = data.list.find(x => x.id === studentId);
  if (!s) return;
  if (!s.graduation) s.graduation = {};
  s.graduation.enabled = document.getElementById('gradEnabled').checked;
  s.graduation.targetDate = document.getElementById('gradDate').value || '';
  s.graduation.startDate = document.getElementById('gradStart').value || '';
  s.graduation.weeklyHours = document.getElementById('gradWeekly').value || '';
  s.graduation.remainingHours = document.getElementById('gradRemain').value || '';
  DB.set('students', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已保存结课设置');
  editStudent(studentId);
}

// ---------- 课时结算辅助函数 ----------
// 获取 ISO 周次（如 2026-W30）
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}
function formatISOWeek(year, week) {
  return `${year}-W${String(week).padStart(2, '0')}`;
}
function parseISOWeek(str) {
  const m = str.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) };
}
// 由 ISO 周次得到周一日期
function getMondayOfISOWeek(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dow = simple.getDay();
  const ISOweekStart = simple;
  if (dow <= 4) ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
  else ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());
  return ISOweekStart;
}
// 周期范围：返回 { start, end } 日期字符串 YYYY-MM-DD
function getBillingPeriodRange(type, period, customStart, customEnd) {
  if (type === 'month') {
    const [y, m] = (period || '').split('-');
    if (!y || !m) return null;
    const start = `${y}-${m}-01`;
    const endDate = new Date(parseInt(y, 10), parseInt(m, 10), 0);
    const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;
    return { start, end };
  }
  if (type === 'week') {
    const parsed = parseISOWeek(period);
    if (!parsed) return null;
    const mon = getMondayOfISOWeek(parsed.year, parsed.week);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmt(mon), end: fmt(sun) };
  }
  if (type === 'custom') {
    if (!customStart || !customEnd) return null;
    return { start: customStart, end: customEnd };
  }
  return null;
}
// 周期展示标签
function getBillingPeriodLabel(type, period, customStart, customEnd) {
  if (type === 'month') {
    const [y, m] = (period || '').split('-');
    return `${y}年${parseInt(m || '0', 10)}月`;
  }
  if (type === 'week') {
    const parsed = parseISOWeek(period);
    if (!parsed) return period;
    const mon = getMondayOfISOWeek(parsed.year, parsed.week);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
    return `${parsed.year}年第${parsed.week}周（${fmt(mon)}-${fmt(sun)}）`;
  }
  if (type === 'custom') {
    return `${customStart || '?'} 至 ${customEnd || '?'}`;
  }
  return period;
}
// 课程日期是否在周期范围内
function isSlotInPeriod(slot, range) {
  if (!range) return false;
  const d = getSlotActualDate(slot);
  return d >= range.start && d <= range.end;
}
// 当前周期的存储 key（用于结算设置）
function getBillingPeriodKey(type, period) {
  return `${type}_${period}`;
}

// ---------- 课时结算模块（支持月/周/自定义周期）----------
Modules.billing = function() {
  const students = DB.get('students', { list: [] }).list;

  // 默认选当前月份
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const currentISO = getISOWeek(now);
  const currentWeek = formatISOWeek(currentISO.year, currentISO.week);
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // 周期类型
  const periodType = App.billingPeriodType || 'month';

  // 默认周期
  let defaultPeriod = currentMonth;
  if (periodType === 'week') defaultPeriod = currentWeek;
  if (periodType === 'custom') {
    if (!App.billingCustomStart) App.billingCustomStart = todayStr;
    if (!App.billingCustomEnd) App.billingCustomEnd = todayStr;
    defaultPeriod = `${App.billingCustomStart}_${App.billingCustomEnd}`;
  }
  const selectedPeriod = App.billingPeriod || defaultPeriod;

  // 兼容旧数据：如果 App.billingMonth 存在且未设置新周期，先迁移
  if (App.billingMonth && !App.billingPeriod) {
    App.billingPeriod = App.billingMonth;
    App.billingPeriodType = 'month';
  }

  const selectedStudent = App.billingStudent || (students.length > 0 ? students[0].id : '');

  // 学生选择下拉
  let studentSelectHTML = '<div class="flex gap-2 flex-wrap mb-3">';
  students.forEach(s => {
    studentSelectHTML += `<button class="btn btn-sm ${selectedStudent === s.id ? 'btn-primary' : 'btn-secondary'}" onclick="App.billingStudent='${s.id}';switchModule('billing')">${esc(s.name)}</button>`;
  });
  studentSelectHTML += '</div>';

  if (students.length === 0) {
    return `
      <div class="module-header">
        <div><div class="module-title">课时结算</div><div class="module-subtitle">灵活周期对账单 · 先上课后收费</div></div>
      </div>
      <div class="empty-state">
        <div class="empty-state-icon">💰</div>
        <div class="empty-state-text">请先在排课管理中添加学生</div>
      </div>`;
  }

  // 周期范围计算
  const periodRange = getBillingPeriodRange(periodType, selectedPeriod, App.billingCustomStart, App.billingCustomEnd);
  const periodLabel = getBillingPeriodLabel(periodType, selectedPeriod, App.billingCustomStart, App.billingCustomEnd);

  // 月份选择（按月时）
  let monthOptions = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = `${d.getFullYear()}年${d.getMonth()+1}月`;
    monthOptions += `<option value="${val}" ${val === selectedPeriod ? 'selected' : ''}>${label}</option>`;
  }

  // 周选择（按周时）
  let weekOptions = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i * 7);
    const iso = getISOWeek(d);
    const val = formatISOWeek(iso.year, iso.week);
    const mon = getMondayOfISOWeek(iso.year, iso.week);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6);
    const label = `${iso.year}年第${iso.week}周（${mon.getMonth()+1}/${mon.getDate()}-${sun.getMonth()+1}/${sun.getDate()}）`;
    weekOptions += `<option value="${val}" ${val === selectedPeriod ? 'selected' : ''}>${label}</option>`;
  }

  // 周期类型切换控件
  const typeTabs = `
    <div class="segmented mb-3">
      <button class="${periodType === 'month' ? 'active' : ''}" onclick="App.billingPeriodType='month';App.billingPeriod='${currentMonth}';switchModule('billing')">按月</button>
      <button class="${periodType === 'week' ? 'active' : ''}" onclick="App.billingPeriodType='week';App.billingPeriod='${currentWeek}';switchModule('billing')">按周</button>
      <button class="${periodType === 'custom' ? 'active' : ''}" onclick="App.billingPeriodType='custom';App.billingCustomStart='${todayStr}';App.billingCustomEnd='${todayStr}';App.billingPeriod='${todayStr}_${todayStr}';switchModule('billing')">自定义</button>
    </div>
  `;
  const periodSelector = periodType === 'month' ? `
    <div class="form-group">
      <label class="form-label">选择月份</label>
      <select class="select" onchange="App.billingPeriod=this.value;switchModule('billing')" style="max-width:260px">
        ${monthOptions}
      </select>
    </div>` : periodType === 'week' ? `
    <div class="form-group">
      <label class="form-label">选择周次</label>
      <select class="select" onchange="App.billingPeriod=this.value;switchModule('billing')" style="max-width:360px">
        ${weekOptions}
      </select>
    </div>` : `
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">开始日期</label>
        <input type="date" class="input" value="${App.billingCustomStart || todayStr}" onchange="App.billingCustomStart=this.value;App.billingPeriod=App.billingCustomStart+'_'+App.billingCustomEnd;switchModule('billing')">
      </div>
      <div class="form-group">
        <label class="form-label">结束日期</label>
        <input type="date" class="input" value="${App.billingCustomEnd || todayStr}" onchange="App.billingCustomEnd=this.value;App.billingPeriod=App.billingCustomStart+'_'+App.billingCustomEnd;switchModule('billing')">
      </div>
    </div>`;

  // 筛选该学生该月已上完的课
  const schedule = DB.get('schedule', { list: [] });
  const studentObj = students.find(s => s.id === selectedStudent);
  const studentName = studentObj ? studentObj.name : '';

  // 结算设置（老师名 / 单价），按 学生+周期 记忆
  const billingSettings = DB.get('billingSettings', {});
  const bsKey = `${selectedStudent}_${periodType}_${selectedPeriod}`;
  // 兼容旧数据：旧 key 是学生+月份（如 student_2026-07）
  const legacyBsKey = `${selectedStudent}_${selectedPeriod}`;
  const legacyBs = (periodType === 'month' && billingSettings[legacyBsKey]) ? billingSettings[legacyBsKey] : {};
  const bs = billingSettings[bsKey] || legacyBs || {};
  const teacherName = bs.teacher || '';
  const unitPrice = bs.price || 0;
  const discountVal = bs.discount || 0;
  const reimburseVal = bs.reimbursement || 0;

  const doneClasses = schedule.list.filter(s => {
    // 优先按 studentId 匹配，避免学生姓名乱码导致结算缺失
    if (s.studentId && selectedStudent) {
      if (s.studentId !== selectedStudent) return false;
    } else if (s.studentName !== studentName) {
      return false;
    }
    if (s.status !== 'done') return false;
    return isSlotInPeriod(s, periodRange);
  }).sort((a, b) => getSlotActualDate(a).localeCompare(getSlotActualDate(b)));

  const weekDays = ['周日','周一','周二','周三','周四','周五','周六'];
  let rowsHTML = '';
  let totalHours = 0;

  doneClasses.forEach((c, idx) => {
    const dateStr = getSlotActualDate(c);
    const dateObj = dateStr ? new Date(dateStr) : null;
    const monthDay = dateObj ? `${dateObj.getMonth()+1}/${dateObj.getDate()}` : '-';
    const wd = dateObj ? weekDays[dateObj.getDay()] : '-';
    const hours = calcSlotHours(c);
    totalHours += hours;
    rowsHTML += `<tr>
      <td>${idx+1}</td>
      <td>${monthDay}</td>
      <td>${wd}</td>
      <td>${esc(c.subject || '-')}</td>
      <td>${c.startTime}-${c.endTime || ''}</td>
      <td>${formatDecimalHours(hours)}h</td>
    </tr>`;
  });

  // 总价在 totalHours 累加完成后计算（避免暂时性死区报错）
  const totalAmount = totalHours * (Number(unitPrice) || 0);
  const discountNum = Number(discountVal) || 0;
  const reimburseNum = Number(reimburseVal) || 0;
  // 优惠扣除=减；激励报销=加在总价上
  const finalAmount = totalAmount - discountNum + reimburseNum;

  // 生成结算文本（优惠/报销仅在有值时写入）
  const periodTypeText = { month: '月', week: '周', custom: '周期' }[periodType];
  let billText = `【${studentName}同学 ${periodLabel}课时对账单】\n\n`;
  billText += `教师：${teacherName || '___老师'}\n`;
  billText += `结算周期：${periodLabel}\n`;
  billText += `━━━━━━━━━━━━━━\n\n`;
  billText += `上课明细：\n`;

  doneClasses.forEach((c, idx) => {
    const dateStr = getSlotActualDate(c);
    billText += `${idx+1}. ${dateStr} ${c.startTime}-${c.endTime} ${c.subject || ''}\n`;
  });

  billText += `\n━━━━━━━━━━━━━━\n`;
  billText += `本${periodTypeText}共计：${doneClasses.length} 节课，${formatDecimalHours(totalHours)} 课时\n`;
  billText += `单价：${Number(unitPrice) || '___'} 元/课时\n`;
  billText += `应收合计：${totalAmount || '___'} 元\n`;
  if (discountNum > 0) billText += `优惠扣除：-${discountNum} 元\n`;
  if (reimburseNum > 0) billText += `激励报销：+${reimburseNum} 元\n`;
  if (discountNum > 0 || reimburseNum > 0) billText += `实收金额：${finalAmount || '___'} 元\n`;
  else billText += `实收金额：${finalAmount || '___'} 元\n`;
  billText += `\n（请家长核对，如有疑问请联系）`;

  return `
    <div class="module-header">
      <div>
        <div class="module-title">课时结算</div>
        <div class="module-subtitle">灵活周期对账单 · 先上课后收费 · ${periodTypeText}度结算</div>
      </div>
    </div>

    <div class="card mb-3">
      <script>window._billingTotalHours = ${totalHours};</script>
      ${typeTabs}
      ${periodSelector}
      ${studentSelectHTML}
      <div class="grid-2 mt-3">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">授课老师</label>
          <input class="input" id="billingTeacher" value="${esc(teacherName)}" placeholder="如：王老师" oninput="saveBillingSetting('${bsKey}', 'teacher', this.value)">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">单价（元/课时）</label>
          <input class="input" id="billingPrice" type="number" min="0" step="1" value="${unitPrice ? esc(unitPrice) : ''}" placeholder="如：200" oninput="saveBillingSetting('${bsKey}', 'price', this.value)">
        </div>
      </div>
      <div class="grid-2 mt-3">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">优惠扣除（元）</label>
          <input class="input" id="billingDiscount" type="number" min="0" step="1" value="${discountNum ? esc(discountNum) : ''}" placeholder="如：100" oninput="saveBillingSetting('${bsKey}', 'discount', this.value)">
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">激励报销（元）</label>
          <input class="input" id="billingReimburse" type="number" min="0" step="1" value="${reimburseNum ? esc(discountNum) : ''}" placeholder="如：50" oninput="saveBillingSetting('${bsKey}', 'reimbursement', this.value)">
        </div>
      </div>
      <div class="mt-3" style="font-size:14px">
        应收合计：<strong id="billingTotalAmount" style="color:var(--color-primary-dark);font-size:18px">${totalAmount || 0} 元</strong>
        <span id="billingTotalHint" class="text-light text-xs">（${formatDecimalHours(totalHours)} 课时 × ${Number(unitPrice) || 0} 元/课时）</span>
        ${discountNum > 0 || reimburseNum > 0 ? `<div style="margin-top:4px">优惠扣除 <strong style="color:var(--color-danger,#c46060)">-${discountNum}</strong> 元，激励报销 <strong style="color:var(--color-success,#5a9e5a)">+${reimburseNum}</strong> 元 → 实收 <strong style="color:var(--color-primary-dark);font-size:16px">${finalAmount} 元</strong></div>` : ''}
      </div>
      <div class="flex gap-2 mt-3 flex-wrap">
        <button class="btn btn-primary" onclick="recalcBillingTotal('${bsKey}', ${totalHours})">🧮 一键合计</button>
        ${bs.settled
          ? `<span class="badge badge-success">✅ 已结算 · 入账 ${esc(bs.settledDate || '')}</span><button class="btn btn-sm btn-secondary" onclick="switchModule('ledger')">查看入账记录</button>`
          : `<button class="btn btn-success" onclick="openSettleModal('${selectedStudent}','${bsKey}',${totalAmount || 0})">✔ 标记为已结算</button>`}
      </div>
    </div>

    <div class="grid-2">
      <!-- 明细表格 -->
      <div class="card">
        <div class="card-title">📊 ${esc(studentName)} · ${periodLabel} 上课明细</div>
        ${doneClasses.length === 0 ? `<div class="empty-state"><div class="empty-state-text">本${periodTypeText}暂无已上完的课程</div></div>` : `
        <div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table class="schedule-table">
          <thead><tr><th>#</th><th>上课日期</th><th>周几</th><th>科目</th><th>时间</th><th>课时</th></tr></thead>
          <tbody>${rowsHTML}</tbody>
          <tfoot>
            <tr style="font-weight:700;background:var(--bg-input)">
              <td colspan="5" style="text-align:right">合计</td>
              <td>${formatDecimalHours(totalHours)}课时 / ${doneClasses.length}节</td>
            </tr>
          </tfoot>
        </table>
        </div>
        `}
      </div>

      <!-- 结算单预览 -->
      <div class="card">
        <div class="card-title">💰 对账单预览</div>
        <div class="lesson-doc" style="font-size:13px;white-space:pre-wrap">${esc(billText)}</div>
        <div class="flex gap-2 mt-3 flex-wrap">
          <button class="btn btn-primary copy-btn" onclick='copyToClipboard(${JSON.stringify(billText)});this.classList.add("copied");setTimeout(()=>this.classList.remove("copied"),1500)'>📋 复制对账单</button>
          <button class="btn btn-secondary" onclick="exportBillingImage('${selectedStudent}','${bsKey}')">📸 导出图片</button>
        </div>
      </div>
    </div>

    <div class="card mt-3">
      <div class="card-title">💡 使用说明</div>
      <div class="text-sm text-secondary">
        <p>1. 在<strong>排课管理</strong>中，上课后将状态标记为「已上完」</p>
        <p>2. 打开本页面，选择结算周期类型（按月 / 按周 / 自定义日期范围）和学生</p>
        <p>3. 核对明细无误后，点击「复制对账单」发微信给家长</p>
        <p>4. 系统会根据排课起止时间自动计算课时（如 19:00-21:30 算 2.5 课时），你只需填单价</p>
      </div>
    </div>
  `;
};
Modules.billing.bindEvents = function() {};

// 保存课时结算设置（老师名 / 单价 / 优惠 / 报销），按 学生+周期 记忆，并触发云同步
function saveBillingSetting(key, field, value) {
  const settings = DB.get('billingSettings', {});
  if (!settings[key]) settings[key] = {};
  if (field === 'price' || field === 'discount' || field === 'reimbursement') {
    settings[key][field] = (value === '' ? 0 : Number(value) || 0);
  } else {
    settings[key][field] = value;
  }
  DB.set('billingSettings', settings);
  // 实时刷新总价显示（不用整页重渲，避免输入框失焦）
  if (field === 'price' || field === 'discount' || field === 'reimbursement') {
    const bs = settings[key] || {};
    const totalEl = document.getElementById('billingTotalAmount');
    const hintEl = document.getElementById('billingTotalHint');
    if (totalEl) {
      const totalHours = window._billingTotalHours || 0;
      const unit = Number(bs.price) || 0;
      const total = totalHours * unit;
      const disc = Number(bs.discount) || 0;
      const reimb = Number(bs.reimbursement) || 0;
      const finalAmt = total - disc + reimb;
      totalEl.textContent = (total || 0) + ' 元';
      if (hintEl) {
        hintEl.innerHTML = (disc > 0 || reimb > 0)
          ? `（${formatDecimalHours(totalHours)}课时 × ${unit} - 优惠${disc} + 报销${reimb} = 实收 <strong>${finalAmt}</strong>）`
          : `（${formatDecimalHours(totalHours)} 课时 × ${unit} 元/课时）`;
      }
    }
  }
}

// 一键合计：重新读取单价与总课时，刷新总价显示并重新生成对账单
function recalcBillingTotal(bsKey, totalHours) {
  const settings = DB.get('billingSettings', {});
  const bs = settings[bsKey] || {};
  const price = Number(bs.price) || 0;
  const amt = totalHours * price;
  Toast.show(`已合计：${formatDecimalHours(totalHours)} 课时 × ${price} 元 = ${amt || 0} 元`);
  // 重新渲染整个结算模块，让对账单文本、总价、按钮全部用最新数据重新生成
  switchModule('billing');
}

// 记账记录存取
function getBillingRecords() {
  return DB.get('billingRecords', []);
}
function setBillingRecords(list) {
  DB.set('billingRecords', list);
  if (typeof Sync !== 'undefined' && Sync.isLoggedIn && Sync.isLoggedIn()) Sync.scheduleSync();
}

// 从 bsKey 解析学生和周期信息（bsKey = studentId_type_period）
function parseBillingKey(bsKey) {
  const parts = (bsKey || '').split('_');
  if (parts.length >= 3) {
    return { studentId: parts[0], type: parts[1], period: parts.slice(2).join('_') };
  }
  // 兼容旧 key：studentId_YYYY-MM
  if (parts.length === 2 && /^\d{4}-\d{2}$/.test(parts[1])) {
    return { studentId: parts[0], type: 'month', period: parts[1] };
  }
  return { studentId: bsKey, type: 'month', period: '' };
}

// 打开「标记为已结算」弹窗：可改实收金额(默认带出实收价)、填入账日期(默认今天)、备注
function openSettleModal(studentId, bsKey, defaultAmount) {
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  const studentName = student ? student.name : '';
  const parsed = parseBillingKey(bsKey);
  const periodLabel = getBillingPeriodLabel(parsed.type, parsed.period, App.billingCustomStart, App.billingCustomEnd);
  const today = new Date().toISOString().slice(0, 10);
  const billSettings = DB.get('billingSettings', {})[bsKey] || {};
  const d = Number(billSettings.discount) || 0;
  const r = Number(billSettings.reimbursement) || 0;
  const finalVal = defaultAmount - d + r;
  const breakdown = (d > 0 || r > 0)
    ? `<div class="lesson-doc text-sm" style="margin:8px 0">
        应收合计：${defaultAmount} 元<br>
        ${d > 0 ? `优惠扣除：-${d} 元<br>` : ''}
        ${r > 0 ? `激励报销：+${r} 元<br>` : ''}
        <strong>实收金额：${finalVal} 元</strong>
      </div>`
    : `<div class="text-xs text-light mt-2">应收合计 ${defaultAmount} 元（如有优惠/报销已在上方设置，将自动计入实收）</div>`;
  const body = `
    <div class="form-group">
      <label class="form-label">学生</label>
      <input class="input" value="${esc(studentName)} · ${esc(periodLabel)}" disabled>
    </div>
    ${breakdown}
    <div class="form-group">
      <label class="form-label">实收金额（元，默认带出优惠/报销后金额）</label>
      <input class="input" id="settleAmount" type="number" min="0" step="1" value="${finalVal || 0}">
    </div>
    <div class="form-group">
      <label class="form-label">入账日期（年-月-日）</label>
      <input class="input" id="settleDate" type="date" value="${today}">
    </div>
    <div class="form-group">
      <label class="form-label">备注（可选）</label>
      <input class="input" id="settleNote" placeholder="如：微信收款 / 现金 / 优惠后">
    </div>`;
  const footer = `
    <button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
    <button class="btn btn-success" onclick="markAsSettled('${studentId}','${bsKey}')">确认入账</button>`;
  Modal.show('标记为已结算', body, footer);
}

// 确认结算：写入记账记录 + 标记该学生+周期已结算
function markAsSettled(studentId, bsKey) {
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  const studentName = student ? student.name : '';
  const amount = Number(document.getElementById('settleAmount').value) || 0;
  const paidDate = document.getElementById('settleDate').value || new Date().toISOString().slice(0, 10);
  const note = document.getElementById('settleNote').value.trim();
  if (amount <= 0) { Toast.show('请输入大于 0 的实收金额'); return; }

  const billSettings = DB.get('billingSettings', {})[bsKey] || {};
  const discount = Number(billSettings.discount) || 0;
  const reimbursement = Number(billSettings.reimbursement) || 0;

  const parsed = parseBillingKey(bsKey);
  const periodLabel = getBillingPeriodLabel(parsed.type, parsed.period, App.billingCustomStart, App.billingCustomEnd);

  const records = getBillingRecords();
  // 同一学生+周期若已结算，更新而非重复
  const idx = records.findIndex(r => r.studentId === studentId && r.bsKey === bsKey);
  const record = {
    id: idx >= 0 ? records[idx].id : ('br_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    studentId, studentName, bsKey, periodType: parsed.type, period: parsed.period, periodLabel, month: periodLabel, amount, paidDate, note, discount, reimbursement,
    createdAt: idx >= 0 ? records[idx].createdAt : Date.now()
  };
  if (idx >= 0) records[idx] = record; else records.push(record);
  setBillingRecords(records);

  // 标记已结算状态
  const settings = DB.get('billingSettings', {});
  if (!settings[bsKey]) settings[bsKey] = {};
  settings[bsKey].settled = true;
  settings[bsKey].settledDate = paidDate;
  settings[bsKey].settledAmount = amount;
  DB.set('billingSettings', settings);

  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show(`已入账 ${amount} 元，已记入记账`);
  switchModule('billing');
}

function exportBillingImage(studentId, bsKey) {
  hideExportBg();
  const schedule = DB.get('schedule', { list: [] });
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  if (!student) { Toast.show('学生不存在'); return; }

  const parsed = parseBillingKey(bsKey);
  const periodRange = getBillingPeriodRange(parsed.type, parsed.period, App.billingCustomStart, App.billingCustomEnd);
  const periodLabel = getBillingPeriodLabel(parsed.type, parsed.period, App.billingCustomStart, App.billingCustomEnd);

  const doneClasses = schedule.list.filter(s => {
    // 优先按 studentId 匹配，避免学生姓名乱码导致结算缺失
    if (s.studentId && student.id) {
      if (s.studentId !== student.id) return false;
    } else if (s.studentName !== student.name) {
      return false;
    }
    if (s.status !== 'done') return false;
    return isSlotInPeriod(s, periodRange);
  }).sort((a, b) => getSlotActualDate(a).localeCompare(getSlotActualDate(b)));

  // 读取该学生+周期的设置（老师名 / 单价 / 优惠 / 报销）
  const billingSettings = DB.get('billingSettings', {});
  const bs = billingSettings[bsKey] || {};
  const teacherName = bs.teacher || '';
  const unitPrice = Number(bs.price) || 0;
  const discountImg = Number(bs.discount) || 0;
  const reimburseImg = Number(bs.reimbursement) || 0;
  let totalHoursImg = 0;
  doneClasses.forEach(c => { totalHoursImg += calcSlotHours(c); });
  const totalAmountImg = totalHoursImg * unitPrice;
  const canvas = document.createElement('canvas');
  const W = 800;
  const rowH = 32;
  const headerH = 100;
  const footerH = 80;
  const tableTop = headerH + 20;
  const totalH = tableTop + (doneClasses.length + 1) * rowH + footerH + 30;
  canvas.width = W * 2;
  canvas.height = totalH * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // 背景
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, totalH);

  // 标题
  ctx.fillStyle = '#4A4A4A';
  ctx.font = 'bold 20px -apple-system, sans-serif';
  ctx.fillText(`${student.name}同学 课时对账单`, 30, 40);

  ctx.font = '13px -apple-system, sans-serif';
  ctx.fillStyle = '#999';
  ctx.fillText(`教师：${teacherName || '___老师'}    |    结算周期：${periodLabel}`, 30, 68);
  ctx.fillText(`生成日期：${DB.formatDate(new Date(), 'YYYY-MM-DD')}`, 30, 88);

  // 表格
  const cols = [40, 90, 55, 120, 120, 60]; // #, 日期, 周几, 科目, 时间, 课时
  const colLabels = ['#', '日期', '周几', '科目', '时间', '课时'];
  let x = 30;
  const weekDays = ['周日','周一','周二','周三','周四','周五','周六'];

  // 表头
  ctx.fillStyle = '#F0EDE8';
  ctx.fillRect(30, tableTop, W - 60, rowH);
  ctx.fillStyle = '#4A4A4A';
  ctx.font = 'bold 12px -apple-system, sans-serif';
  colLabels.forEach((label, i) => {
    ctx.fillText(label, x + 8, tableTop + 22);
    x += cols[i];
  });

  // 数据行
  let totalHours = 0;
  doneClasses.forEach((c, idx) => {
    const yPos = tableTop + rowH + idx * rowH;
    if (idx % 2 === 0) {
      ctx.fillStyle = '#FAF8F5';
      ctx.fillRect(30, yPos, W - 60, rowH);
    }

    const dateStr = getSlotActualDate(c);
    const dateObj = dateStr ? new Date(dateStr) : null;
    const monthDay = dateObj ? `${dateObj.getMonth()+1}/${dateObj.getDate()}` : '-';
    const wd = dateObj ? weekDays[dateObj.getDay()] : '-';

    ctx.fillStyle = '#666';
    ctx.font = '12px -apple-system, sans-serif';
    let cx = 30;
    const hours = calcSlotHours(c);
    const vals = [String(idx+1), monthDay, wd, c.subject || '-', `${c.startTime}-${c.endTime || ''}`, `${formatDecimalHours(hours)}h`];
    vals.forEach((val, i) => {
      ctx.fillText(val, cx + 8, yPos + 22);
      cx += cols[i];
    });
    totalHours += hours;
  });

  // 合计行
  const sumY = tableTop + rowH + doneClasses.length * rowH;
  ctx.fillStyle = '#F0EDE8';
  ctx.fillRect(30, sumY, W - 60, rowH);
  ctx.fillStyle = '#4A4A4A';
  ctx.font = 'bold 13px -apple-system, sans-serif';
  ctx.fillText('合计', 30 + cols[0] + cols[1] + cols[2] + cols[3] + 8, sumY + 22);
  ctx.fillText(`${formatDecimalHours(totalHours)}课时 / ${doneClasses.length}节`, 30 + cols[0] + cols[1] + cols[2] + cols[3] + cols[4] + 8, sumY + 22);

  // 底部
  const footY = sumY + rowH + 10;
  const finalImg = totalAmountImg - discountImg + reimburseImg;
  ctx.fillStyle = '#4A4A4A';
  ctx.font = 'bold 14px -apple-system, sans-serif';
  ctx.fillText(`单价：${unitPrice || '___'} 元/课时    应收：${totalAmountImg || '___'} 元`, 30, footY);
  let fy2 = footY + 22;
  if (discountImg > 0) { ctx.fillStyle = '#C48080'; ctx.fillText(`优惠扣除：-${discountImg} 元`, 30, fy2); fy2 += 20; }
  if (reimburseImg > 0) { ctx.fillStyle = '#8BAA8B'; ctx.fillText(`激励报销：+${reimburseImg} 元`, 30, fy2); fy2 += 20; }
  ctx.fillStyle = '#4A4A4A';
  ctx.font = 'bold 15px -apple-system, sans-serif';
  ctx.fillText(`实收金额：${finalImg || '___'} 元`, 30, fy2);
  ctx.fillStyle = '#999';
  ctx.font = '11px -apple-system, sans-serif';
  ctx.fillText('（请家长核对，如有疑问请联系老师）', 30, fy2 + 22);
  ctx.fillText('教培备考工作台 · 课时结算', 30, fy2 + 44);

  // 下载
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeLabel = (periodLabel || '').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `课时对账单_${student.name}_${safeLabel}.png`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('对账单图片已下载');
    restoreExportBg();
  }, 'image/png');
}

// ---------- 课时结算新增：记账模块（已结算入账明细，年-月-日，含月报/年报）----------
Modules.ledger = function() {
  const records = getBillingRecords();
  const now = new Date();
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selMonth = App.ledgerMonth || curMonth;
  const selYear = App.ledgerYear || String(now.getFullYear());
  const view = App.ledgerView || 'detail';

  // 月份筛选（最近12个月）
  let monthOptions = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthOptions += `<option value="${val}" ${val === selMonth ? 'selected' : ''}>${d.getFullYear()}年${d.getMonth() + 1}月</option>`;
  }
  // 年份筛选（最近5年）
  let yearOptions = '';
  for (let i = 0; i < 5; i++) {
    const y = now.getFullYear() - i;
    yearOptions += `<option value="${y}" ${String(y) === selYear ? 'selected' : ''}>${y}年</option>`;
  }

  // 简易柱状图（纯 div，离线可用）
  function barChart(items, unit) {
    if (!items.length) return '<div class="text-light text-sm">暂无数据</div>';
    const max = Math.max(...items.map(it => it.val), 1);
    return `<div class="ledger-chart">${items.map(it => `
      <div class="ledger-bar-col">
        <div class="ledger-bar-val">${it.val}${unit}</div>
        <div class="ledger-bar" style="height:${Math.round(it.val / max * 100)}%;background:var(--color-primary,#7B9ACC)"></div>
        <div class="ledger-bar-label">${esc(it.label)}</div>
      </div>`).join('')}</div>`;
  }

  const segmented = `<div class="segmented">
    <button class="${view === 'detail' ? 'active' : ''}" onclick="App.ledgerView='detail';switchModule('ledger')">明细</button>
    <button class="${view === 'month' ? 'active' : ''}" onclick="App.ledgerView='month';switchModule('ledger')">月报</button>
    <button class="${view === 'year' ? 'active' : ''}" onclick="App.ledgerView='year';switchModule('ledger')">年报</button>
  </div>`;

  let body = '';

  if (view === 'detail') {
    const filtered = records.filter(r => r.paidDate && r.paidDate.startsWith(selMonth)).slice()
      .sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));
    const monthTotal = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const showDisc = filtered.some(r => r.discount || r.reimbursement);
    const rows = filtered.length === 0
      ? `<div class="empty-state"><div class="empty-state-icon">📒</div><div class="empty-state-text">本月暂无入账记录<br>在「课时结算」点「标记为已结算」即可入账</div></div>`
      : `<table class="schedule-table">
          <thead><tr><th>入账日期</th><th>学生</th><th>对应月份</th><th>实收金额</th>${showDisc ? '<th>优惠/报销</th>' : ''}<th>备注</th><th></th></tr></thead>
          <tbody>${filtered.map(r => `
            <tr>
              <td>${esc(r.paidDate)}</td>
              <td>${esc(r.studentName)}</td>
              <td>${esc(r.month)}</td>
              <td style="color:var(--color-success,#5a9e5a);font-weight:700">${Number(r.amount) || 0} 元</td>
              ${showDisc ? `<td class="text-xs">${Number(r.discount) ? `<span style="color:var(--color-danger,#c46060)">优惠${r.discount}</span> ` : ''}${Number(r.reimbursement) ? `<span style="color:var(--color-success,#5a9e5a)">报销${r.reimbursement}</span>` : (Number(r.discount) ? '' : '-')}</td>` : ''}
              <td>${esc(r.note || '-')}</td>
              <td><button class="btn btn-sm btn-ghost" onclick="deleteLedgerRecord('${r.id}')">🗑</button></td>
            </tr>`).join('')}</tbody>
          <tfoot><tr style="font-weight:700;background:var(--bg-input)"><td colspan="${showDisc ? 4 : 3}" style="text-align:right">本月合计</td><td colspan="${showDisc ? 3 : 3}">${monthTotal} 元</td></tr></tfoot>
        </table>`;
    body = `
      <div class="card mb-3">
        <div class="flex gap-2 flex-wrap items-center" style="align-items:center">
          <div class="form-group" style="margin:0"><label class="form-label">筛选月份</label>
            <select class="select" onchange="App.ledgerMonth=this.value;switchModule('ledger')">${monthOptions}</select></div>
          <div style="margin-left:auto;font-size:14px">本月入账合计：<strong style="color:var(--color-success,#5a9e5a);font-size:18px">${monthTotal} 元</strong></div>
          <button class="btn btn-secondary" onclick="exportLedgerText('${selMonth}')">📋 导出本月记账</button>
        </div>
      </div>
      <div class="card">${rows}</div>`;
  }
  else if (view === 'month') {
    const filtered = records.filter(r => r.paidDate && r.paidDate.startsWith(selMonth));
    const monthTotal = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const byStudent = {};
    filtered.forEach(r => { byStudent[r.studentName] = (byStudent[r.studentName] || 0) + (Number(r.amount) || 0); });
    const items = Object.keys(byStudent).map(name => ({ label: name, val: byStudent[name] }));
    const totalCount = filtered.length;
    body = `
      <div class="card mb-3">
        <div class="flex gap-2 flex-wrap items-center" style="align-items:center">
          <div class="form-group" style="margin:0"><label class="form-label">月报月份</label>
            <select class="select" onchange="App.ledgerMonth=this.value;switchModule('ledger')">${monthOptions}</select></div>
          <div style="margin-left:auto;font-size:14px">${selMonth} 入账合计：<strong style="color:var(--color-success,#5a9e5a);font-size:18px">${monthTotal} 元</strong>（${totalCount} 笔）</div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">📊 ${selMonth} 各学生入账</div>
        ${barChart(items, '元')}
        <table class="schedule-table mt-3">
          <thead><tr><th>学生</th><th>入账合计</th><th>笔数</th></tr></thead>
          <tbody>${Object.keys(byStudent).length === 0 ? `<tr><td colspan="3" class="text-light">暂无数据</td></tr>` :
            Object.keys(byStudent).map(name => `<tr><td>${esc(name)}</td><td style="color:var(--color-success,#5a9e5a);font-weight:700">${byStudent[name]} 元</td><td>${filtered.filter(r => r.studentName === name).length}</td></tr>`).join('')}</tbody>
          <tfoot><tr style="font-weight:700;background:var(--bg-input)"><td>合计</td><td>${monthTotal} 元</td><td>${totalCount}</td></tr></tfoot>
        </table>
      </div>`;
  }
  else { // year
    const filtered = records.filter(r => r.paidDate && r.paidDate.startsWith(selYear + '-'));
    const yearTotal = filtered.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    // 12 个月走势
    const monthVals = new Array(12).fill(0);
    filtered.forEach(r => { const m = parseInt((r.paidDate || '').slice(5, 7)) - 1; if (m >= 0 && m < 12) monthVals[m] += (Number(r.amount) || 0); });
    const monthItems = monthVals.map((v, i) => ({ label: (i + 1) + '月', val: v }));
    // 按学生年汇总
    const byStudent = {};
    filtered.forEach(r => { byStudent[r.studentName] = (byStudent[r.studentName] || 0) + (Number(r.amount) || 0); });
    const studentItems = Object.keys(byStudent).map(name => ({ label: name, val: byStudent[name] }));
    body = `
      <div class="card mb-3">
        <div class="flex gap-2 flex-wrap items-center" style="align-items:center">
          <div class="form-group" style="margin:0"><label class="form-label">年报年份</label>
            <select class="select" onchange="App.ledgerYear=this.value;switchModule('ledger')">${yearOptions}</select></div>
          <div style="margin-left:auto;font-size:14px">${selYear} 全年入账合计：<strong style="color:var(--color-success,#5a9e5a);font-size:18px">${yearTotal} 元</strong>（${filtered.length} 笔）</div>
        </div>
      </div>
      <div class="card mb-3">
        <div class="card-title">📈 ${selYear} 各月入账走势</div>
        ${barChart(monthItems, '元')}
      </div>
      <div class="card">
        <div class="card-title">👥 ${selYear} 各学生年入账</div>
        ${barChart(studentItems, '元')}
        <table class="schedule-table mt-3">
          <thead><tr><th>学生</th><th>年入账合计</th><th>笔数</th></tr></thead>
          <tbody>${Object.keys(byStudent).length === 0 ? `<tr><td colspan="3" class="text-light">暂无数据</td></tr>` :
            Object.keys(byStudent).map(name => `<tr><td>${esc(name)}</td><td style="color:var(--color-success,#5a9e5a);font-weight:700">${byStudent[name]} 元</td><td>${filtered.filter(r => r.studentName === name).length}</td></tr>`).join('')}</tbody>
          <tfoot><tr style="font-weight:700;background:var(--bg-input)"><td>合计</td><td>${yearTotal} 元</td><td>${filtered.length}</td></tr></tfoot>
        </table>
      </div>`;
  }

  return `
    <div class="module-header">
      <div><div class="module-title">记账</div><div class="module-subtitle">已结算入账明细 · 年-月-日</div></div>
    </div>
    <div class="card mb-3">
      <div class="flex gap-2 flex-wrap items-center" style="align-items:center">
        ${segmented}
        <button class="btn btn-secondary" onclick="exportLedgerReport()">📋 导出入账报告</button>
      </div>
    </div>
    ${body}
  `;
};

// 导出当前视图的入账报告（明细/月报/年报）
function exportLedgerReport() {
  const records = getBillingRecords();
  const now = new Date();
  const selMonth = App.ledgerMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const selYear = App.ledgerYear || String(now.getFullYear());
  const view = App.ledgerView || 'detail';
  let txt = '';
  if (view === 'detail') {
    const f = records.filter(r => r.paidDate && r.paidDate.startsWith(selMonth)).sort((a, b) => (a.paidDate || '').localeCompare(b.paidDate || ''));
    const total = f.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    txt = `【${selMonth} 记账明细】合计 ${total} 元\n━━━━━━━━━━━━━━\n` +
      f.map((r, i) => `${i + 1}. ${r.paidDate} ${r.studentName}（${r.month}）${Number(r.amount) || 0}元 ${r.note || ''}`).join('\n');
  } else if (view === 'month') {
    const f = records.filter(r => r.paidDate && r.paidDate.startsWith(selMonth));
    const total = f.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const byS = {}; f.forEach(r => byS[r.studentName] = (byS[r.studentName] || 0) + (Number(r.amount) || 0));
    txt = `【${selMonth} 月报】合计 ${total} 元（${f.length} 笔）\n━━━━━━━━━━━━━━\n` +
      Object.keys(byS).map(n => `${n}：${byS[n]} 元`).join('\n');
  } else {
    const f = records.filter(r => r.paidDate && r.paidDate.startsWith(selYear + '-'));
    const total = f.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const byS = {}; f.forEach(r => byS[r.studentName] = (byS[r.studentName] || 0) + (Number(r.amount) || 0));
    const months = new Array(12).fill(0); f.forEach(r => { const m = parseInt((r.paidDate || '').slice(5, 7)) - 1; if (m >= 0 && m < 12) months[m] += (Number(r.amount) || 0); });
    txt = `【${selYear} 年报】全年合计 ${total} 元（${f.length} 笔）\n━━━━━━━━━━━━━━\n各月：\n` +
      months.map((v, i) => `${i + 1}月 ${v}元`).join('  ') + `\n各学生：\n` + Object.keys(byS).map(n => `${n}：${byS[n]}元`).join('\n');
  }
  if (!txt.trim()) { Toast.show('暂无数据可导出'); return; }
  copyToClipboard(txt);
  Toast.show('入账报告已复制到剪贴板');
}

// 删除一条入账记录
function deleteLedgerRecord(id) {
  if (!confirm('确定删除这条入账记录？')) return;
  const records = getBillingRecords().filter(r => r.id !== id);
  setBillingRecords(records);
  Toast.show('已删除入账记录');
  switchModule('ledger');
}

// 导出本月记账文本
function exportLedgerText(month) {
  const records = getBillingRecords().filter(r => r.paidDate && r.paidDate.startsWith(month));
  if (records.length === 0) { Toast.show('本月无入账记录'); return; }
  const [y, m] = month.split('-');
  const total = records.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  let txt = `【${y}年${m}月 记账明细】\n合计入账：${total} 元\n━━━━━━━━━━━━━━\n`;
  records.sort((a, b) => (a.paidDate || '').localeCompare(b.paidDate || '')).forEach((r, i) => {
    txt += `${i + 1}. ${r.paidDate}  ${r.studentName}（${r.month}）  ${Number(r.amount) || 0}元  ${r.note || ''}\n`;
  });
  copyToClipboard(txt);
  Toast.show('本月记账已复制到剪贴板');
}

// ---------- 6. 备课文档库 ----------
Modules.lessonPrep = function() {
  const data = DB.get('lessonPrep', { list: [] });
  const sorted = (data.list || []).slice().sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
  // 分类筛选：按科目聚合
  const subjects = [...new Set(sorted.map(l => (l.subject || '').trim()).filter(Boolean))];

  return `
    <div class="module-header">
      <div>
        <div class="module-title">备课文档库</div>
        <div class="module-subtitle">教师版备课稿（自用） · 学生版讲义（发学生）</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddLessonModal()">➕ 新建备课</button>
      </div>
    </div>

    ${subjects.length > 0 ? `<div class="card mb-3" id="lessonPrepFilter">
      <div class="flex gap-2 flex-wrap items-center">
        <span class="text-sm text-secondary">分类筛选：</span>
        <span class="tag active" onclick="filterLessons('')">全部</span>
        ${subjects.map(s => `<span class="tag" onclick="filterLessons('${esc(s)}')">${esc(s)}</span>`).join('')}
      </div>
    </div>` : ''}

    ${sorted.length > 0 ? `<div class="item-grid" id="lessonGrid">` + sorted.map(l => `
      <div class="item-card" data-subject="${esc(l.subject || '')}" onclick="viewLesson('${l.id}')">
        <div class="item-card-title">${esc(l.studentName)} · ${esc(l.subject || '未指定科目')}</div>
        <div class="item-card-desc">📅 ${esc(l.date || l.createdAt || '未设置日期')}</div>
        <div class="flex gap-2 flex-wrap mt-2">
          <span class="tag tag-sage">教师版 ${l.teacherVersion ? '✓' : '空'}</span>
          <span class="tag tag-tan">学生版 ${l.studentVersion ? '✓' : '空'}</span>
        </div>
        ${l.notes ? `<div class="text-xs text-light mt-2">📝 ${esc(l.notes.substring(0, 50))}${l.notes.length > 50 ? '...' : ''}</div>` : ''}
      </div>
    `).join('') + `</div>` : '<div class="empty-state"><div class="empty-state-icon">📝</div><div class="empty-state-text">暂无备课文档，点击上方新建</div></div>'}
  `;
};

function filterLessons(subject) {
  const bar = document.getElementById('lessonPrepFilter');
  if (bar) bar.querySelectorAll('.tag').forEach(t => t.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');
  document.querySelectorAll('#lessonGrid .item-card').forEach(card => {
    const sub = card.dataset.subject || '';
    if (!subject || sub === subject) card.style.display = '';
    else card.style.display = 'none';
  });
}
Modules.lessonPrep.bindEvents = function() {};
Modules.lessonPrep.init = function() {};

function showAddLessonModal() {
  const students = DB.get('students', { list: [] }).list;
  const studentOptions = students.length > 0
    ? '<option value="">选择学生</option>' + students.map(s => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join('')
    : '<option value="">手动输入学生名</option>';

  const body = `
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">学生姓名</label>
        <input class="input" id="lessonStudent" list="studentList" placeholder="输入或选择" autocomplete="off">
        <datalist id="studentList">${students.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">上课日期</label>
        <input type="date" class="input" id="lessonDate" value="${DB.formatDate()}">
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">科目</label>
      <input class="input" id="lessonSubject" placeholder="如：初二数学">
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="createLesson()">创建</button>`;
  Modal.show('新建备课', body, footer);
}

function createLesson() {
  const studentName = document.getElementById('lessonStudent').value.trim();
  const date = document.getElementById('lessonDate').value;
  const subject = document.getElementById('lessonSubject').value.trim();
  if (!studentName) { Toast.show('请填写学生姓名'); return; }
  const data = DB.get('lessonPrep', { list: [] });
  const lesson = {
    id: DB.uid(),
    studentName, date, subject,
    teacherVersion: '',
    studentVersion: '',
    notes: '',
    createdAt: DB.formatDate(),
  };
  data.list.push(lesson);
  DB.set('lessonPrep', data);
  Modal.close(document.querySelector('.modal-overlay'));
  viewLesson(lesson.id);
}

function viewLesson(id) {
  const data = DB.get('lessonPrep', { list: [] });
  const lesson = data.list.find(l => l.id === id);
  if (!lesson) return;

  let currentTab = 'teacher';
  const body = `
    <div class="flex gap-3 mb-3 flex-wrap">
      <span class="font-semibold">${esc(lesson.studentName)}</span>
      <span class="text-secondary">${esc(lesson.date || '')}</span>
      <span class="text-secondary">${esc(lesson.subject || '')}</span>
    </div>
    <div class="lesson-version-tabs">
      <div class="lesson-tab active" data-tab="teacher" onclick="switchLessonTab('teacher')">📝 教师版备课稿</div>
      <div class="lesson-tab" data-tab="student" onclick="switchLessonTab('student')">📄 学生版讲义</div>
    </div>
    <div id="lessonTabContent"></div>
  `;
  const overlay = Modal.show('备课详情', body, `
    <button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">关闭</button>
    <button class="btn btn-primary" onclick="saveLessonContent('${id}')">保存</button>
  `);
  overlay.dataset.lessonId = id;
  renderLessonTab(lesson, 'teacher');
}

function switchLessonTab(tab) {
  document.querySelectorAll('.lesson-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.lesson-tab[data-tab="${tab}"]`).classList.add('active');
  const data = DB.get('lessonPrep', { list: [] });
  const overlay = document.querySelector('.modal-overlay');
  const id = overlay.dataset.lessonId;
  const lesson = data.list.find(l => l.id === id);
  renderLessonTab(lesson, tab);
}

function renderLessonTab(lesson, tab) {
  const content = tab === 'teacher' ? lesson.teacherVersion : lesson.studentVersion;
  const placeholder = tab === 'teacher'
    ? '备课思路、拓展知识点、课堂话术、难题拓展、备用习题...\n\n仅自己可见'
    : '课堂讲义、课堂练习题...\n\n可导出文本/截图发给学生';
  const div = document.getElementById('lessonTabContent');
  div.innerHTML = `
    <textarea class="textarea" id="lessonContent" style="min-height:300px;line-height:1.8" placeholder="${placeholder}">${esc(content || '')}</textarea>
    ${tab === 'student' ? `<button class="btn btn-sm btn-secondary mt-2 copy-btn" onclick="copyLessonContent('${lesson.id}','student')">📋 复制讲义文本</button>` : ''}
  `;
  div.dataset.currentTab = tab;
}

function saveLessonContent(id) {
  const data = DB.get('lessonPrep', { list: [] });
  const lesson = data.list.find(l => l.id === id);
  if (!lesson) return;
  const content = document.getElementById('lessonContent').value;
  const tab = document.getElementById('lessonTabContent').dataset.currentTab;
  if (tab === 'teacher') lesson.teacherVersion = content;
  else lesson.studentVersion = content;
  DB.set('lessonPrep', data);
  Toast.show('已保存');
}

function copyLessonContent(id, type) {
  const data = DB.get('lessonPrep', { list: [] });
  const lesson = data.list.find(l => l.id === id);
  if (!lesson) return;
  const text = type === 'student' ? lesson.studentVersion : lesson.teacherVersion;
  copyToClipboard(text || '暂无内容');
}

// ---------- 6b. 学生管理 ----------
Modules.studentManagement = function() {
  const students = DB.get('students', { list: [] }).list;

  // 筛选状态
  const filterCategory = App.studentFilterCategory || 'all';
  const searchQuery = (App.studentSearchQuery || '').toLowerCase();
  const filterClass = App.studentFilterClass || 'all';
  const showArchived = App.studentShowArchived || false;

  // 计算统计数据
  const allCount = students.length;
  const nightCount = students.filter(s => (s.tags || []).includes('晚辅')).length;
  const englishCount = students.filter(s => (s.subjects || []).some(sub => (sub.subject || '').includes('英语'))).length;
  const mathCount = students.filter(s => (s.subjects || []).some(sub => (sub.subject || '').includes('数学'))).length;
  const archivedCount = students.filter(s => s.status === 'archived').length;

  // 班级列表
  const classSet = new Set();
  students.forEach(s => { if (s.className) classSet.add(s.className); });
  const classes = Array.from(classSet).sort();

  // 筛选学生
  let filtered = students.filter(s => {
    if (!showArchived && s.status === 'archived') return false;
    if (filterCategory === 'night') return (s.tags || []).includes('晚辅');
    if (filterCategory === 'english') return (s.subjects || []).some(sub => (sub.subject || '').includes('英语'));
    if (filterCategory === 'math') return (s.subjects || []).some(sub => (sub.subject || '').includes('数学'));
    if (filterCategory === 'archived') return s.status === 'archived';
    return true;
  });

  if (searchQuery) {
    filtered = filtered.filter(s => {
      const text = `${s.name} ${s.grade || ''} ${s.school || ''} ${s.className || ''} ${s.parentName || ''} ${s.notes || ''} ${(s.tags || []).join(' ')}`.toLowerCase();
      return text.includes(searchQuery);
    });
  }

  if (filterClass !== 'all') {
    filtered = filtered.filter(s => s.className === filterClass);
  }

  // 渲染统计标签
  const statItem = (key, num, label, active) => `
    <div class="student-stat ${active ? 'active' : ''}" onclick="App.studentFilterCategory='${key}';App.studentSearchQuery='';switchModule('studentManagement')">
      <div class="num">${num}</div>
      <div class="label">${label}</div>
    </div>
  `;

  const statsHTML = `
    <div class="student-stats-bar">
      ${statItem('all', allCount, '全部', filterCategory === 'all')}
      ${statItem('night', nightCount, '晚辅', filterCategory === 'night')}
      ${statItem('english', englishCount, '英语', filterCategory === 'english')}
      ${statItem('math', mathCount, '数学', filterCategory === 'math')}
      ${statItem('archived', archivedCount, '已归档', filterCategory === 'archived')}
    </div>
  `;

  // 搜索和筛选
  const filterHTML = `
    <div class="student-search-row">
      <input type="text" class="input" placeholder="搜索学生姓名、年级、学校..." value="${esc(App.studentSearchQuery || '')}" oninput="App.studentSearchQuery=this.value.trim();switchModule('studentManagement')">
      <select class="select" style="width:140px" onchange="App.studentFilterClass=this.value;switchModule('studentManagement')">
        <option value="all">全部班级</option>
        ${classes.map(c => `<option value="${esc(c)}" ${filterClass === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
      <button class="btn btn-primary" onclick="addStudent()">➕ 添加学生</button>
    </div>
  `;

  // 渲染学生卡片
  const cardsHTML = filtered.length === 0 ? `
    <div class="empty-state">
      <div class="empty-state-icon">👩‍🎓</div>
      <div class="empty-state-text">暂无匹配的学生</div>
    </div>
  ` : `
    <div class="item-grid">
      ${filtered.map(s => renderStudentCard(s)).join('')}
    </div>
  `;

  return `
    <div class="module-header">
      <div>
        <div class="module-title">学生管理</div>
        <div class="module-subtitle">管理学生档案、科目、班级与联系信息</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-secondary" onclick="App.studentShowArchived=${!showArchived};switchModule('studentManagement')">${showArchived ? '隐藏归档' : '显示归档'}</button>
      </div>
    </div>
    ${statsHTML}
    ${filterHTML}
    ${cardsHTML}
  `;
};
Modules.studentManagement.bindEvents = function() {};
Modules.studentManagement.init = function() {};

function renderStudentCard(s) {
  const avatarText = s.name ? s.name.slice(-2) : '?';
  const color = s.color || getStudentColor(s.name);
  const meta = [s.grade, s.school].filter(Boolean).join(' · ');
  const subjects = (s.subjects || []).map(sub => sub.subject).filter(Boolean);
  const tags = s.tags || [];

  // 科目标签
  const subjectTags = subjects.slice(0, 5).map(sub => `<span class="student-tag subject">${esc(sub)}</span>`).join('');
  // 其他标签分类
  const classTag = s.className ? `<span class="student-tag class">🎓 ${esc(s.className)}</span>` : '';
  const personalityTag = s.personality ? `<span class="student-tag level" title="学生性格">${esc(s.personality)}</span>` : '';
  const archiveTag = s.status === 'archived' ? `<span class="student-tag weak">已归档</span>` : '';
  const extraTags = tags.slice(0, 3).map(t => `<span class="student-tag">${esc(t)}</span>`).join('');

  return `
    <div class="student-card" onclick="editStudent('${s.id}')">
      <div class="student-card-header">
        <div class="student-avatar" style="background:${color}">${esc(avatarText)}</div>
        <div class="student-info">
          <div class="student-name">${esc(s.name)}</div>
          <div class="student-meta">${esc(meta || '暂无年级学校信息')}</div>
        </div>
      </div>
      <div class="student-tags">
        ${personalityTag}
        ${archiveTag}
        ${classTag}
        ${subjectTags}
        ${extraTags}
      </div>
      <div class="student-card-body">
        ${s.parentName ? `<div>家长：${esc(s.parentName)} ${s.phone ? esc(s.phone) : ''}</div>` : (s.phone ? `<div>联系方式：${esc(s.phone)}</div>` : '')}
        ${s.notes ? `<div>备注：${esc(s.notes)}</div>` : ''}
      </div>
      <div class="student-card-footer">
        <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();editStudent('${s.id}')">✏️ 编辑</button>
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();toggleStudentArchive('${s.id}')">${s.status === 'archived' ? '恢复' : '归档'}</button>
      </div>
    </div>
  `;
}

function toggleStudentArchive(id) {
  const data = DB.get('students', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  s.status = s.status === 'archived' ? 'active' : 'archived';
  DB.set('students', data);
  Toast.show(s.status === 'archived' ? '已归档' : '已恢复');
  switchModule('studentManagement');
}

// ---------- 7. 课消台账 ----------
Modules.studentHours = function() {
  const data = DB.get('studentHours', { list: [] });

  return `
    <div class="module-header">
      <div>
        <div class="module-title">学生课消台账</div>
        <div class="module-subtitle">课时管理 · 不足预警 · 可复制发家长核对</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddStudentModal()">➕ 添加学生</button>
      </div>
    </div>

    ${data.list.length > 0 ? `<div class="card" style="padding:0;overflow:hidden">
      <table class="data-table">
        <thead><tr>
          <th>学生姓名</th><th>总课时</th><th>已上课时</th><th>剩余课时</th><th>进度</th><th>操作</th>
        </tr></thead>
        <tbody>
          ${data.list.map(s => {
            const remain = s.totalHours - s.usedHours;
            const pct = s.totalHours > 0 ? Math.round(s.usedHours / s.totalHours * 100) : 0;
            const isLow = remain <= 3;
            return `<tr>
              <td class="font-semibold">${esc(s.name)}</td>
              <td>${s.totalHours}</td>
              <td>${s.usedHours}</td>
              <td class="${isLow ? 'text-danger font-bold' : ''}">${remain}${isLow ? ' ⚠️' : ''}</td>
              <td style="min-width:100px"><div class="progress-bar"><div class="progress-bar-fill ${isLow ? 'danger' : pct > 80 ? 'warning' : ''}" style="width:${pct}%"></div></div></td>
              <td>
                <button class="btn btn-sm btn-secondary" onclick="editStudentHours('${s.id}')">编辑</button>
                <button class="btn btn-sm btn-secondary" onclick="copyStudentHours('${s.id}')">📋</button>
                <button class="btn btn-sm btn-secondary" onclick="deleteStudentHours('${s.id}')">🗑️</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : '<div class="empty-state"><div class="empty-state-icon">📊</div><div class="empty-state-text">暂无学生记录</div></div>'}
  `;
};
Modules.studentHours.bindEvents = function() {};
Modules.studentHours.init = function() {};

function showAddStudentModal() {
  const body = `
    <div class="form-group"><label class="form-label">学生姓名</label><input class="input" id="stuName" placeholder="如：张小明" autocomplete="off"></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">总课时</label><input type="number" class="input" id="stuTotal" value="20" min="1"></div>
      <div class="form-group"><label class="form-label">已上课时</label><input type="number" class="input" id="stuUsed" value="0" min="0"></div>
    </div>
    <div class="form-group"><label class="form-label">家长联系方式（可选）</label><input class="input" id="stuPhone" placeholder="微信/手机号"></div>
    <div class="form-group"><label class="form-label">备注</label><textarea class="textarea" id="stuNotes" placeholder="如：每周二四上课"></textarea></div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addStudentHours()">添加</button>`;
  Modal.show('添加学生', body, footer);
}

function addStudentHours() {
  const name = document.getElementById('stuName').value.trim();
  if (!name) { Toast.show('请填写学生姓名'); return; }
  const data = DB.get('studentHours', { list: [] });
  data.list.push({
    id: DB.uid(), name,
    totalHours: parseInt(document.getElementById('stuTotal').value) || 0,
    usedHours: parseInt(document.getElementById('stuUsed').value) || 0,
    phone: document.getElementById('stuPhone').value.trim(),
    notes: document.getElementById('stuNotes').value.trim(),
    createdAt: DB.formatDate(),
  });
  DB.set('studentHours', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('学生已添加');
  switchModule('studentHours');
}

function editStudentHours(id) {
  const data = DB.get('studentHours', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  const body = `
    <div class="form-group"><label class="form-label">学生姓名</label><input class="input" id="editStuName" value="${esc(s.name)}" autocomplete="off"></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">总课时</label><input type="number" class="input" id="editStuTotal" value="${s.totalHours}" min="1"></div>
      <div class="form-group"><label class="form-label">已上课时</label><input type="number" class="input" id="editStuUsed" value="${s.usedHours}" min="0"></div>
    </div>
    <div class="form-group"><label class="form-label">备注</label><textarea class="textarea" id="editStuNotes">${esc(s.notes || '')}</textarea></div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="updateStudent('${id}')">保存</button>`;
  Modal.show('编辑学生', body, footer);
}

function updateStudent(id) {
  const data = DB.get('studentHours', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  s.name = document.getElementById('editStuName').value.trim();
  s.totalHours = parseInt(document.getElementById('editStuTotal').value) || 0;
  s.usedHours = parseInt(document.getElementById('editStuUsed').value) || 0;
  s.notes = document.getElementById('editStuNotes').value.trim();
  DB.set('studentHours', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已更新');
  switchModule('studentHours');
}

function deleteStudentHours(id) {
  const data = DB.get('studentHours', { list: [] });
  data.list = data.list.filter(s => s.id !== id);
  DB.set('studentHours', data);
  Toast.show('已删除');
  switchModule('studentHours');
}

function copyStudentHours(id) {
  const data = DB.get('studentHours', { list: [] });
  const s = data.list.find(x => x.id === id);
  if (!s) return;
  const text = `【${s.name}同学 课时记录】\n总课时：${s.totalHours} 课时\n已上课时：${s.usedHours} 课时\n剩余课时：${s.totalHours - s.usedHours} 课时\n\n如有疑问请及时联系核对，谢谢！`;
  copyToClipboard(text);
}

// ---------- 8. 成绩档案 ----------
Modules.grades = function() {
  const data = DB.get('grades', { list: [] });
  const allStudents = [...new Set(data.list.map(g => g.studentName))];
  if (!App.gradeStudent || !allStudents.includes(App.gradeStudent)) {
    App.gradeStudent = allStudents.length > 0 ? allStudents[0] : '';
  }
  const students = App.gradeStudent ? [App.gradeStudent] : allStudents;
  const studentName = App.gradeStudent;

  // 单生汇总
  const recs = data.list.filter(g => g.studentName === studentName).sort((a, b) => new Date(a.date) - new Date(b.date));
  let summaryHTML = '';
  if (recs.length > 0) {
    const scores = recs.map(r => Number(r.score) || 0);
    const avg = (scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1);
    const maxV = Math.max(...scores);
    const minV = Math.min(...scores);
    const trendUp = recs.length >= 2 && (Number(recs[recs.length - 1].score) > Number(recs[0].score));
    const trendDown = recs.length >= 2 && (Number(recs[recs.length - 1].score) < Number(recs[0].score));
    const trend = trendUp ? '<span style="color:var(--color-success,#5a9e5a);font-weight:700">↑ 上升</span>'
      : trendDown ? '<span style="color:var(--color-danger,#c46060);font-weight:700">↓ 下降</span>'
      : '<span class="text-light">→ 持平</span>';
    summaryHTML = `
      <div class="grid-4 grade-summary">
        <div class="summary-item"><div class="summary-val">${recs.length}</div><div class="summary-label">记录数</div></div>
        <div class="summary-item"><div class="summary-val">${avg}</div><div class="summary-label">平均分</div></div>
        <div class="summary-item"><div class="summary-val">${maxV} / ${minV}</div><div class="summary-label">最高 / 最低</div></div>
        <div class="summary-item"><div class="summary-val">${trend}</div><div class="summary-label">整体趋势</div></div>
      </div>`;
  }

  const tableRows = studentName
    ? data.list.filter(g => g.studentName === studentName).sort((a,b) => new Date(b.date) - new Date(a.date))
    : [];

  return `
    <div class="module-header">
      <div>
        <div class="module-title">学生成绩档案</div>
        <div class="module-subtitle">校内考试 & 机构测试 · 自动生成成绩趋势图</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddGradeModal()">➕ 录入成绩</button>
      </div>
    </div>

    ${allStudents.length > 0 ? `
      <div class="card mb-4">
        <div class="flex gap-2 flex-wrap items-center mb-3" style="align-items:center">
          <label class="form-label" style="margin:0">选择学生</label>
          <select class="select" id="gradeStudentSel" onchange="App.gradeStudent=this.value;switchModule('grades')">
            ${allStudents.map(name => `<option value="${esc(name)}" ${name === studentName ? 'selected' : ''}>${esc(name)}</option>`).join('')}
          </select>
        </div>

        ${summaryHTML}

        <div class="card-title mt-3">📈 ${esc(studentName)} 成绩趋势</div>
        <div class="chart-container"><canvas id="gradeChart" width="600" height="260"></canvas></div>
      </div>

      <div class="card" style="padding:0;overflow:hidden">
        <table class="data-table">
          <thead><tr><th>考试名称</th><th>类型</th><th>科目</th><th>分数</th><th>满分</th><th>日期</th><th>操作</th></tr></thead>
          <tbody>
            ${tableRows.map(g => `
              <tr>
                <td>${esc(g.examName)}</td>
                <td><span class="tag ${g.examType === 'school' ? 'tag-sage' : 'tag-tan'}">${g.examType === 'school' ? '校内' : '机构'}</span></td>
                <td>${esc(g.subject)}</td>
                <td class="font-bold">${g.score}</td>
                <td class="text-light">${g.fullScore}</td>
                <td>${g.date || ''}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="deleteGrade('${g.id}')">🗑️</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<div class="empty-state"><div class="empty-state-icon">📈</div><div class="empty-state-text">暂无成绩记录</div></div>'}
  `;
};
Modules.grades.bindEvents = function() {
  if (App.gradeStudent) {
    setTimeout(() => showGradeChart(App.gradeStudent), 100);
  }
};
Modules.grades.init = function() {};

function showAddGradeModal() {
  const students = DB.get('students', { list: [] }).list;
  const body = `
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">学生姓名</label>
        <input class="input" id="gradeStudent" list="gradeStudentList" placeholder="输入或选择" autocomplete="off">
        <datalist id="gradeStudentList">${students.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
      </div>
      <div class="form-group">
        <label class="form-label">考试名称</label>
        <input class="input" id="gradeExam" placeholder="如：期中考试、月考">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">考试类型</label>
        <select class="select" id="gradeType">
          <option value="school">校内考试</option>
          <option value="institution">机构测试</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">科目</label>
        <input class="input" id="gradeSubject" placeholder="如：数学">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">分数</label><input type="number" class="input" id="gradeScore" placeholder="如：85"></div>
      <div class="form-group"><label class="form-label">满分</label><input type="number" class="input" id="gradeFull" value="100"></div>
    </div>
    <div class="form-group"><label class="form-label">考试日期</label><input type="date" class="input" id="gradeDate" value="${DB.formatDate()}"></div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addGrade()">添加</button>`;
  Modal.show('录入成绩', body, footer);
}

function addGrade() {
  const studentName = document.getElementById('gradeStudent').value.trim();
  const examName = document.getElementById('gradeExam').value.trim();
  const subject = document.getElementById('gradeSubject').value.trim();
  const score = parseFloat(document.getElementById('gradeScore').value);
  if (!studentName || !subject || isNaN(score)) { Toast.show('请填写完整信息'); return; }
  const data = DB.get('grades', { list: [] });
  data.list.push({
    id: DB.uid(),
    studentName, examName,
    examType: document.getElementById('gradeType').value,
    subject, score,
    fullScore: parseFloat(document.getElementById('gradeFull').value) || 100,
    date: document.getElementById('gradeDate').value,
    createdAt: DB.formatDate(),
  });
  DB.set('grades', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('成绩已录入');
  switchModule('grades');
}

function deleteGrade(id) {
  const data = DB.get('grades', { list: [] });
  data.list = data.list.filter(g => g.id !== id);
  DB.set('grades', data);
  switchModule('grades');
}

function showGradeChart(studentName) {
  const data = DB.get('grades', { list: [] });
  const records = data.list.filter(g => g.studentName === studentName).sort((a, b) => new Date(a.date) - new Date(b.date));

  // 更新按钮选中状态
  document.querySelectorAll('.card-title').forEach(t => {
    if (t.textContent.includes('成绩趋势')) {
      const btns = t.parentElement.querySelectorAll('.flex button');
      btns.forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
        if (b.textContent === studentName) {
          b.classList.add('btn-primary');
          b.classList.remove('btn-secondary');
        }
      });
    }
  });

  const canvas = document.getElementById('gradeChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (records.length === 0) {
    ctx.fillStyle = '#AAA';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无成绩数据', W / 2, H / 2);
    return;
  }

  const padding = { top: 20, right: 30, bottom: 50, left: 50 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;

  const maxScore = Math.max(...records.map(r => r.fullScore));
  const minVal = 0;

  // 绘制坐标轴
  ctx.strokeStyle = '#E0DCD8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, H - padding.bottom);
  ctx.lineTo(W - padding.right, H - padding.bottom);
  ctx.stroke();

  // Y轴刻度
  ctx.fillStyle = '#AAA';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartH * (1 - i / 4);
    const val = Math.round(minVal + (maxScore - minVal) * i / 4);
    ctx.fillText(val, padding.left - 8, y + 4);
    ctx.strokeStyle = '#F0EEEC';
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
  }

  // 绘制折线
  const stepX = records.length > 1 ? chartW / (records.length - 1) : 0;
  const points = records.map((r, i) => ({
    x: padding.left + (records.length > 1 ? i * stepX : chartW / 2),
    y: padding.top + chartH * (1 - (r.score - minVal) / (maxScore - minVal)),
    r: r,
  }));

  // 折线
  ctx.strokeStyle = '#8B9A8B';
  ctx.lineWidth = 2;
  ctx.beginPath();
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();

  // 数据点
  points.forEach(p => {
    ctx.fillStyle = '#8B9A8B';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // X轴标签
  ctx.fillStyle = '#7A7A7A';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  points.forEach(p => {
    const label = (p.r.date || '').substring(5) + '\n' + p.r.score + '分';
    label.split('\n').forEach((line, i) => {
      ctx.fillText(line, p.x, H - padding.bottom + 15 + i * 14);
    });
  });
}

// ---------- 9. 课后反馈生成器 ----------
Modules.feedback = function() {
  const templates = DB.get('feedbackTemplates', { list: [] });

  return `
    <div class="module-header">
      <div>
        <div class="module-title">AI 课后反馈生成器</div>
        <div class="module-subtitle">录入课堂信息 → 一键生成家长反馈文案</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">📝 课堂信息录入</div>
        <div class="form-group"><label class="form-label">学生姓名</label><input class="input" id="fbStudent" placeholder="如：张小明" autocomplete="off"></div>
        <div class="form-group"><label class="form-label">授课内容</label><input class="input" id="fbContent" placeholder="如：二次函数图像与性质"></div>
        <div class="form-group"><label class="form-label">课堂状态</label>
          <select class="select" id="fbStatus">
            <option value="积极活跃，回答问题踊跃">积极活跃，回答问题踊跃</option>
            <option value="认真听讲，思路清晰">认真听讲，思路清晰</option>
            <option value="偶有走神，需要提醒">偶有走神，需要提醒</option>
            <option value="状态一般，参与度待提升">状态一般，参与度待提升</option>
            <option value="今天状态很好，比上次进步明显">今天状态很好，比上次进步明显</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">现存薄弱点</label><textarea class="textarea" id="fbWeakness" placeholder="如：计算容易出错、函数概念理解不够深入"></textarea></div>
        <div class="form-group"><label class="form-label">后续教学重点</label><textarea class="textarea" id="fbFocus" placeholder="如：加强计算训练、巩固函数基础概念"></textarea></div>
        <div class="form-group">
          <label class="form-label">语气风格</label>
          <select class="select" id="fbTone">
            <option value="professional">专业严谨</option>
            <option value="warm">温和鼓励</option>
            <option value="concise">简明扼要</option>
            <option value="detailed">详细丰富</option>
          </select>
        </div>
        <button class="btn btn-primary w-full" onclick="generateFeedback()">✨ 生成课后反馈</button>
      </div>

      <div>
        <div class="card">
          <div class="card-title">💬 生成结果</div>
          <div id="fbResult" class="lesson-doc" style="min-height:200px">
            <span class="text-light">点击"生成课后反馈"查看结果...</span>
          </div>
          <div class="flex gap-2 mt-3" id="fbActions" style="display:none">
            <button class="btn btn-primary" onclick="copyFeedback()">📋 复制文案</button>
            <button class="btn btn-secondary" onclick="saveFeedbackTemplate()">💾 保存为模板</button>
          </div>
        </div>
        ${templates.list.length > 0 ? `
          <div class="card">
            <div class="card-title">📋 已保存模板</div>
            ${templates.list.map(t => `
              <div class="flex justify-between items-center mb-2 p-2" style="background:var(--bg-input);border-radius:8px">
                <span class="text-sm">${esc(t.name)}</span>
                <div class="flex gap-2">
                  <button class="btn btn-sm btn-secondary" onclick="useTemplate('${t.id}')">使用</button>
                  <button class="btn btn-sm btn-secondary" onclick="deleteTemplate('${t.id}')">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
};
Modules.feedback.bindEvents = function() {};
Modules.feedback.init = function() {};

function generateFeedback() {
  const student = document.getElementById('fbStudent').value.trim();
  const content = document.getElementById('fbContent').value.trim();
  const status = document.getElementById('fbStatus').value;
  const weakness = document.getElementById('fbWeakness').value.trim();
  const focus = document.getElementById('fbFocus').value.trim();
  const tone = document.getElementById('fbTone').value;

  if (!student || !content) { Toast.show('请填写学生姓名和授课内容'); return; }

  let text = '';
  const now = DB.formatDate(new Date(), 'MM月DD日');

  if (tone === 'professional') {
    text = `家长您好，以下是${student}同学${now}的课堂反馈：\n\n【授课内容】${content}\n\n【课堂表现】${status}，整体学习态度端正。\n\n【掌握情况】本节课重点内容基本掌握，但在${weakness || '部分细节'}方面还需加强练习。\n\n【后续计划】下节课将着重${focus || '巩固本次内容并拓展提升'}，建议课后复习今日笔记并完成相关练习。\n\n如有疑问随时沟通，感谢您的配合！`;
  } else if (tone === 'warm') {
    text = `家长好呀～今天${now}给${student}同学上了${content}，跟您分享一下课堂情况：\n\n今天孩子${status}，特别棒！课堂上能跟上老师的节奏，知识点吸收得不错。\n\n不过呢，在${weakness || '个别知识点'}方面还有一点点小薄弱，不用太担心，多练习就好啦。\n\n接下来我们会重点${focus || '巩固练习'}，相信孩子会越来越好的！\n\n建议在家可以陪孩子复习一下今天的内容哦，有任何问题随时联系我～`;
  } else if (tone === 'concise') {
    text = `${student}同学 ${now} 课堂反馈：\n\n📚 内容：${content}\n😊 表现：${status}\n⚠️ 薄弱：${weakness || '暂无'}\n🎯 下步：${focus || '继续巩固'}\n\n请家长关注课后复习，有疑问随时沟通。`;
  } else {
    text = `家长您好，${now}课堂反馈如下：\n\n一、授课内容\n${content}\n\n二、课堂表现\n${status}。本节课孩子能够积极参与课堂互动，对重点知识点的理解较为到位。\n\n三、掌握情况分析\n课堂上通过提问和练习观察，孩子对基础概念掌握良好。但在${weakness || '综合应用'}方面存在不足，具体表现在解题思路不够灵活、计算准确率有待提高。\n\n四、薄弱点及改进建议\n${weakness ? `针对${weakness}的问题，建议：\n1. 课后针对性练习，每天10-15分钟\n2. 整理错题本，定期回顾\n3. 遇到不懂及时提问` : '继续保持练习频率，巩固已有知识。'}\n\n五、后续教学重点\n下节课计划：${focus || '在巩固本次内容的基础上，进行拓展训练'}。将根据孩子掌握情况适当调整教学节奏。\n\n六、作业建议\n请家长督促孩子完成今日布置的练习题，并于下次课前检查。感谢您的配合与支持！`;
  }

  document.getElementById('fbResult').textContent = text;
  document.getElementById('fbActions').style.display = 'flex';
  document.getElementById('fbResult').dataset.text = text;
  Toast.show('反馈已生成');
}

function copyFeedback() {
  const text = document.getElementById('fbResult').dataset.text || document.getElementById('fbResult').textContent;
  copyToClipboard(text);
}

function saveFeedbackTemplate() {
  const text = document.getElementById('fbResult').dataset.text || '';
  if (!text) return;
  const body = `<div class="form-group"><label class="form-label">模板名称</label><input class="input" id="tplName" placeholder="如：标准课后反馈模板"></div>`;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="confirmSaveTemplate()">保存</button>`;
  const overlay = Modal.show('保存模板', body, footer);
  overlay._templateText = text;
}

function confirmSaveTemplate() {
  const name = document.getElementById('tplName').value.trim();
  if (!name) { Toast.show('请填写模板名称'); return; }
  const overlay = document.querySelector('.modal-overlay');
  const data = DB.get('feedbackTemplates', { list: [] });
  data.list.push({ id: DB.uid(), name, template: overlay._templateText, createdAt: DB.formatDate() });
  DB.set('feedbackTemplates', data);
  Modal.close(overlay);
  Toast.show('模板已保存');
  switchModule('feedback');
}

function useTemplate(id) {
  const data = DB.get('feedbackTemplates', { list: [] });
  const t = data.list.find(x => x.id === id);
  if (t) {
    document.getElementById('fbResult').textContent = t.template;
    document.getElementById('fbResult').dataset.text = t.template;
    document.getElementById('fbActions').style.display = 'flex';
    Toast.show('已加载模板');
  }
}

function deleteTemplate(id) {
  const data = DB.get('feedbackTemplates', { list: [] });
  data.list = data.list.filter(t => t.id !== id);
  DB.set('feedbackTemplates', data);
  switchModule('feedback');
}

// ---------- 学情报告（面向家长，月度） ----------
// 7大模块：学习概况/成绩分析/课堂表现/知识点评估/学习计划/老师寄语/升学规划
// 每个模块均可 AI 一键生成，数据存储在 studentReports[studentId]
Modules.report = function() {
  const students = DB.get('students', { list: [] }).list;
  const now = new Date();
  const selectedMonth = App.reportMonth || `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const selStudent = App.reportStudent || (students.length > 0 ? students[0].id : '');

  if (students.length === 0) {
    return `
      <div class="module-header"><div><div class="module-title">学情报告</div><div class="module-subtitle">月度家长反馈 · 7大模块 · 每模块AI生成</div></div></div>
      <div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">请先在排课管理中添加学生</div></div>`;
  }

  let monthOpts = '';
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    monthOpts += `<option value="${val}" ${val === selectedMonth ? 'selected' : ''}>${d.getFullYear()}年${d.getMonth()+1}月</option>`;
  }
  const student = students.find(s => s.id === selStudent) || students[0];
  const studentName = student.name;
  const reportData = DB.get('studentReports', {})[selStudent] || {};

  // 自动统计
  const schedule = DB.get('schedule', { list: [] });
  const monthClasses = schedule.list.filter(s => s.studentName === studentName && getSlotActualDate(s).startsWith(selectedMonth));
  const doneCount = monthClasses.filter(s => s.status === 'done').length;
  const leaveCount = monthClasses.filter(s => s.status === 'leave').length;
  const totalHours = monthClasses.reduce((sum, c) => sum + calcSlotHours(c), 0);
  const attendanceRate = monthClasses.length > 0 ? Math.round((doneCount / monthClasses.length) * 100) : 0;

  const grades = DB.get('grades', { list: [] }).list.filter(g => g.studentName === studentName);
  const monthGrades = grades.filter(g => (g.date || '').startsWith(selectedMonth));

  // 7个模块配置
  const F = [
    { key: 'overview',    label: '1. 本月学习概况',     icon: '📊', placeholder: 'AI将根据上课记录自动生成概述', rows: 3 },
    { key: 'scoreAnalysis', label: '2. 成绩分析与趋势',  icon: '📈', placeholder: 'AI将根据成绩数据自动分析强弱科与趋势', rows: 4 },
    { key: 'performance', label: '3. 课堂表现与学习态度', icon: '🎯', placeholder: 'AI将根据出勤数据生成课堂表现评价', rows: 3 },
    { key: 'knowledge',   label: '4. 知识点掌握评估',    icon: '📚', placeholder: 'AI将结合科目与成绩生成知识点诊断', rows: 4 },
    { key: 'scorePlan',   label: '5. 🎯 提分计划（优先级排序）', icon: '🚀', placeholder: 'AI将按可提升空间排序各科，输出阶段冲刺计划', rows: 6 },
    { key: 'studyPlan',   label: '6. 下月学习计划与重点', icon: '🗓', placeholder: 'AI将生成针对性提分方案与重点安排', rows: 4 },
    { key: 'teacherNote', label: '7. 老师寄语',          icon: '💡', placeholder: 'AI将生成个性化寄语', rows: 3 },
    { key: 'goalPlan',    label: '8. 目标与升学规划',    icon: '🎓', placeholder: 'AI将结合目标院校生成差距分析与建议', rows: 4 },
  ];

  const moduleCards = F.map(f => {
    const val = reportData[f.key] || '';
    const cardCls = f.key === 'scorePlan' ? 'report-module-card score-plan-card' : 'report-module-card';
    return `
      <div class="${cardCls}" style="border-left:3px solid var(--border-color-secondary);border-radius:var(--radius);padding:12px 14px;margin-bottom:10px;background:var(--bg-card)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-weight:500;font-size:13px">${f.icon} ${f.label}</span>
          <button class="btn btn-xs" style="background:var(--color-primary-light,#EEEDFE);color:var(--color-primary,#534AB7);border:none" onclick="aiGenerateReportField('${selStudent}','${f.key}','${selectedMonth}')">✨ AI生成</button>
        </div>
        <textarea class="textarea" id="rep_${f.key}" rows="${f.rows}" placeholder="${f.placeholder}" oninput="saveReportField('${selStudent}','${f.key}',this.value)">${esc(val)}</textarea>
      </div>`;
  }).join('');

  return `
    <div class="module-header">
      <div><div class="module-title">学情报告</div><div class="module-subtitle">月度家长反馈 · 7大模块 · 每模块AI生成</div></div>
      <div class="module-actions">
        <button class="btn btn-secondary" onclick="generateAllReport('${selStudent}','${selectedMonth}')">✨ 一键AI生成全部</button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="grid-2">
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">学生</label>
          <select class="select" onchange="App.reportStudent=this.value;switchModule('report')">
            ${students.map(s => `<option value="${s.id}" ${s.id===selStudent?'selected':''}>${esc(s.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom:0">
          <label class="form-label">报告月份</label>
          <select class="select" onchange="App.reportMonth=this.value;switchModule('report')">${monthOpts}</select>
        </div>
      </div>
      <div class="grid-3 mt-3" style="display:flex;gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:100px;background:var(--bg-secondary);border-radius:var(--radius);padding:8px 12px;text-align:center">
          <div style="font-size:12px;color:var(--text-secondary)">上课节数</div>
          <div style="font-size:18px;font-weight:500">${monthClasses.length}</div>
        </div>
        <div style="flex:1;min-width:100px;background:var(--bg-secondary);border-radius:var(--radius);padding:8px 12px;text-align:center">
          <div style="font-size:12px;color:var(--text-secondary)">已上完</div>
          <div style="font-size:18px;font-weight:500">${doneCount}</div>
        </div>
        <div style="flex:1;min-width:100px;background:var(--bg-secondary);border-radius:var(--radius);padding:8px 12px;text-align:center">
          <div style="font-size:12px;color:var(--text-secondary)">出勤率</div>
          <div style="font-size:18px;font-weight:500">${attendanceRate}%</div>
        </div>
        <div style="flex:1;min-width:100px;background:var(--bg-secondary);border-radius:var(--radius);padding:8px 12px;text-align:center">
          <div style="font-size:12px;color:var(--text-secondary)">成绩记录</div>
          <div style="font-size:18px;font-weight:500">${monthGrades.length}</div>
        </div>
      </div>
      <div class="form-group mt-3" style="margin-bottom:0">
        <label class="form-label">目标院校 / 目标分数</label>
        <input class="input" id="repTarget" value="${esc(reportData.targetSchool || '')}" placeholder="如：市重点高中 / 数学 115 分" oninput="saveReportField('${selStudent}','targetSchool',this.value)">
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-title">📝 七大模块编辑（每模块可AI生成）</div>
      ${moduleCards}
    </div>

    <div class="card">
      <div class="card-title">📋 报告预览</div>
      <div class="lesson-doc" id="reportPreview" style="font-size:13px;white-space:pre-wrap">${esc(generateReportTextContent(selStudent, selectedMonth))}</div>
      <div class="flex gap-2 mt-3 flex-wrap">
        <button class="btn btn-primary" onclick="copyReport('${selStudent}','${selectedMonth}')">📋 复制报告</button>
        <button class="btn btn-secondary" onclick="exportReportImage('${selStudent}','${selectedMonth}')">📸 导出图片</button>
        <button class="btn btn-sm btn-secondary" onclick="importAIPlan('${selStudent}')">📥 从AI助手导入提分计划</button>
      </div>
    </div>
  `;
};
Modules.report.bindEvents = function() {};

// 按学生保存报告字段
function saveReportField(studentId, field, value) {
  const all = DB.get('studentReports', {});
  if (!all[studentId]) all[studentId] = {};
  all[studentId][field] = value;
  DB.set('studentReports', all);
  const prev = document.getElementById('reportPreview');
  if (prev) prev.textContent = generateReportTextContent(studentId, App.reportMonth);
}

// 收集学生本月数据（供AI生成用）
function collectReportData(studentId, month) {
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  if (!student) return null;
  const name = student.name;
  const schedule = DB.get('schedule', { list: [] });
  const monthClasses = schedule.list.filter(s => s.studentName === name && getSlotActualDate(s).startsWith(month));
  const doneCount = monthClasses.filter(s => s.status === 'done').length;
  const leaveCount = monthClasses.filter(s => s.status === 'leave').length;
  const changedCount = monthClasses.filter(s => s.status === 'changed').length;
  const subjects = (student.subjects || []).map(sub => sub.subject || '').filter(Boolean);
  const grades = DB.get('grades', { list: [] }).list.filter(g => g.studentName === name);
  const monthGrades = grades.filter(g => (g.date || '').startsWith(month)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const prevGrades = grades.filter(g => (g.date || '') < month).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0, 10);
  const reportData = DB.get('studentReports', {})[studentId] || {};
  return { student, name, monthClasses, doneCount, leaveCount, changedCount, subjects, monthGrades, prevGrades, reportData, month };
}

// AI生成各模块内容
function aiGenerateReportField(studentId, field, month) {
  const d = collectReportData(studentId, month);
  if (!d) { Toast.show('未找到学生'); return; }
  let content = '';
  const total = d.monthClasses.length;
  const doneN = d.doneCount;
  const rate = total > 0 ? Math.round(doneN / total * 100) : 0;
  const [y, m] = month.split('-');

  switch (field) {
    case 'overview': {
      const subjList = d.subjects.length > 0 ? d.subjects.join('、') : '各科目';
      content = `${d.name}同学${y}年${m}月共安排${total}节课，已上完${doneN}节，出勤率${rate}%`;
      if (d.leaveCount > 0) content += `，请假${d.leaveCount}次`;
      if (d.changedCount > 0) content += `，调课${d.changedCount}次`;
      content += `。本月主要学习科目为${subjList}。`;
      if (doneN === total && total > 0) content += '全月课程均按计划完成，学习节奏稳定。';
      else if (rate >= 80) content += '整体出勤情况良好，能较好地跟上教学进度。';
      else if (rate < 60) content += '本月部分课程未按时完成，需关注学习连续性。';
      content += '总体学习态度认真，希望在接下来的学习中保持势头。';
      break;
    }
    case 'scoreAnalysis': {
      if (d.monthGrades.length === 0) {
        content = '本月暂无正式成绩记录。根据课堂练习和随堂测验观察，';
        if (d.subjects.length > 0) {
          content += `${d.subjects[0]}方面`;
          const s = d.prevGrades.filter(g => g.subject === d.subjects[0]);
          if (s.length > 0) {
            const lastScore = Number(s[0].score) || 0;
            const lastFull = Number(s[0].fullScore) || 100;
            const pct = Math.round(lastScore / lastFull * 100);
            content += `上次${s[0].examName}得分${lastScore}/${lastFull}（${pct}%），`;
            content += pct >= 85 ? '基础扎实，可适当增加拓展训练。' : pct >= 70 ? '有一定基础，需强化薄弱环节。' : '基础有待加强，建议查漏补缺。';
          } else {
            content += '建议尽快安排一次阶段性测试以明确当前水平。';
          }
        }
      } else {
        const bySubject = {};
        d.monthGrades.forEach(g => {
          if (!bySubject[g.subject]) bySubject[g.subject] = [];
          bySubject[g.subject].push(g);
        });
        const subjStats = Object.keys(bySubject).map(sub => {
          const arr = bySubject[sub];
          const avg = (arr.reduce((s,g)=>s+(Number(g.score)||0),0) / arr.length).toFixed(1);
          const fullAvg = (arr.reduce((s,g)=>s+(Number(g.fullScore)||100),0) / arr.length);
          const pct = Math.round(Number(avg) / fullAvg * 100);
          return { sub, avg, pct, count: arr.length };
        });
        const strong = subjStats.filter(s => s.pct >= 85).map(s => s.sub);
        const weak = subjStats.filter(s => s.pct < 70).map(s => s.sub);
        content = `本月共有${d.monthGrades.length}条成绩记录，涉及${subjStats.length}个科目。\n`;
        content += subjStats.map(s => `  ${s.sub}：平均${s.avg}分（${s.pct}%）`).join('\n');
        if (strong.length > 0) content += `\n优势科目：${strong.join('、')}，掌握情况良好，可适当拔高。`;
        if (weak.length > 0) content += `\n薄弱科目：${weak.join('、')}，需重点加强基础训练和错题整理。`;
        // 与上月对比
        if (d.prevGrades.length > 0) {
          const prevAvg = d.prevGrades.slice(0, 5).reduce((s,g)=>s+(Number(g.score)||0),0) / Math.min(d.prevGrades.length, 5);
          const curAvg = d.monthGrades.reduce((s,g)=>s+(Number(g.score)||0),0) / d.monthGrades.length;
          if (curAvg > prevAvg) content += `\n与上月相比，整体成绩呈上升趋势（${prevAvg.toFixed(1)}→${curAvg.toFixed(1)}），进步明显。`;
          else if (curAvg < prevAvg) content += `\n与上月相比，整体成绩略有下滑（${prevAvg.toFixed(1)}→${curAvg.toFixed(1)}），需查找原因。`;
          else content += `\n与上月相比，成绩基本持平，需寻找新的突破点。`;
        }
      }
      break;
    }
    case 'performance': {
      content = `${d.name}同学本月`;
      if (rate >= 90) content += '出勤非常积极，几乎全勤';
      else if (rate >= 75) content += '出勤情况良好，能按时上课';
      else if (d.leaveCount > 2) content += `本月请假${d.leaveCount}次，需关注时间安排`;
      else content += '出勤基本正常';
      content += '。';
      // 课堂表现推断
      if (doneN === total && total >= 4) content += '课堂参与度高，能跟上教学节奏，作业完成情况较好。学习态度端正，有主动提问的意识。';
      else if (doneN >= total * 0.6) content += '课堂表现认真，大部分课程能积极参与。建议加强课后复习，巩固课堂所学。';
      else content += '建议保持稳定的上课频率，避免知识断层。课堂专注度有提升空间，需加强互动。';
      if (d.changedCount > 0) content += `本月有${d.changedCount}次调课，已灵活调整。`;
      break;
    }
    case 'knowledge': {
      if (d.monthGrades.length > 0) {
        const bySub = {};
        d.monthGrades.forEach(g => {
          if (!bySub[g.subject]) bySub[g.subject] = [];
          bySub[g.subject].push(g);
        });
        content = '根据本月成绩与课堂表现，知识点掌握情况如下：\n';
        Object.keys(bySub).forEach(sub => {
          const arr = bySub[sub];
          const avg = arr.reduce((s,g)=>s+(Number(g.score)||0),0) / arr.length;
          const full = arr.reduce((s,g)=>s+(Number(g.fullScore)||100),0) / arr.length;
          const pct = Math.round(avg / full * 100);
          if (pct >= 85) content += `\n【${sub}】已较好掌握基础知识和核心考点，建议拓展高难度题型训练，冲刺拔高。`;
          else if (pct >= 70) content += `\n【${sub}】基础知识点基本掌握，部分中档题仍有失分，需加强易错点辨析和规范解题步骤。`;
          else content += `\n【${sub}】基础知识存在薄弱环节，建议回归教材，逐章梳理知识点，配合基础练习巩固。`;
        });
      } else {
        const subs = d.subjects.length > 0 ? d.subjects : ['当前科目'];
        content = '根据课堂观察与练习反馈：\n';
        subs.forEach(sub => {
          content += `\n【${sub}】正在按计划推进学习，基础概念理解逐步深入。建议加强课后习题训练，重点关注错题归纳与定期回顾。`;
        });
      }
      break;
    }
    case 'scorePlan': {
      // 智能提分计划：汇总所有成绩 → 按科目算当前均分 → 对比目标 → 输出每科需提多少分
      const allGrades = [...d.monthGrades, ...d.prevGrades];
      if (allGrades.length === 0) {
        content = '⚠️ 暂无任何成绩数据，无法生成提分计划。\n\n请先在「成绩档案」中录入至少一次考试记录，系统将自动分析各科当前水平、提分空间，并生成针对性提分方案。';
        break;
      }

      // 按科目汇总所有成绩，计算当前均分
      const bySub = {};
      allGrades.forEach(g => {
        if (!bySub[g.subject]) bySub[g.subject] = [];
        bySub[g.subject].push(g);
      });

      // 从目标里提取数字
      const targetRaw = d.reportData.targetSchool || '';
      const targetMatch = targetRaw.match(/(\d{2,4})\s*分/);
      const targetTotal = targetMatch ? Number(targetMatch[1]) : null;

      // 每科：当前均分、满分、得分率、最近趋势
      const subAnalysis = Object.keys(bySub).map(sub => {
        const arr = bySub[sub].sort((a, b) => new Date(a.date) - new Date(b.date));
        const scores = arr.map(g => Number(g.score) || 0);
        const fulls = arr.map(g => Number(g.fullScore) || 100);
        const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
        const avgFull = fulls.reduce((s, v) => s + v, 0) / fulls.length;
        const pct = Math.round(avgScore / avgFull * 100);
        const latest = scores[scores.length - 1];
        const earliest = scores[0];
        const trend = latest - earliest; // 正数=进步，负数=退步
        // 单科目标：满分或得分率90%取高
        const subTarget = Math.round(avgFull * 0.9);
        const gap = Math.max(0, subTarget - avgScore);
        return { sub, avgScore: avgScore.toFixed(1), avgFull: Math.round(avgFull), pct, latest, trend, gap, arr, subTarget };
      });

      // 当前总分 / 满分总分
      const curTotal = subAnalysis.reduce((s, r) => s + Number(r.avgScore), 0);
      const fullTotal = subAnalysis.reduce((s, r) => s + r.avgFull, 0);
      const targetTotalAll = subAnalysis.reduce((s, r) => s + r.subTarget, 0);

      // 如果有目标分数线，按提分空间比例分配差距
      let needGap = null;
      if (targetTotal != null) {
        needGap = targetTotal - curTotal;
      }

      content = '🎯 智能提分计划\n';
      content += '━━━━━━━━━━━━━━━━━━\n\n';
      content += `📈 当前总分：${curTotal.toFixed(1)} / ${fullTotal} 分\n`;
      if (targetTotal != null) {
        content += `🎯 目标总分：${targetTotal} 分\n`;
        if (needGap > 0) {
          content += `⚠️ 差距：还需提升 ${needGap.toFixed(1)} 分\n`;
        } else if (needGap <= 0) {
          content += `✅ 已达标！当前总分已超过目标 ${Math.abs(needGap).toFixed(1)} 分\n`;
        }
      } else {
        content += `🎯 理论目标：${targetTotalAll} 分（各科90%得分率）\n`;
        content += `⚠️ 差距：还需提升 ${(targetTotalAll - curTotal).toFixed(1)} 分\n`;
      }
      content += '\n';

      // 按提分空间降序排列（空间最大的优先提）
      const sorted = [...subAnalysis].sort((a, b) => b.gap - a.gap);

      content += '📊 各科提分分析（按提分空间排序）：\n';
      content += '━━━━━━━━━━━━━━━━━━\n';
      sorted.forEach((r, i) => {
        const trendIcon = r.trend > 5 ? '📈 进步中' : r.trend < -5 ? '📉 需警惕' : '➡️ 平稳';
        const level = r.pct >= 85 ? '⭐ 优势科' : r.pct >= 70 ? '🔄 中等科' : '⚠️ 薄弱科';
        content += `\n${i + 1}. 【${r.sub}】${level} ${trendIcon}\n`;
        content += `   当前均分：${r.avgScore} / ${r.avgFull}（得分率 ${r.pct}%）\n`;
        content += `   最近成绩：${r.latest} 分\n`;
        content += `   目标分数：${r.subTarget} 分\n`;
        content += `   ⬆️ 需提升：${r.gap.toFixed(1)} 分\n`;

        // 具体提分建议
        if (r.gap >= 20) {
          content += `   💡 建议：基础薄弱，优先回归教材查漏补缺，每周2-3次专项训练\n`;
          content += `        预计4-6周可提 ${Math.round(r.gap * 0.5)}-${Math.round(r.gap * 0.7)} 分\n`;
        } else if (r.gap >= 10) {
          content += `   💡 建议：重点攻克中档题，整理错题本，每周1-2套针对性练习\n`;
          content += `        预计3-4周可提 ${Math.round(r.gap * 0.5)}-${Math.round(r.gap * 0.7)} 分\n`;
        } else if (r.gap >= 5) {
          content += `   💡 建议：巩固现有水平，减少失误，适当拔高难题\n`;
          content += `        预计2-3周可提 ${Math.round(r.gap * 0.4)}-${Math.round(r.gap * 0.6)} 分\n`;
        } else {
          content += `   💡 建议：保持优势，重点防失误，可适当拓展高难度题型\n`;
        }
      });

      // 如果有目标总分差距，分配到各科
      if (needGap != null && needGap > 0) {
        content += '\n\n📋 提分分配方案（基于目标差距）：\n';
        content += '━━━━━━━━━━━━━━━━━━\n';
        const totalGap = sorted.reduce((s, r) => s + r.gap, 0);
        if (totalGap > 0) {
          sorted.forEach(r => {
            const share = totalGap > 0 ? (r.gap / totalGap) * needGap : 0;
            const realistic = Math.min(r.gap, share * 1.2); // 保留余量
            content += `  · ${r.sub}：分摊提分目标 +${realistic.toFixed(1)} 分`;
            content += `（当前 ${r.avgScore} → 目标 ${(Number(r.avgScore) + realistic).toFixed(1)}）\n`;
          });
          content += `\n  合计：+${needGap.toFixed(1)} 分 → 达到目标 ${targetTotal} 分\n`;
        }
      }

      // 阶段计划
      content += '\n\n📅 阶段行动计划：\n';
      content += '━━━━━━━━━━━━━━━━━━\n';
      const weakSubs = sorted.filter(r => r.pct < 70);
      const midSubs = sorted.filter(r => r.pct >= 70 && r.pct < 85);
      const strongSubs = sorted.filter(r => r.pct >= 85);

      if (weakSubs.length > 0) {
        content += `\n🔴 第一阶段（1-4周）— 主攻薄弱科目：\n`;
        weakSubs.forEach(r => {
          content += `   · ${r.sub}：基础概念梳理 + 课本例题精做 + 每日1小时专项\n`;
        });
      }
      if (midSubs.length > 0) {
        content += `\n🟡 第二阶段（5-8周）— 提升中等科目：\n`;
        midSubs.forEach(r => {
          content += `   · ${r.sub}：中档题突破 + 错题归纳 + 每周2套模拟\n`;
        });
      }
      if (strongSubs.length > 0) {
        content += `\n🟢 第三阶段（9-12周）— 巩固优势科目：\n`;
        strongSubs.forEach(r => {
          content += `   · ${r.sub}：拔高训练 + 压轴题攻关 + 保持手感\n`;
        });
      }
      content += `\n🔄 第四阶段（考前2周）— 全科模拟冲刺 + 查漏补缺\n`;

      // 总结
      content += '\n\n━━━━━━━━━━━━━━━━━━\n';
      content += `📌 总结：${d.name}同学当前总分 ${curTotal.toFixed(1)} 分`;
      if (targetTotal != null) {
        content += `，距目标 ${targetTotal} 分`;
        if (needGap > 0) content += `还差 ${needGap.toFixed(1)} 分`;
      }
      content += '。\n';
      if (weakSubs.length > 0) {
        content += `重点提分科目：${weakSubs.map(r => r.sub).join('、')}（提分空间最大）。\n`;
      }
      content += '按以上计划执行，预计8-12周内可实现目标。';
      break;
    }
    case 'studyPlan': {
      const subs = d.subjects.length > 0 ? d.subjects : ['数学'];
      const weakSubs = d.monthGrades.length > 0
        ? Object.keys(d.monthGrades.reduce((acc, g) => {
            const pct = (Number(g.score)||0) / (Number(g.fullScore)||100) * 100;
            if (pct < 75) acc[g.subject] = true;
            return acc;
          }, {}))
        : [];
      content = `${d.name}同学下月学习计划：\n\n一、学习重点\n`;
      if (weakSubs.length > 0) {
        content += `  优先加强${weakSubs.join('、')}，安排专项训练，每周至少完成2套针对性练习。\n`;
      } else {
        content += `  巩固${subs.join('、')}基础知识，适当增加拓展题型，拔高综合应用能力。\n`;
      }
      content += '\n二、每周安排\n';
      subs.forEach((sub, i) => {
        content += `  第${i+1}周：${sub}重点章节复习+错题整理\n`;
      });
      content += '\n三、目标\n';
      if (d.monthGrades.length > 0) {
        const curAvg = d.monthGrades.reduce((s,g)=>s+(Number(g.score)||0),0) / d.monthGrades.length;
        content += `  下月各科平均分目标提升${Math.ceil(curAvg * 0.05)}分以上，争取在下次测试中取得明显进步。\n`;
      } else {
        content += '  完成本月知识点的系统复习，安排一次阶段性测试检验学习效果。\n';
      }
      content += '\n四、建议\n  保持稳定上课频率，课后及时复习当天内容，每周整理一次错题本。';
      break;
    }
    case 'teacherNote': {
      content = `亲爱的${d.name}家长：\n\n`;
      if (rate >= 85) content += `${d.name}同学本月学习态度非常认真，出勤积极，课堂上能够紧跟教学节奏。`;
      else content += `${d.name}同学本月整体表现稳定，在老师的引导下逐步建立学习习惯。`;
      if (d.monthGrades.length > 0) {
        const avg = d.monthGrades.reduce((s,g)=>s+(Number(g.score)||0),0) / d.monthGrades.length;
        if (avg >= 85) content += '成绩方面表现优异，基础扎实，有冲击更高目标的潜力。';
        else if (avg >= 70) content += '成绩稳步提升中，只要持续努力，进步空间很大。';
        else content += '成绩还有较大提升空间，我们会针对性地加强辅导，也请您在家给予鼓励和督促。';
      }
      content += `\n\n感谢您一直以来的信任与配合。我们会持续关注${d.name}的学习状态，针对性调整教学方案。欢迎随时沟通，也欢迎把咱们推荐给身边有需要的朋友～`;
      break;
    }
    case 'goalPlan': {
      const target = d.reportData.targetSchool || '';
      content = `当前目标：${target || '（待设定，请在上方填写目标院校/分数）'}\n\n`;
      if (d.monthGrades.length > 0) {
        const avg = d.monthGrades.reduce((s,g)=>s+(Number(g.score)||0),0) / d.monthGrades.length;
        const fullAvg = d.monthGrades.reduce((s,g)=>s+(Number(g.fullScore)||100),0) / d.monthGrades.length;
        const pct = Math.round(avg / fullAvg * 100);
        content += `当前水平：本月各科平均得分率${pct}%\n`;
        if (target) {
          if (pct >= 85) content += '距离目标已比较接近，继续保持当前学习强度，重点攻克高难度题型即可冲刺目标。\n';
          else if (pct >= 70) content += '与目标有一定差距，需在薄弱科目上加大投入，建议每周增加2-3小时专项训练。\n';
          else content += '与目标差距较大，建议调整学习策略，从基础抓起，循序渐进缩小差距。\n';
        }
      } else {
        content += '建议尽快安排测试以明确当前水平与目标差距。\n';
      }
      const fc = d.student.graduation && d.student.graduation.remainingHours ? Number(d.student.graduation.remainingHours) : null;
      if (fc != null && fc > 0) {
        const subs = d.subjects.length > 0 ? d.subjects : ['当前科目'];
        const gradObj = d.student.graduation || {};
        const weeklyH = gradObj.weeklyHours ? Number(gradObj.weeklyHours) : 2;
        const weeks = Math.ceil(fc / weeklyH);
        content += `\n剩余课时约${fc}课时，按当前每周约${formatDecimalHours(weeklyH)}课时计算，预计还可上课约${weeks}周。`;
      }
      content += '\n\n建议：保持稳定的学习节奏，每月进行一次阶段性检测，及时调整方向。';
      break;
    }
    default:
      content = '（请点击AI生成按钮）';
  }

  // 填入 textarea 并保存
  const ta = document.getElementById('rep_' + field);
  if (ta) { ta.value = content; ta.scrollTop = 0; }
  saveReportField(studentId, field, content);
  // 刷新预览
  const prev = document.getElementById('reportPreview');
  if (prev) prev.textContent = generateReportTextContent(studentId, month);
  Toast.show('AI已生成「' + ({overview:'学习概况',scoreAnalysis:'成绩分析',performance:'课堂表现',knowledge:'知识点评估',scorePlan:'提分计划',studyPlan:'学习计划',teacherNote:'老师寄语',goalPlan:'升学规划'}[field] || field) + '」');
}

// 一键AI生成全部模块
function generateAllReport(studentId, month) {
  const fields = ['overview','scoreAnalysis','performance','knowledge','scorePlan','studyPlan','teacherNote','goalPlan'];
  let i = 0;
  const step = () => {
    if (i >= fields.length) { Toast.show('全部模块已AI生成完毕'); return; }
    aiGenerateReportField(studentId, fields[i], month);
    i++;
    setTimeout(step, 300);
  };
  step();
}

// 从 AI 对话抓取最近一条与"计划/提分/提升"相关的回复，填入学习计划
function importAIPlan(studentId) {
  const chats = DB.get('aiChats', { ta: [], prep: [] });
  const list = [].concat(chats.ta || [], chats.prep || []).filter(m => m.role === 'ai');
  if (list.length === 0) { Toast.show('AI 对话里还没有内容'); return; }
  const kw = ['计划','提分','提升','规划','方案','建议'];
  let picked = list.reverse().find(m => kw.some(k => (m.content||'').includes(k))) || list[0];
  const ta = document.getElementById('rep_studyPlan');
  if (ta) {
    ta.value = picked.content;
    saveReportField(studentId, 'studyPlan', picked.content);
    Toast.show('已从 AI 助手导入提分计划');
  }
}

// 生成报告正文（纯文本，供复制/导出）
function generateReportTextContent(studentId, month) {
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  if (!student) return '';
  const name = student.name;
  const [y, m] = month.split('-');
  const rd = DB.get('studentReports', {})[studentId] || {};
  const schedule = DB.get('schedule', { list: [] });
  const monthClasses = schedule.list.filter(s => s.studentName === name && getSlotActualDate(s).startsWith(month));
  const doneCount = monthClasses.filter(s => s.status === 'done').length;
  const totalHours = monthClasses.reduce((sum, c) => sum + calcSlotHours(c), 0);
  const rate = monthClasses.length > 0 ? Math.round(doneCount / monthClasses.length * 100) : 0;

  const grades = DB.get('grades', { list: [] }).list.filter(g => g.studentName === name);
  const monthGrades = grades.filter(g => (g.date || '').startsWith(month)).sort((a,b)=>new Date(a.date)-new Date(b.date));
  let gradeBlock = '本月暂无成绩记录';
  if (monthGrades.length > 0) {
    const scores = monthGrades.map(g => Number(g.score)||0);
    const avg = (scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1);
    gradeBlock = monthGrades.map(g => `  · ${g.date} ${g.examName}（${g.subject}）：${g.score}/${g.fullScore}`).join('\n')
      + `\n  本月平均：${avg} 分`;
  }

  const fld = (key, label) => {
    const v = rd[key];
    return v && v.trim() ? v.trim() : `（点击「✨ AI生成」自动填充）`;
  };

  const text =
`【${name}同学 ${y}年${m}月 学情报告】
━━━━━━━━━━━━━━━━━━
一、本月学习概况
  · 上课 ${monthClasses.length} 节，已上完 ${doneCount} 节，约 ${formatDecimalHours(totalHours)} 课时，出勤率 ${rate}%
  · 目标：${rd.targetSchool || '（待设定）'}

${fld('overview','学习概况')}

二、成绩分析与趋势

${fld('scoreAnalysis','成绩分析')}

本月成绩记录：
${gradeBlock}

三、课堂表现与学习态度

${fld('performance','课堂表现')}

四、知识点掌握评估

${fld('knowledge','知识点评估')}

五、提分计划（按可提升空间排序）

${fld('scorePlan','提分计划')}

六、下月学习计划与重点

${fld('studyPlan','学习计划')}

七、老师寄语

${fld('teacherNote','老师寄语')}

八、目标与升学规划

${fld('goalPlan','升学规划')}

━━━━━━━━━━━━━━━━━━
教培备考工作台 · ${name} 专属学情报告
${y}年${m}月`;
  return text;
}

function generateReportText(studentId, month) {
  const prev = document.getElementById('reportPreview');
  if (prev) prev.textContent = generateReportTextContent(studentId, month);
  Toast.show('报告已生成');
}

function copyReport(studentId, month) {
  copyToClipboard(generateReportTextContent(studentId, month));
}

// 导出报告图片（Canvas，离线可用）
function exportReportImage(studentId, month) {
  hideExportBg();
  const text = generateReportTextContent(studentId, month);
  const students = DB.get('students', { list: [] }).list;
  const student = students.find(s => s.id === studentId);
  const name = student ? student.name : '学生';
  const canvas = document.createElement('canvas');
  const W = 760;
  const lineH = 24;
  const padding = 36;
  const lines = text.split('\n');
  const totalH = padding * 2 + lines.length * lineH + 20;
  canvas.width = W * 2;
  canvas.height = totalH * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, totalH);
  // 顶部色条
  ctx.fillStyle = '#5B7A5B';
  ctx.fillRect(0, 0, W, 4);
  let y = padding;
  lines.forEach(line => {
    if (line.startsWith('【')) {
      ctx.fillStyle = '#3C3489';
      ctx.font = 'bold 17px -apple-system, sans-serif';
    } else if (line.startsWith('━')) {
      ctx.fillStyle = '#B4B2A9';
      ctx.font = '13px -apple-system, sans-serif';
    } else if (/^[一二三四五六七]、/.test(line)) {
      ctx.fillStyle = '#534AB7';
      ctx.font = '500 15px -apple-system, sans-serif';
    } else {
      ctx.fillStyle = '#4A4A4A';
      ctx.font = '14px -apple-system, sans-serif';
    }
    ctx.fillText(line, padding, y);
    y += lineH;
  });
  canvas.toBlob(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `学情报告_${name}_${month}.png`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('报告图片已下载');
    restoreExportBg();
  }, 'image/png');
}

// ---------- 10. 中考分数测算 ----------
Modules.scoreCalc = function() {
  const data = DB.get('scoreCalc', Models.scoreCalc);
  const subjects = [
    { key: 'chinese', name: '语文', full: 150, ratio: 1.0 },
    { key: 'math', name: '数学', full: 150, ratio: 1.0 },
    { key: 'english', name: '英语', full: 150, ratio: 1.0 },
    { key: 'physics', name: '物理', full: 100, ratio: 0.9 },
    { key: 'chemistry', name: '化学', full: 100, ratio: 0.6 },
    { key: 'history', name: '历史', full: 100, ratio: 0.5 },
    { key: 'politics', name: '道德与法治', full: 100, ratio: 0.5 },
    { key: 'pe', name: '体育', full: 40, ratio: 1.0 },
    { key: 'experiment', name: '实验操作', full: 20, ratio: 1.0 },
    { key: 'geography', name: '地理', full: 100, ratio: 0.3 },
    { key: 'biology', name: '生物', full: 100, ratio: 0.3 },
  ];

  let totalScore = 0;
  subjects.forEach(s => {
    const raw = parseFloat(data.scores[s.key]) || 0;
    totalScore += raw * s.ratio;
  });
  totalScore = Math.round(totalScore * 10) / 10;

  return `
    <div class="module-header">
      <div>
        <div class="module-title">德化中考分数测算器</div>
        <div class="module-subtitle">泉州德化中考折算比例 · 输入原始分自动折算投档总分</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">📝 输入原始分数</div>
        ${subjects.map(s => {
          const val = data.scores[s.key] || '';
          return `<div class="flex items-center gap-2 mb-2">
            <span style="width:80px;font-size:13px">${s.name}</span>
            <input type="number" class="input" style="flex:1" placeholder="满分${s.full}" value="${val}" data-subject="${s.key}" data-full="${s.full}" data-ratio="${s.ratio}" oninput="calcScore()">
            <span class="text-xs text-light" style="width:60px">×${s.ratio}</span>
          </div>`;
        }).join('')}
        <div class="text-xs text-light mt-3" style="padding:8px;background:var(--bg-input);border-radius:8px">
          💡 折算比例参考德化中考政策，可在代码中修改 ratio 值更新
        </div>
      </div>

      <div>
        <div class="card" style="border-color:var(--color-primary)">
          <div class="card-title">📊 折算结果</div>
          <div class="text-center" style="padding:20px 0">
            <div class="text-light text-sm">投档总分</div>
            <div class="font-bold" style="font-size:48px;color:var(--color-primary-dark)" id="totalScore">${totalScore}</div>
            <div class="text-light text-xs">满分 735 分</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">🎯 目标高中 & 提分计划</div>
          <div class="form-group">
            <label class="form-label">目标高中</label>
            <input class="input" id="targetSchool" value="${esc(data.targetSchool || '')}" placeholder="如：德化一中">
          </div>
          <div class="form-group">
            <label class="form-label">目标高中分数线</label>
            <input type="number" class="input" id="targetScore" placeholder="如：650">
          </div>
          <button class="btn btn-primary w-full" onclick="generateStudyPlan()">🤖 AI生成提分计划</button>
          <div id="studyPlan" class="mt-3"></div>
        </div>

        <div class="card">
          <div class="card-title">📋 分数线管理</div>
          <div class="text-xs text-light mb-2">手动录入每年分数线，支持更新</div>
          <div id="cutoffList">
            ${(data.cutoffScores || []).map(c => `
              <div class="flex justify-between items-center mb-2 p-2" style="background:var(--bg-input);border-radius:8px">
                <span class="text-sm">${esc(c.schoolName)} (${c.year})</span>
                <span class="font-bold">${c.cutoffScore}分</span>
              </div>
            `).join('')}
          </div>
          <button class="btn btn-sm btn-secondary w-full mt-2" onclick="addCutoffScore()">➕ 添加分数线</button>
        </div>
      </div>
    </div>
  `;
};
Modules.scoreCalc.bindEvents = function() {};
Modules.scoreCalc.init = function() {};

function calcScore() {
  let total = 0;
  document.querySelectorAll('[data-subject]').forEach(input => {
    const val = parseFloat(input.value) || 0;
    const ratio = parseFloat(input.dataset.ratio);
    total += val * ratio;
  });
  total = Math.round(total * 10) / 10;
  document.getElementById('totalScore').textContent = total;

  // 保存
  const data = DB.get('scoreCalc', Models.scoreCalc);
  document.querySelectorAll('[data-subject]').forEach(input => {
    data.scores[input.dataset.subject] = input.value;
  });
  data.targetSchool = document.getElementById('targetSchool').value;
  DB.set('scoreCalc', data);
}

function generateStudyPlan() {
  const school = document.getElementById('targetSchool').value.trim();
  const targetScore = parseFloat(document.getElementById('targetScore').value);
  const currentScore = parseFloat(document.getElementById('totalScore').textContent);

  if (!school || isNaN(targetScore)) { Toast.show('请填写目标高中和分数线'); return; }

  const gap = Math.round((targetScore - currentScore) * 10) / 10;
  const subjects = [];
  document.querySelectorAll('[data-subject]').forEach(input => {
    const val = parseFloat(input.value) || 0;
    const full = parseFloat(input.dataset.full);
    const ratio = parseFloat(input.dataset.ratio);
    if (val < full * 0.8) {
      subjects.push({ name: input.previousElementSibling.textContent, val, full, ratio, gap: (full - val) * ratio });
    }
  });
  subjects.sort((a, b) => b.gap - a.gap);

  let plan = `🎯 ${school}提分计划\n\n`;
  plan += `当前总分：${currentScore}分\n目标分数线：${targetScore}分\n差距：${gap > 0 ? '还需提' + gap + '分' : '已达标！🎉'}\n\n`;

  if (gap > 0) {
    plan += `📈 提分优先级（按可提升空间排序）：\n\n`;
    subjects.slice(0, 4).forEach((s, i) => {
      plan += `${i + 1}. ${s.name}（当前${s.val}/${s.full}）\n`;
      plan += `   可提升空间：${Math.round(s.gap * 10) / 10}分\n`;
      plan += `   建议：针对性练习+错题分析，争取提${Math.round(s.gap * 0.6 * 10) / 10}分\n\n`;
    });
    plan += `📅 阶段计划：\n`;
    plan += `第一阶段（1-2月）：补基础，主攻薄弱科目\n`;
    plan += `第二阶段（3-4月）：专题突破，提升中档题得分率\n`;
    plan += `第三阶段（5-6月）：模拟冲刺，查漏补缺\n`;
  }

  document.getElementById('studyPlan').innerHTML = `<div class="lesson-doc" style="font-size:13px">${esc(plan)}</div>`;
  Toast.show('提分计划已生成');
}

function addCutoffScore() {
  const body = `
    <div class="form-group"><label class="form-label">学校名称</label><input class="input" id="coSchool" placeholder="如：德化一中"></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">年份</label><input class="input" id="coYear" placeholder="如：2025" value="${new Date().getFullYear()}"></div>
      <div class="form-group"><label class="form-label">分数线</label><input type="number" class="input" id="coScore" placeholder="如：650"></div>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveCutoff()">保存</button>`;
  Modal.show('添加分数线', body, footer);
}

function saveCutoff() {
  const schoolName = document.getElementById('coSchool').value.trim();
  const year = document.getElementById('coYear').value.trim();
  const cutoffScore = parseFloat(document.getElementById('coScore').value);
  if (!schoolName || isNaN(cutoffScore)) { Toast.show('请填写完整'); return; }
  const data = DB.get('scoreCalc', Models.scoreCalc);
  if (!data.cutoffScores) data.cutoffScores = [];
  data.cutoffScores.push({ schoolName, year, cutoffScore });
  DB.set('scoreCalc', data);
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已添加');
  switchModule('scoreCalc');
}

// ---------- 11. 素材库 ----------
Modules.materials = function() {
  const data = DB.get('materials', { list: [] });
  const presetTags = ['初中教学', '易错题', '家长话术', '考证真题', '背诵笔记'];

  return `
    <div class="module-header">
      <div>
        <div class="module-title">教研 & 备考素材库</div>
        <div class="module-subtitle">文字/图片素材 · 标签分类筛选 · 支持百度网盘导入</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddMaterialModal()">➕ 添加素材</button>
        <button class="btn btn-secondary" onclick="showBaiduImportModal()">📁 百度网盘导入</button>
      </div>
    </div>

    <div class="card mb-3">
      <div class="flex gap-2 flex-wrap items-center">
        <span class="text-sm text-secondary">筛选：</span>
        <span class="tag active" onclick="filterMaterials('')">全部</span>
        ${presetTags.map(t => `<span class="tag" onclick="filterMaterials('${t}')">${t}</span>`).join('')}
      </div>
    </div>

    ${data.list.length > 0 ? `<div class="item-grid" id="materialsGrid">` + data.list.map(m => `
      <div class="item-card" data-tags="${(m.tags || []).join(',')}">
        <div class="item-card-title">${esc(m.title)}</div>
        ${m.content ? `<div class="item-card-desc">${esc(m.content.substring(0, 100))}${m.content.length > 100 ? '...' : ''}</div>` : ''}
        ${m.image ? `<img src="${m.image}" style="width:100%;border-radius:8px;margin:8px 0;max-height:200px;object-fit:cover" onclick="previewImage('${m.id}')">` : ''}
        <div class="item-card-footer">
          <div class="flex gap-2 flex-wrap">
            ${(m.tags || []).map(t => `<span class="tag tag-sage">${esc(t)}</span>`).join('')}
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-secondary" onclick="editMaterial('${m.id}')">编辑</button>
            <button class="btn btn-sm btn-secondary" onclick="deleteMaterial('${m.id}')">🗑️</button>
          </div>
        </div>
      </div>
    `).join('') + `</div>` : '<div class="empty-state"><div class="empty-state-icon">📁</div><div class="empty-state-text">暂无素材</div></div>'}
  `;
};
Modules.materials.bindEvents = function() {};
Modules.materials.init = function() {};

function showAddMaterialModal(id) {
  const data = DB.get('materials', { list: [] });
  const mat = id ? data.list.find(m => m.id === id) : null;
  const presetTags = ['初中教学', '易错题', '家长话术', '考证真题', '背诵笔记'];
  const selectedTags = mat ? (mat.tags || []) : [];

  const body = `
    <div class="form-group"><label class="form-label">标题</label><input class="input" id="matTitle" value="${mat ? esc(mat.title) : ''}" placeholder="素材标题"></div>
    <div class="form-group"><label class="form-label">内容</label><textarea class="textarea" id="matContent" style="min-height:120px" placeholder="文字内容，可直接粘贴...">${mat ? esc(mat.content || '') : ''}</textarea></div>
    <div class="form-group">
      <label class="form-label">图片（可选）</label>
      <input type="file" accept="image/*" class="input" id="matImage" onchange="previewMatImage(this)">
      <div id="matImagePreview" style="margin-top:8px">${mat && mat.image ? `<img src="${mat.image}" style="max-width:100%;max-height:150px;border-radius:8px">` : ''}</div>
    </div>
    <div class="form-group">
      <label class="form-label">标签</label>
      <div class="flex gap-2 flex-wrap" id="matTags">
        ${presetTags.map(t => `<span class="tag ${selectedTags.includes(t) ? 'active' : ''}" onclick="this.classList.toggle('active')">${t}</span>`).join('')}
      </div>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="saveMaterial('${id || ''}')">保存</button>`;
  const overlay = Modal.show(id ? '编辑素材' : '添加素材', body, footer);
  if (mat && mat.image) overlay._image = mat.image;
}

let matImageDataURL = null;
function previewMatImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    Toast.show('图片过大（>8MB），建议压缩后再上传');
  }
  readFileAsDataURL(file).then(dataURL => {
    matImageDataURL = dataURL;
    document.getElementById('matImagePreview').innerHTML = `<img src="${dataURL}" style="max-width:100%;max-height:150px;border-radius:8px">`;
  });
}

function saveMaterial(id) {
  const title = document.getElementById('matTitle').value.trim();
  if (!title) { Toast.show('请填写标题'); return; }
  const content = document.getElementById('matContent').value.trim();
  const tags = [];
  document.querySelectorAll('#matTags .tag.active').forEach(t => tags.push(t.textContent));

  const data = DB.get('materials', { list: [] });
  if (id) {
    const mat = data.list.find(m => m.id === id);
    if (mat) {
      mat.title = title;
      mat.content = content;
      mat.tags = tags;
      if (matImageDataURL) mat.image = matImageDataURL;
    }
  } else {
    data.list.push({
      id: DB.uid(),
      title, content, tags,
      image: matImageDataURL,
      source: 'manual',
      createdAt: DB.formatDate(),
    });
  }
  DB.set('materials', data);
  matImageDataURL = null;
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已保存');
  switchModule('materials');
}

function editMaterial(id) { showAddMaterialModal(id); }

function deleteMaterial(id) {
  const data = DB.get('materials', { list: [] });
  data.list = data.list.filter(m => m.id !== id);
  DB.set('materials', data);
  switchModule('materials');
}

function filterMaterials(tag) {
  document.querySelectorAll('.card .tag').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('#materialsGrid .item-card').forEach(card => {
    const tags = card.dataset.tags || '';
    if (!tag || tags.includes(tag)) card.style.display = '';
    else card.style.display = 'none';
  });
}

function showBaiduImportModal() {
  const body = `
    <div class="text-sm text-secondary mb-3" style="padding:12px;background:var(--bg-input);border-radius:8px">
      📌 百度网盘导入说明：<br>
      1. 在百度网盘App/网页中选择文件，下载到本地<br>
      2. 点击下方按钮选择已下载的文件<br>
      3. 文件内容将保存到浏览器本地存储<br>
      <br>
      <span class="text-warning">注意：仅做素材导入，不做网盘实时双向同步</span>
    </div>
    <div class="form-group">
      <label class="form-label">素材标题</label>
      <input class="input" id="baiduTitle" placeholder="如：初二数学易错题集">
    </div>
    <div class="form-group">
      <label class="form-label">选择本地文件</label>
      <input type="file" class="input" id="baiduFile" accept="image/*,.txt,.pdf">
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="importFromBaidu()">导入</button>`;
  Modal.show('百度网盘导入', body, footer);
}

function importFromBaidu() {
  const title = document.getElementById('baiduTitle').value.trim();
  const fileInput = document.getElementById('baiduFile');
  if (!title) { Toast.show('请填写标题'); return; }
  if (!fileInput.files[0]) { Toast.show('请选择文件'); return; }
  const file = fileInput.files[0];
  if (file.type.startsWith('image/')) {
    readFileAsDataURL(file).then(dataURL => {
      const data = DB.get('materials', { list: [] });
      data.list.push({ id: DB.uid(), title, content: '', tags: ['初中教学'], image: dataURL, source: 'baidu', createdAt: DB.formatDate() });
      DB.set('materials', data);
      Modal.close(document.querySelector('.modal-overlay'));
      Toast.show('素材已导入');
      switchModule('materials');
    });
  } else {
    const data = DB.get('materials', { list: [] });
    data.list.push({ id: DB.uid(), title, content: `文件名: ${file.name}（文本类文件请手动复制内容）`, tags: [], image: null, source: 'baidu', createdAt: DB.formatDate() });
    DB.set('materials', data);
    Modal.close(document.querySelector('.modal-overlay'));
    Toast.show('素材已导入');
    switchModule('materials');
  }
}

function previewImage(id) {
  const data = DB.get('materials', { list: [] });
  const mat = data.list.find(m => m.id === id);
  if (mat && mat.image) {
    const overlay = Modal.show('图片预览', `<img src="${mat.image}" style="width:100%;border-radius:8px">`);
  }
}

// ---------- 12. 真题集 ----------
Modules.examBank = function() {
  const data = DB.get('examBank', { list: [] });

  return `
    <div class="module-header">
      <div>
        <div class="module-title">备考真题集</div>
        <div class="module-subtitle">导入真题 · 标记错题 · 自动生成错题复盘</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddExamModal()">➕ 添加真题</button>
      </div>
    </div>

    ${data.list.length > 0 ? `
      <div class="grid-2 mb-4">
        <div class="stat-card">
          <span class="stat-icon">📑</span>
          <span class="stat-label">真题总数</span>
          <span class="stat-value">${data.list.length}</span>
        </div>
        <div class="stat-card">
          <span class="stat-icon">❌</span>
          <span class="stat-label">错题数量</span>
          <span class="stat-value">${data.list.filter(e => e.isWrong).length}</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📋 错题复盘清单</div>
        ${data.list.filter(e => e.isWrong).length > 0 ? data.list.filter(e => e.isWrong).map(e => `
          <div class="item-card mb-3">
            <div class="flex justify-between items-center">
              <div class="item-card-title">${esc(e.title)}</div>
              <span class="tag tag-mauve">${esc(e.subject || '')} ${esc(e.year || '')}</span>
            </div>
            ${e.wrongReason ? `<div class="item-card-desc mt-2"><strong>错因：</strong>${esc(e.wrongReason)}</div>` : ''}
            ${e.image ? `<img src="${e.image}" style="max-width:100%;max-height:200px;border-radius:8px;margin-top:8px">` : ''}
          </div>
        `).join('') : '<div class="empty-state"><div class="empty-state-text">暂无错题</div></div>'}
      </div>

      <div class="card mt-4">
        <div class="card-title">📑 全部真题</div>
        <div class="item-grid">
          ${data.list.map(e => `
            <div class="item-card">
              <div class="flex justify-between items-center">
                <div class="item-card-title">${esc(e.title)}</div>
                ${e.isWrong ? '<span class="tag tag-mauve">错题</span>' : ''}
              </div>
              <div class="text-xs text-light">${esc(e.subject || '')} ${esc(e.year || '')}</div>
              ${e.image ? `<img src="${e.image}" style="max-width:100%;max-height:150px;border-radius:8px;margin-top:8px">` : ''}
              <div class="item-card-footer">
                <span class="text-xs text-light">${e.createdAt || ''}</span>
                <div class="flex gap-2">
                  <button class="btn btn-sm ${e.isWrong ? 'btn-warm' : 'btn-secondary'}" onclick="toggleWrong('${e.id}')">${e.isWrong ? '✓ 已纠错' : '标记错题'}</button>
                  <button class="btn btn-sm btn-secondary" onclick="deleteExam('${e.id}')">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : '<div class="empty-state"><div class="empty-state-icon">📑</div><div class="empty-state-text">暂无真题</div></div>'}
  `;
};
Modules.examBank.bindEvents = function() {};
Modules.examBank.init = function() {};

function showAddExamModal() {
  const body = `
    <div class="form-group"><label class="form-label">题目标题</label><input class="input" id="examTitle" placeholder="如：2024初级会计实务第1题"></div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">科目</label><input class="input" id="examSubject" placeholder="如：会计实务"></div>
      <div class="form-group"><label class="form-label">年份</label><input class="input" id="examYear" placeholder="如：2024"></div>
    </div>
    <div class="form-group">
      <label class="form-label">题目图片</label>
      <input type="file" accept="image/*" class="input" id="examImage" onchange="previewExamImage(this)">
      <div id="examImagePreview" style="margin-top:8px"></div>
    </div>
    <div class="form-group">
      <label class="form-label">是否错题</label>
      <select class="select" id="examIsWrong">
        <option value="false">否</option>
        <option value="true">是</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">错因分析</label>
      <textarea class="textarea" id="examWrongReason" placeholder="如：概念混淆、计算错误..."></textarea>
    </div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addExam()">添加</button>`;
  Modal.show('添加真题', body, footer);
}

let examImageDataURL = null;
function previewExamImage(input) {
  const file = input.files[0];
  if (!file) return;
  readFileAsDataURL(file).then(dataURL => {
    examImageDataURL = dataURL;
    document.getElementById('examImagePreview').innerHTML = `<img src="${dataURL}" style="max-width:100%;max-height:150px;border-radius:8px">`;
  });
}

function addExam() {
  const title = document.getElementById('examTitle').value.trim();
  if (!title) { Toast.show('请填写标题'); return; }
  const data = DB.get('examBank', { list: [] });
  data.list.push({
    id: DB.uid(),
    title,
    subject: document.getElementById('examSubject').value.trim(),
    year: document.getElementById('examYear').value.trim(),
    image: examImageDataURL,
    isWrong: document.getElementById('examIsWrong').value === 'true',
    wrongReason: document.getElementById('examWrongReason').value.trim(),
    tags: [],
    createdAt: DB.formatDate(),
  });
  DB.set('examBank', data);
  examImageDataURL = null;
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('真题已添加');
  switchModule('examBank');
}

function toggleWrong(id) {
  const data = DB.get('examBank', { list: [] });
  const exam = data.list.find(e => e.id === id);
  if (exam) {
    exam.isWrong = !exam.isWrong;
    if (exam.isWrong && !exam.wrongReason) {
      const reason = prompt('请输入错因分析：');
      if (reason) exam.wrongReason = reason;
    }
    DB.set('examBank', data);
    switchModule('examBank');
  }
}

function deleteExam(id) {
  const data = DB.get('examBank', { list: [] });
  data.list = data.list.filter(e => e.id !== id);
  DB.set('examBank', data);
  switchModule('examBank');
}

// ---------- 13. 错题收集板 ----------
Modules.errorBoard = function() {
  const data = DB.get('errorBoard', { list: [] });
  const studentErrors = data.list.filter(e => e.category === 'student');
  const personalErrors = data.list.filter(e => e.category === 'personal');

  function renderErrorList(errors) {
    if (errors.length === 0) return '<div class="empty-state"><div class="empty-state-text">暂无错题</div></div>';
    return errors.map(e => `
      <div class="item-card mb-3">
        <div class="flex justify-between items-center">
          <div class="item-card-title">${esc(e.studentName || '个人')} · ${esc(e.subject || '')}</div>
          <div class="flex gap-2">
            ${(e.tags || []).map(t => `<span class="tag tag-sage">${esc(t)}</span>`).join('')}
            <button class="btn btn-sm btn-secondary" onclick="deleteError('${e.id}')">🗑️</button>
          </div>
        </div>
        ${e.questionImage ? `<img src="${e.questionImage}" style="max-width:100%;max-height:200px;border-radius:8px;margin-top:8px">` : ''}
        ${e.wrongAnswer ? `<div class="text-sm mt-2"><span class="text-danger">错答：</span>${esc(e.wrongAnswer)}</div>` : ''}
        ${e.correctAnswer ? `<div class="text-sm mt-1"><span class="text-success">正答：</span>${esc(e.correctAnswer)}</div>` : ''}
        ${e.analysis ? `<div class="text-sm text-secondary mt-1">📊 ${esc(e.analysis)}</div>` : ''}
        <div class="text-xs text-light mt-2">${e.createdAt || ''}</div>
      </div>
    `).join('');
  }

  return `
    <div class="module-header">
      <div>
        <div class="module-title">错题收集板</div>
        <div class="module-subtitle">学生错题 & 个人备考错题 · 分区存储</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddErrorModal()">➕ 添加错题</button>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-title">👩‍🎓 学生错题</div>
        ${renderErrorList(studentErrors)}
      </div>
      <div class="card">
        <div class="card-title">📖 个人备考错题</div>
        ${renderErrorList(personalErrors)}
      </div>
    </div>
  `;
};
Modules.errorBoard.bindEvents = function() {};
Modules.errorBoard.init = function() {};

function showAddErrorModal() {
  const students = DB.get('students', { list: [] }).list;
  const body = `
    <div class="form-group">
      <label class="form-label">错题类型</label>
      <div class="segmented">
        <button class="active" data-cat="student">学生错题</button>
        <button data-cat="personal">个人备考错题</button>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">学生/来源</label>
      <input class="input" id="errStudent" list="errStudentList" placeholder="学生姓名或来源" autocomplete="off">
      <datalist id="errStudentList">${students.map(s => `<option value="${esc(s.name)}">`).join('')}</datalist>
    </div>
    <div class="form-group"><label class="form-label">科目</label><input class="input" id="errSubject" placeholder="如：数学"></div>
    <div class="form-group">
      <label class="form-label">题目截图</label>
      <input type="file" accept="image/*" class="input" id="errImage" onchange="previewErrImage(this)">
      <div id="errImagePreview" style="margin-top:8px"></div>
    </div>
    <div class="grid-2">
      <div class="form-group"><label class="form-label">错误答案</label><input class="input" id="errWrong" placeholder="如：B"></div>
      <div class="form-group"><label class="form-label">正确答案</label><input class="input" id="errCorrect" placeholder="如：D"></div>
    </div>
    <div class="form-group"><label class="form-label">错因解析</label><textarea class="textarea" id="errAnalysis" placeholder="如：混淆了...概念"></textarea></div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addError()">添加</button>`;
  const overlay = Modal.show('添加错题', body, footer);
  let errCat = 'student';
  overlay.querySelectorAll('.segmented button').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.segmented button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      errCat = btn.dataset.cat;
    };
  });
  overlay._errCat = () => errCat;
}

let errImageDataURL = null;
function previewErrImage(input) {
  const file = input.files[0];
  if (!file) return;
  readFileAsDataURL(file).then(dataURL => {
    errImageDataURL = dataURL;
    document.getElementById('errImagePreview').innerHTML = `<img src="${dataURL}" style="max-width:100%;max-height:150px;border-radius:8px">`;
  });
}

function addError() {
  const overlay = document.querySelector('.modal-overlay');
  const data = DB.get('errorBoard', { list: [] });
  data.list.push({
    id: DB.uid(),
    category: overlay._errCat(),
    studentName: document.getElementById('errStudent').value.trim(),
    subject: document.getElementById('errSubject').value.trim(),
    questionImage: errImageDataURL,
    wrongAnswer: document.getElementById('errWrong').value.trim(),
    correctAnswer: document.getElementById('errCorrect').value.trim(),
    analysis: document.getElementById('errAnalysis').value.trim(),
    tags: [],
    createdAt: DB.formatDate(),
  });
  DB.set('errorBoard', data);
  errImageDataURL = null;
  Modal.close(overlay);
  Toast.show('错题已添加');
  switchModule('errorBoard');
}

function deleteError(id) {
  const data = DB.get('errorBoard', { list: [] });
  data.list = data.list.filter(e => e.id !== id);
  DB.set('errorBoard', data);
  switchModule('errorBoard');
}

// ---------- 14. 学习时长统计 ----------
Modules.statistics = function() {
  const data = DB.get('studyTime', { records: [] });
  const weekRange = DB.getWeekRange();

  // 本周数据
  const weekRecords = data.records.filter(r => {
    const d = new Date(r.date);
    return d >= weekRange.start && d <= weekRange.end;
  });
  const weekLesson = weekRecords.filter(r => r.type === 'lesson').reduce((s, r) => s + r.duration, 0);
  const weekPrep = weekRecords.filter(r => r.type === 'prep').reduce((s, r) => s + r.duration, 0);

  // 最近4周数据
  const last4Weeks = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(weekRange.start);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const records = data.records.filter(r => {
      const d = new Date(r.date);
      return d >= start && d <= end;
    });
    last4Weeks.push({
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      lesson: records.filter(r => r.type === 'lesson').reduce((s, r) => s + r.duration, 0),
      prep: records.filter(r => r.type === 'prep').reduce((s, r) => s + r.duration, 0),
    });
  }

  return `
    <div class="module-header">
      <div>
        <div class="module-title">学习时长统计</div>
        <div class="module-subtitle">备课时长 & 备考学习时长 · 每周统计图表</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="showAddStudyTimeModal()">➕ 记录时长</button>
      </div>
    </div>

    <div class="grid-2 mb-4">
      <div class="stat-card">
        <span class="stat-icon">📚</span>
        <span class="stat-label">本周备课时长</span>
        <span class="stat-value">${Math.floor(weekLesson / 60)}h${weekLesson % 60}m</span>
        <span class="stat-extra">${weekLesson} 分钟</span>
      </div>
      <div class="stat-card">
        <span class="stat-icon">📖</span>
        <span class="stat-label">本周备考时长</span>
        <span class="stat-value">${Math.floor(weekPrep / 60)}h${weekPrep % 60}m</span>
        <span class="stat-extra">${weekPrep} 分钟</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📊 最近4周学习时长</div>
      <div class="chart-container"><canvas id="studyChart" width="600" height="260"></canvas></div>
    </div>

    <div class="card mt-4">
      <div class="card-title">📋 最近记录</div>
      ${data.records.length > 0 ? data.records.slice(-20).reverse().map(r => `
        <div class="flex justify-between items-center mb-2 p-2" style="background:var(--bg-input);border-radius:8px">
          <div>
            <span class="tag ${r.type === 'lesson' ? 'tag-sage' : 'tag-tan'}">${r.type === 'lesson' ? '备课' : '备考'}</span>
            <span class="text-sm ml-2">${esc(r.label || '')}</span>
          </div>
          <div class="text-sm">
            <span class="font-bold">${r.duration}</span>
            <span class="text-light">分钟 · ${r.date}</span>
          </div>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-state-text">暂无记录</div></div>'}
    </div>
  `;
};
Modules.statistics.bindEvents = function() {
  setTimeout(() => drawStudyChart(), 100);
};
Modules.statistics.init = function() {};

function drawStudyChart() {
  const canvas = document.getElementById('studyChart');
  if (!canvas) return;
  const data = DB.get('studyTime', { records: [] });
  const weekRange = DB.getWeekRange();
  const last4Weeks = [];
  for (let i = 3; i >= 0; i--) {
    const start = new Date(weekRange.start);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const records = data.records.filter(r => {
      const d = new Date(r.date);
      return d >= start && d <= end;
    });
    last4Weeks.push({
      label: `${start.getMonth() + 1}/${start.getDate()}`,
      lesson: records.filter(r => r.type === 'lesson').reduce((s, r) => s + r.duration, 0),
      prep: records.filter(r => r.type === 'prep').reduce((s, r) => s + r.duration, 0),
    });
  }

  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const maxVal = Math.max(...last4Weeks.map(w => Math.max(w.lesson, w.prep)), 60);
  const barWidth = chartW / last4Weeks.length / 3;
  const groupWidth = chartW / last4Weeks.length;

  // Y轴
  ctx.strokeStyle = '#E0DCD8';
  ctx.fillStyle = '#AAA';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + chartH * (1 - i / 4);
    const val = Math.round(maxVal * i / 4);
    ctx.fillText(val + 'm', padding.left - 8, y + 4);
    ctx.strokeStyle = '#F0EEEC';
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();
  }

  // 柱状图
  last4Weeks.forEach((w, i) => {
    const x = padding.left + i * groupWidth + groupWidth / 2;
    // 备课柱
    const lessonH = chartH * (w.lesson / maxVal);
    ctx.fillStyle = '#8B9A8B';
    ctx.fillRect(x - barWidth - 2, padding.top + chartH - lessonH, barWidth, lessonH);
    // 备考柱
    const prepH = chartH * (w.prep / maxVal);
    ctx.fillStyle = '#C4B59C';
    ctx.fillRect(x + 2, padding.top + chartH - prepH, barWidth, prepH);
    // 标签
    ctx.fillStyle = '#7A7A7A';
    ctx.textAlign = 'center';
    ctx.fillText(w.label, x, H - padding.bottom + 16);
  });

  // 图例
  ctx.fillStyle = '#8B9A8B';
  ctx.fillRect(W - 120, 10, 12, 12);
  ctx.fillStyle = '#4A4A4A';
  ctx.textAlign = 'left';
  ctx.fillText('备课', W - 102, 20);
  ctx.fillStyle = '#C4B59C';
  ctx.fillRect(W - 60, 10, 12, 12);
  ctx.fillStyle = '#4A4A4A';
  ctx.fillText('备考', W - 42, 20);
}

function showAddStudyTimeModal() {
  const body = `
    <div class="form-group">
      <label class="form-label">类型</label>
      <div class="segmented">
        <button class="active" data-type="lesson">备课</button>
        <button data-type="prep">备考学习</button>
      </div>
    </div>
    <div class="form-group"><label class="form-label">时长（分钟）</label><input type="number" class="input" id="stDuration" value="25" min="1"></div>
    <div class="form-group"><label class="form-label">日期</label><input type="date" class="input" id="stDate" value="${DB.formatDate()}"></div>
    <div class="form-group"><label class="form-label">备注</label><input class="input" id="stLabel" placeholder="如：备课二次函数"></div>
  `;
  const footer = `<button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button><button class="btn btn-primary" onclick="addStudyTime()">添加</button>`;
  const overlay = Modal.show('记录学习时长', body, footer);
  let stType = 'lesson';
  overlay.querySelectorAll('.segmented button').forEach(btn => {
    btn.onclick = () => {
      overlay.querySelectorAll('.segmented button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      stType = btn.dataset.type;
    };
  });
  overlay._stType = () => stType;
}

function addStudyTime() {
  const overlay = document.querySelector('.modal-overlay');
  const duration = parseInt(document.getElementById('stDuration').value);
  if (!duration || duration <= 0) { Toast.show('请输入有效时长'); return; }
  const data = DB.get('studyTime', { records: [] });
  data.records.push({
    id: DB.uid(),
    type: overlay._stType(),
    duration,
    date: document.getElementById('stDate').value,
    label: document.getElementById('stLabel').value.trim(),
  });
  DB.set('studyTime', data);
  Modal.close(overlay);
  Toast.show('已记录');
  switchModule('statistics');
}

// ---------- 15. AI 对话助手（完整页面） ----------
Modules.aiAssistant = function() {
  const chats = DB.get('aiChats', { ta: [], prep: [] });
  const taCount = (chats.ta || []).length;
  const prepCount = (chats.prep || []).length;

  return `
    <div class="module-header">
      <div>
        <div class="module-title">AI 对话助手</div>
        <div class="module-subtitle">理科助教（课后反馈/备课出题） · 备考助手（考点梳理/习题解析）</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-secondary" onclick="clearAIChats()">🗑️ 清空记录</button>
      </div>
    </div>

    <div class="grid-2 mb-4">
      <div class="card" style="cursor:pointer" onclick="openAIRole('ta')">
        <div class="card-title">🔬 理科助教</div>
        <div class="text-sm text-secondary">帮你写课后反馈、备课出题、解析知识点</div>
        <div class="text-xs text-light mt-2">对话记录：${taCount} 条</div>
      </div>
      <div class="card" style="cursor:pointer" onclick="openAIRole('prep')">
        <div class="card-title">📚 备考助手</div>
        <div class="text-sm text-secondary">帮你梳理考点、解析习题、制定复习计划</div>
        <div class="text-xs text-light mt-2">对话记录：${prepCount} 条</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">💬 最近对话</div>
      ${(chats.ta || []).slice(-3).concat((chats.prep || []).slice(-3)).map(m => `
        <div class="chat-msg ${m.role === 'user' ? 'user' : 'ai'}" style="max-width:95%">
          <div class="text-xs text-light mb-1">${m.role === 'user' ? '我' : 'AI'} · ${DB.formatDate(new Date(m.timestamp), 'MM-DD HH:mm')}</div>
          ${esc(m.content).replace(/\n/g, '<br>')}
        </div>
      `).join('') || '<div class="empty-state"><div class="empty-state-text">暂无对话记录</div></div>'}
    </div>
  `;
};
Modules.aiAssistant.bindEvents = function() {};
Modules.aiAssistant.init = function() {};

function openAIRole(role) {
  App.aiRole = role;
  document.querySelectorAll('.ai-role-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.role === role);
  });
  toggleAIPanel();
}

function clearAIChats() {
  if (confirm('确定清空所有AI对话记录？')) {
    DB.set('aiChats', { ta: [], prep: [] });
    Toast.show('已清空');
    switchModule('aiAssistant');
  }
}

// ==================== 个性化设置 ====================
Modules.personalize = function() {
  const settings = getData('personalization');
  const icons = settings.icons || {};
  const bg = settings.background || { type: 'color', color: '#F5F3F0', gradient: 'linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%)', image: '', overlayOpacity: 0.0 };

  // 所有模块列表（带默认图标和名称）
  const modules = [
    { key: 'dashboard', name: '首页总览', icon: '🏠' },
    { key: 'todo', name: '每日任务', icon: '✅' },
    { key: 'calendar', name: '日历看板', icon: '📅' },
    { key: 'countdown', name: '考试倒计时', icon: '⏰' },
    { key: 'schedule', name: '排课管理', icon: '📋' },
    { key: 'studentManagement', name: '学生管理', icon: '👩‍🎓' },
    { key: 'lessonPrep', name: '备课文档库', icon: '📝' },
    { key: 'studentHours', name: '课消台账', icon: '📊' },
    { key: 'grades', name: '成绩档案', icon: '📈' },
    { key: 'feedback', name: '课后反馈生成', icon: '💬' },
    { key: 'scoreCalc', name: '中考分数测算', icon: '🧮' },
    { key: 'materials', name: '素材库', icon: '📁' },
    { key: 'examBank', name: '真题集', icon: '📑' },
    { key: 'errorBoard', name: '错题收集板', icon: '❌' },
    { key: 'statistics', name: '学习时长统计', icon: '⏱️' },
    { key: 'aiAssistant', name: 'AI 对话助手', icon: '🤖' },
    { key: 'personalize', name: '个性化设置', icon: '🎨' },
  ];

  const iconRows = modules.map(m => `
    <div class="icon-edit-row">
      <div class="icon-edit-info">
        <span class="icon-edit-current" id="iconPreview_${m.key}">${icons[m.key] || m.icon}</span>
        <span class="icon-edit-name">${m.name}</span>
      </div>
      <div class="icon-edit-controls">
        <input
          type="text"
          class="icon-input"
          value="${esc(icons[m.key] || m.icon)}"
          maxlength="4"
          data-module="${m.key}"
          id="iconInput_${m.key}"
          oninput="updateIconPreview('${m.key}', this.value)">
        <button class="btn btn-sm btn-ghost" onclick="resetIcon('${m.key}', '${m.icon}')" title="还原默认">↺</button>
      </div>
    </div>
  `).join('');

  const bgColorOptions = ['#F5F3F0', '#E8E4DE', '#DDE4E0', '#E0DCE4', '#FFFFFF', '#F0E8E0', '#E8EDF0', '#FDF4E3', '#EDE9EC'].map(c =>
    `<button class="color-swatch ${bg.color === c ? 'active' : ''}" style="background:${c}" onclick="pickBgColor('${c}')" title="${c}"></button>`
  ).join('');

  const imagePreview = bg.image
    ? `<div class="bg-preview-thumb" style="background-image:url(${esc(bg.image)})"></div><button class="btn btn-sm btn-danger mt-2" onclick="removeBgImage()">移除图片</button>`
    : '<div class="empty-state"><div class="empty-state-text">未上传背景图片</div></div>';

  return `
    <div class="module-header">
      <div>
        <div class="module-title">🎨 个性化设置</div>
        <div class="module-subtitle">自定义图标、背景，让你的工作台与众不同</div>
      </div>
      <div class="module-actions">
        <button class="btn btn-primary" onclick="savePersonalization()">💾 保存设置</button>
      </div>
    </div>

    <!-- 主题颜色 -->
    <div class="card mb-4">
      <div class="card-title">🎨 主题颜色</div>
      <div class="text-sm text-secondary mb-3">选择主题颜色，侧栏和顶栏也会同步变化</div>
      <div class="theme-swatch-grid" style="display:flex;gap:12px;flex-wrap:wrap;">
        ${[
          { id:'blue', name:'天蓝', colors:'#C4D8EC,#3182CE', style:'background:linear-gradient(135deg,#E8F0F8,#C4D8EC)' },
          { id:'mint', name:'薄荷绿', colors:'#C3E6CB,#38A169', style:'background:linear-gradient(135deg,#E8F5EC,#C3E6CB)' },
          { id:'lavender', name:'薰衣草', colors:'#D8CCE8,#805AD5', style:'background:linear-gradient(135deg,#F0ECF8,#D8CCE8)' },
          { id:'warm', name:'暖橙', colors:'#E8D8C0,#D69E2E', style:'background:linear-gradient(135deg,#F8F2E8,#E8D8C0)' },
          { id:'dark', name:'深色', colors:'#2A2D38,#63B3ED', style:'background:linear-gradient(135deg,#1A1D24,#2A2D38)' },
        ].map(t => `
          <button class="theme-swatch ${(settings.theme||'blue')===t.id?'active':''}"
            style="${t.style};width:72px;height:72px;border-radius:18px;border:3px solid ${(settings.theme||'blue')===t.id?'var(--theme-accent)':'rgba(255,255,255,0.4)'};cursor:pointer;transition:all 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.08);"
            onclick="pickTheme('${t.id}')" title="${t.name}">
          </button>
        `).join('')}
      </div>
      <div class="text-xs text-secondary mt-2">当前：<span id="themeLabel">${({blue:'天蓝',mint:'薄荷绿',lavender:'薰衣草',warm:'暖橙',dark:'深色'})[settings.theme||'blue']}</span></div>
    </div>

    <!-- 头像设置 -->
    <div class="card mb-4">
      <div class="card-title">👤 头像设置</div>
      <div class="text-sm text-secondary mb-3">选择预设头像或上传自定义图片</div>
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
        ${['A','📚','🌟','🎓','🏆','💡'].map(a => `
          <button class="avatar-pick ${(!settings.avatar||settings.avatar===a)?'active':''}"
            style="width:48px;height:48px;border-radius:50%;border:3px solid ${(!settings.avatar||settings.avatar===a)?'var(--theme-accent)':'rgba(0,0,0,0.08)'};cursor:pointer;font-size:22px;display:flex;align-items:center;justify-content:center;background:var(--theme-glass-hover);transition:all 0.2s;"
            onclick="pickAvatar('${a}')">${a}</button>
        `).join('')}
      </div>
      <div class="avatar-upload-inline mt-3">
        <div class="text-xs text-secondary mb-2">自定义图片上传：</div>
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
          <input type="file" id="avatarUploadInline" accept="image/*" style="display:none;">
          <button class="btn btn-secondary btn-sm" onclick="document.getElementById('avatarUploadInline').click()">📷 选择图片</button>
          <div id="avatarUploadPreview" style="width:48px;height:48px;border-radius:50%;overflow:hidden;border:2px solid var(--theme-glass-border);display:flex;align-items:center;justify-content:center;background:var(--theme-glass-hover);">
            ${settings.avatar && settings.avatar.startsWith('data:') ? '<img src="'+settings.avatar+'" alt="自定义头像" style="width:100%;height:100%;object-fit:cover;">' : '<span style="font-size:18px;color:var(--text-light);">📷</span>'}
          </div>
          ${settings.avatar && settings.avatar.startsWith('data:') ? '<button class="btn btn-sm" style="color:var(--color-danger);" onclick="resetCustomAvatar()">移除自定义图片</button>' : ''}
        </div>
        <div class="text-xs text-secondary mt-1">支持 JPG/PNG，建议 200×200 正方形，不超过 8MB</div>
      </div>
    </div>

    <!-- 导航图标设置 -->
    <div class="card mb-4">
      <div class="card-title">🖼️ 导航图标</div>
      <div class="text-sm text-secondary mb-3">点击 emoji 输入框，用键盘自带的 emoji 选择器挑选新的图标</div>
      <div class="icon-edit-grid">${iconRows}</div>
    </div>

    <!-- 背景设置 -->
    <div class="card mb-4">
      <div class="card-title">🎨 应用背景</div>
      <div class="bg-tabs mb-3">
        <button class="bg-tab ${bg.type === 'color' ? 'active' : ''}" onclick="switchBgTab('color')">纯色</button>
        <button class="bg-tab ${bg.type === 'gradient' ? 'active' : ''}" onclick="switchBgTab('gradient')">渐变</button>
        <button class="bg-tab ${bg.type === 'image' ? 'active' : ''}" onclick="switchBgTab('image')">图片</button>
      </div>

      <div class="bg-panel" id="bgColorPanel" style="display:${bg.type === 'color' ? 'block' : 'none'}">
        <div class="color-swatch-grid mb-3">${bgColorOptions}</div>
        <div class="flex items-center gap-2">
          <span class="text-sm">自定义颜色：</span>
          <input type="color" id="bgCustomColor" value="${bg.color}" onchange="updateBgColor(this.value)" class="color-picker">
          <code class="text-xs text-secondary">${bg.color}</code>
        </div>
      </div>

      <div class="bg-panel" id="bgGradientPanel" style="display:${bg.type === 'gradient' ? 'block' : 'none'}">
        <div class="gradient-presets">
          ${[{ label: '暖米灰', css: 'linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%)' },
             { label: '鼠尾草', css: 'linear-gradient(135deg, #DDE4E0 0%, #C4D0C8 100%)' },
             { label: '淡紫雾', css: 'linear-gradient(135deg, #E8E0EC 0%, #D4CCD8 100%)' },
             { label: '雾蓝', css: 'linear-gradient(135deg, #DCE4E8 0%, #C8D4DC 100%)' },
             { label: '暖燕麦', css: 'linear-gradient(135deg, #F0E8E0 0%, #E8DCC8 100%)' },
             { label: '淡粉灰', css: 'linear-gradient(135deg, #EDE9EC 0%, #DCD4D8 100%)' },
          ].map(g => `<button class="gradient-preset ${bg.gradient === g.css ? 'active' : ''}" style="background:${g.css}" onclick="pickGradient('${esc(g.css.replace(/'/g,"\\'"))}')">${g.label}</button>`).join('')}
        </div>
        <div class="mt-3">
          <span class="text-sm text-secondary">或自定义渐变 CSS：</span>
          <input type="text" class="input mt-2" id="bgCustomGradient" value="${esc(bg.gradient)}" placeholder="linear-gradient(135deg, #xxx 0%, #yyy 100%)">
        </div>
      </div>

      <div class="bg-panel" id="bgImagePanel" style="display:${bg.type === 'image' ? 'block' : 'none'}">
        ${imagePreview}
        <div class="mt-2">
          <button class="btn btn-secondary" onclick="document.getElementById('bgImageInput').click()">🖼️ 选择背景图片</button>
          <input type="file" id="bgImageInput" accept="image/*" style="display:none" onchange="uploadBgImage(this)">
        </div>
        <div class="flex items-center gap-2 mt-3">
          <span class="text-sm">背景透明度：</span>
          <input type="range" id="bgOverlaySlider" min="0" max="100" value="${Math.round((bg.overlayOpacity || 0) * 100)}" oninput="updateBgOverlay(this.value)" class="slider">
          <span class="text-xs text-secondary" id="overlayLabel">${Math.round((bg.overlayOpacity || 0) * 100)}%</span>
        </div>
      </div>
    </div>

    <!-- 科目颜色设置（排课表专用） -->
    <div class="card mb-4">
      <div class="card-title">📊 排课表科目颜色</div>
      <div class="text-sm text-secondary mb-3">自定义各科目在排课表中的显示颜色，该颜色会用于导出给家长的课表图片中</div>
      <div class="subject-color-grid" id="subjectColorGrid">
        ${renderSubjectColorRows()}
      </div>
      <div class="flex gap-2 mt-3">
        <button class="btn btn-sm btn-secondary" onclick="addCustomSubject()">➕ 添加自定义科目</button>
        <button class="btn btn-sm btn-secondary" onclick="resetSubjectColors()">↺ 重置科目颜色</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">💾 数据备份与迁移</div>
      <div class="text-sm text-secondary mb-3">导出会把你所有本地数据（学生、备课、排课、结算、个性化设置等）打包成一个 JSON 文件。换电脑或重装前先导出，到新环境用「导入备份」即可一键恢复，数据不丢。</div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-primary" onclick="exportAllData()">📤 导出全部数据</button>
        <button class="btn btn-secondary" onclick="document.getElementById('importBackupInput').click()">📥 导入备份</button>
        <button class="btn btn-secondary" onclick="scanAndRepairGarbled()">🔧 扫描/修复乱码</button>
        <input type="file" id="importBackupInput" accept="application/json,.json" style="display:none;" onchange="importAllData(this)">
      </div>
      <div class="text-xs text-secondary mt-2" id="backupHint"></div>
    </div>

    <div class="card">
      <div class="card-title">⚡ 快速重置</div>
      <div class="flex flex-wrap gap-2">
        <button class="btn btn-secondary" onclick="resetAllIcons()">↺ 重置所有图标</button>
        <button class="btn btn-secondary" onclick="resetBackground()">↺ 重置背景</button>
        <button class="btn btn-danger" onclick="resetAllPersonalization()" style="font-size:13px">⚠️ 恢复全部默认</button>
      </div>
    </div>
  `;
};
Modules.personalize.bindEvents = function() {};
Modules.personalize.init = function() {};

// ==================== 数据备份与迁移 ====================
// 导出所有 teaching_workbench_* 前缀的本地数据为一个 JSON 文件
function exportAllData() {
  try {
    const PREFIX = 'teaching_workbench_';
    const data = {};
    let count = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX)) {
        try { data[key] = localStorage.getItem(key); count++; } catch (e) {}
      }
    }
    // 同步登录态也一并带出，方便迁移后直接登录
    if (localStorage.getItem('sync_token')) data['sync_token'] = localStorage.getItem('sync_token');
    if (localStorage.getItem('sync_username')) data['sync_username'] = localStorage.getItem('sync_username');
    const payload = {
      app: 'teaching-workbench',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data
    };
    const blob = new Blob(['﻿' + JSON.stringify(payload, null, 2)], { type: 'application/json; charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `教学工作台-数据备份-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    const hint = document.getElementById('backupHint');
    if (hint) hint.textContent = `✅ 已导出 ${count} 项数据（${ts}）`;
    Toast.show(`已导出 ${count} 项数据`);
  } catch (e) {
    Toast.show('导出失败：' + e.message, 'error');
  }
}

// 从 JSON 备份文件恢复数据
function importAllData(input) {
  const file = input.files[0];
  if (!file) return;
  readFileText(file).then(text => {
    try {
      const payload = JSON.parse(text);
      if (!payload || !payload.data) throw new Error('备份文件格式不正确');
      let count = 0;
      for (const key of Object.keys(payload.data)) {
        try { localStorage.setItem(key, payload.data[key]); count++; } catch (err) {}
      }
      const hint = document.getElementById('backupHint');
      if (hint) hint.textContent = `✅ 已导入 ${count} 项数据，即将刷新页面…`;
      Toast.show(`已导入 ${count} 项数据，正在恢复…`);
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      Toast.show('导入失败：' + err.message, 'error');
      const hint = document.getElementById('backupHint');
      if (hint) hint.textContent = '❌ 导入失败：' + err.message;
    } finally {
      input.value = '';
    }
  }).catch(err => {
    Toast.show('读取文件失败：' + err.message, 'error');
    input.value = '';
  });
}

// 扫描并修复被单字节编码误读的中文乱码（如学生姓名/学校），同时列出不可还原的条目
function scanAndRepairGarbled() {
  const allStudents = DB.get('students', { list: [] }).list;
  const studentById = {};
  allStudents.forEach(s => { if (s.id) studentById[s.id] = s; });
  const SCAN = [
    { key: 'students', label: '学生', fields: ['name', 'school', 'grade', 'className', 'parentName', 'notes'], tagsField: 'tags' },
    { key: 'schedule', label: '排课', fields: ['studentName', 'subject'], studentIdField: 'studentId', studentNameField: 'studentName' },
    { key: 'grades', label: '成绩', fields: ['studentName', 'examName', 'subject'], studentIdField: 'studentId', studentNameField: 'studentName' },
    { key: 'todo', label: '待办', fields: ['title'] },
    { key: 'lessonPrep', label: '备课', fields: ['title', 'subject', 'studentName'], studentIdField: 'studentId', studentNameField: 'studentName' },
  ];
  const issues = [];
  SCAN.forEach(scan => {
    const store = DB.get(scan.key, { list: [] });
    (store.list || []).forEach(it => {
      scan.fields.forEach(f => {
        let r = detectGarbled(it[f]);
        // 若姓名字段已出现替换字符且不可恢复，但记录关联了学生ID，可尝试按ID回填正确姓名
        if (r && r.type === 'unrecoverable' && scan.studentNameField === f && scan.studentIdField && it[scan.studentIdField]) {
          const stu = studentById[it[scan.studentIdField]];
          if (stu && stu.name && !detectGarbled(stu.name)) {
            r = { type: 'byStudentId', fixed: stu.name };
          }
        }
        if (r) issues.push({ store: scan.key, label: scan.label, id: it.id, field: f, original: it[f], result: r });
      });
      if (scan.tagsField && Array.isArray(it[scan.tagsField])) {
        it[scan.tagsField].forEach((t, i) => {
          const r = detectGarbled(t);
          if (r) issues.push({ store: scan.key, label: scan.label, id: it.id, field: scan.tagsField + '[' + i + ']', original: t, result: r });
        });
      }
    });
  });
  if (issues.length === 0) {
    Modal.show('乱码体检', '<div class="text-sm">✅ 未发现可自动修复的乱码。若个别文字仍显示异常，多为录入时输入法问题，请直接编辑对应条目重新输入。</div>',
      '<button class="btn btn-primary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">知道了</button>');
    return;
  }
  const moji = issues.filter(i => i.result.type === 'mojibake' || i.result.type === 'byStudentId');
  const unrecover = issues.filter(i => i.result.type === 'unrecoverable');
  let html = '<div class="text-sm">共发现 <b>' + issues.length + '</b> 处疑似乱码。</div>';
  if (moji.length) {
    html += '<div class="text-xs text-light mt-1">以下可自动还原，确认后一键修复：</div>';
    moji.forEach(i => {
      const reason = i.result.type === 'byStudentId' ? '（按学生ID回填正确姓名）' : '（UTF-8 被误读为单字节编码）';
      html += '<div class="lesson-doc text-sm" style="margin-top:6px">'
        + '【' + esc(i.label) + '】字段 ' + esc(i.field) + ' ' + reason + '<br>'
        + '<span class="text-light">原：' + esc(i.original) + '</span><br>'
        + '<span style="color:#2a7"><b>修复为：' + esc(i.result.fixed) + '</b></span></div>';
    });
  }
  if (unrecover.length) {
    html += '<div class="text-xs text-light mt-2">以下为不可还原乱码（字节已缺失），需手动重新录入：</div>';
    unrecover.forEach(i => {
      html += '<div class="lesson-doc text-sm" style="margin-top:6px">【' + esc(i.label) + '】字段 ' + esc(i.field) + '：' + esc(i.original.slice(0, 20)) + '</div>';
    });
  }
  const footer = moji.length
    ? '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">取消</button>'
      + '<button class="btn btn-primary" onclick="applyGarbledFix()">应用修复 ' + moji.length + ' 处</button>'
    : '<button class="btn btn-primary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">知道了</button>';
  window.__garbledFixList = moji.map(i => ({ store: i.store, id: i.id, field: i.field, fixed: i.result.fixed }));
  Modal.show('乱码体检结果', html, footer);
}

function applyGarbledFix() {
  const list = window.__garbledFixList || [];
  if (!list.length) { Modal.close(document.querySelector('.modal-overlay')); return; }
  const grouped = {};
  list.forEach(i => { (grouped[i.store] = grouped[i.store] || []).push(i); });
  Object.keys(grouped).forEach(storeKey => {
    const store = DB.get(storeKey, { list: [] });
    grouped[storeKey].forEach(fix => {
      const it = (store.list || []).find(x => x.id === fix.id);
      if (!it) return;
      const m = fix.field.match(/^(.*)\[(\d+)\]$/);
      if (m && Array.isArray(it[m[1]])) it[m[1]][parseInt(m[2], 10)] = fix.fixed;
      else it[fix.field] = fix.fixed;
    });
    DB.set(storeKey, store);
  });
  Modal.close(document.querySelector('.modal-overlay'));
  Toast.show('已修复 ' + list.length + ' 处乱码，正在刷新…');
  setTimeout(() => location.reload(), 600);
}

// 图标预览实时更新
function updateIconPreview(module, value) {
  const preview = document.getElementById('iconPreview_' + module);
  if (preview) preview.textContent = value || '❓';
}

// 还原单个图标
function resetIcon(module, defaultIcon) {
  const input = document.getElementById('iconInput_' + module);
  if (input) input.value = defaultIcon;
  updateIconPreview(module, defaultIcon);
}

// 还原所有图标
function resetAllIcons() {
  if (!confirm('确定重置所有导航图标为默认值？')) return;
  const defaults = { dashboard:'🏠', todo:'✅', calendar:'📅', countdown:'⏰', schedule:'📋', lessonPrep:'📝', studentHours:'📊', grades:'📈', feedback:'💬', scoreCalc:'🧮', materials:'📁', examBank:'📑', errorBoard:'❌', statistics:'⏱️', aiAssistant:'🤖', personalize:'🎨' };
  const settings = getData('personalization');
  settings.icons = defaults;
  saveData('personalization', settings);
  applyPersonalization();
  switchModule('personalize');
  Toast.show('图标已重置为默认值');
}

// 背景 tab 切换
function switchBgTab(type) {
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.type = type;
  saveData('personalization', settings);
  switchModule('personalize');
}

// 纯色选择
function pickBgColor(color) {
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.color = color;
  settings.background.type = 'color';
  saveData('personalization', settings);
  applyPersonalization();
  switchModule('personalize');
}

// 颜色选择器更新
function updateBgColor(color) {
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.color = color;
  settings.background.type = 'color';
  saveData('personalization', settings);
  applyPersonalization();
  switchModule('personalize');
}

// 渐变选择
function pickGradient(css) {
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.gradient = css;
  settings.background.type = 'gradient';
  saveData('personalization', settings);
  applyPersonalization();
  switchModule('personalize');
}

// 自定义渐变
function saveCustomGradient() {
  const input = document.getElementById('bgCustomGradient');
  if (input && input.value) {
    pickGradient(input.value);
  }
}

// 上传背景图片
function uploadBgImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) {
    Toast.show('图片不能超过 8MB', 'error');
    return;
  }
  const applyImg = (dataUrl) => {
    const settings = getData('personalization');
    settings.background = settings.background || {};
    settings.background.image = dataUrl;
    settings.background.type = 'image';
    settings.background.overlayOpacity = settings.background.overlayOpacity || 0.15;
    saveData('personalization', settings);
    applyPersonalization();
    rerenderPersonalizeKeepScroll();
    Toast.show('背景图片已上传');
  };
  // 压缩后再存，避免原图 base64 过大撑爆同步数据导致手机端同步失败
  if (typeof compressAvatar === 'function') {
    compressAvatar(file, 1280, 0.82).then(applyImg).catch(() => {
      const reader = new FileReader();
      reader.onload = (e) => applyImg(e.target.result);
      reader.readAsDataURL(file);
    });
  } else {
    const reader = new FileReader();
    reader.onload = (e) => applyImg(e.target.result);
    reader.readAsDataURL(file);
  }
}

// 移除背景图片
function removeBgImage() {
  if (!confirm('确定移除背景图片？')) return;
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.image = '';
  settings.background.type = 'color';
  saveData('personalization', settings);
  applyPersonalization();
  rerenderPersonalizeKeepScroll();
}

// 背景透明度
function updateBgOverlay(value) {
  const val = parseInt(value) / 100;
  document.getElementById('overlayLabel').textContent = value + '%';
  const settings = getData('personalization');
  settings.background = settings.background || {};
  settings.background.overlayOpacity = val;
  saveData('personalization', settings);
  applyPersonalization();
}

// 重置背景
function resetBackground() {
  if (!confirm('确定重置背景为默认？')) return;
  const settings = getData('personalization');
  settings.background = { type: 'color', color: '#F5F3F0', gradient: 'linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%)', image: '', overlayOpacity: 0.0 };
  saveData('personalization', settings);
  applyPersonalization();
  switchModule('personalize');
  Toast.show('背景已重置');
}

// 全部恢复默认
function resetAllPersonalization() {
  if (!confirm('⚠️ 确定恢复所有个性化设置为默认值？此操作不可撤销。')) return;
  const defaults = {
    icons: {
      dashboard:'🏠', todo:'✅', calendar:'📅', countdown:'⏰',
      schedule:'📋', lessonPrep:'📝', studentHours:'📊', grades:'📈',
      feedback:'💬', scoreCalc:'🧮', materials:'📁', examBank:'📑',
      errorBoard:'❌', statistics:'⏱️', aiAssistant:'🤖', personalize:'🎨',
    },
    background: { type: 'color', color: '#F5F3F0', gradient: 'linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%)', image: '', overlayOpacity: 0.0 },
  };
  saveData('personalization', defaults);
  applyPersonalization();
  switchModule('personalize');
  Toast.show('已恢复全部默认设置');
}

// 保存个性化设置（从当前输入框读取）
function savePersonalization() {
  const settings = getData('personalization');
  // 保留已有的 theme 和 avatar 设置
  const existingTheme = settings.theme;
  const existingAvatar = settings.avatar;
  // 读取所有图标输入
  document.querySelectorAll('.icon-input').forEach(input => {
    const module = input.dataset.module;
    settings.icons = settings.icons || {};
    settings.icons[module] = input.value.trim() || '❓';
  });
  // 自定义渐变
  const gradInput = document.getElementById('bgCustomGradient');
  if (gradInput && gradInput.value) {
    settings.background = settings.background || {};
    settings.background.gradient = gradInput.value;
  }
  // 恢复主题和头像
  settings.theme = existingTheme || settings.theme;
  settings.avatar = existingAvatar || settings.avatar;
  saveData('personalization', settings);
  applyPersonalization();
  Toast.show('个性化设置已保存');
}

// ========== 科目颜色管理 ==========
function renderSubjectColorRows() {
  const ss = getData('scheduleSettings');
  const colors = ss.subjectColors || {};
  return Object.entries(colors).map(([subject, color]) => `
    <div class="icon-edit-row">
      <div class="icon-edit-info">
        <span class="subject-color-dot" style="background:${color}"></span>
        <span class="icon-edit-name">${esc(subject)}</span>
      </div>
      <div class="icon-edit-controls">
        <input type="color" value="${color}" onchange="updateSubjectColor('${esc(subject).replace(/'/g,"\\'")}', this.value)" class="color-picker" style="width:40px;height:32px">
        <button class="btn btn-sm btn-ghost" onclick="removeSubjectColor('${esc(subject).replace(/'/g,"\\'")}')" title="删除自定义科目">🗑</button>
      </div>
    </div>
  `).join('');
}

function updateSubjectColor(subject, color) {
  const ss = getData('scheduleSettings');
  ss.subjectColors[subject] = color;
  saveData('scheduleSettings', ss);
  // 实时刷新科目颜色行和排课表
  const grid = document.getElementById('subjectColorGrid');
  if (grid) grid.innerHTML = renderSubjectColorRows();
  Toast.show('科目颜色已更新');
}

function addCustomSubject() {
  const name = prompt('输入科目名称（如：化学、历史）：');
  if (!name || !name.trim()) return;
  const ss = getData('scheduleSettings');
  if (ss.subjectColors[name.trim()]) {
    Toast.show('该科目已存在');
    return;
  }
  // 随机分配颜色
  const presetColors = ['#D4E4D0', '#C8D6E0', '#D8D0E8', '#E8D4C0', '#D8E8D0', '#E0D8C8', '#D0D4DC', '#E8D8D0', '#C8D8D8', '#F0E0D0'];
  const usedColors = Object.values(ss.subjectColors);
  const freeColor = presetColors.find(c => !usedColors.includes(c)) || presetColors[0];
  ss.subjectColors[name.trim()] = freeColor;
  saveData('scheduleSettings', ss);
  switchModule('personalize');
  Toast.show(`已添加科目：${name.trim()}`);
}

function removeSubjectColor(subject) {
  const defaults = ['数学','物理','化学','英语','语文','生物','历史','政治','地理','科学','其他'];
  if (defaults.includes(subject)) {
    Toast.show('默认科目不可删除');
    return;
  }
  if (!confirm(`确定删除科目「${subject}」？`)) return;
  const ss = getData('scheduleSettings');
  delete ss.subjectColors[subject];
  saveData('scheduleSettings', ss);
  switchModule('personalize');
  Toast.show(`已删除科目：${subject}`);
}

function resetSubjectColors() {
  if (!confirm('确定重置所有科目颜色为默认值？')) return;
  const ss = getData('scheduleSettings');
  ss.subjectColors = {
    '数学': '#D4E4D0', '物理': '#C8D6E0', '化学': '#D8D0E8',
    '英语': '#E8D4C0', '语文': '#D8E8D0', '生物': '#E0D8C8',
    '历史': '#D0D4DC', '政治': '#E8D8D0', '地理': '#C8D8D8',
    '科学': '#DCE4D0', '其他': '#DCD8D4',
  };
  saveData('scheduleSettings', ss);
  switchModule('personalize');
  Toast.show('科目颜色已重置');
}

// ==================== 主题颜色选择 ====================
function pickTheme(themeId) {
  const settings = getData('personalization');
  settings.theme = themeId;
  saveData('personalization', settings);
  applyTheme(themeId);
  switchModule('personalize');
  Toast.show('主题已切换');
}

// ==================== 头像选择 ====================
function pickAvatar(avatar) {
  const settings = getData('personalization');
  settings.avatar = avatar;
  saveData('personalization', settings);
  applyAvatarToUI(avatar);
  // 设置头像后立即将个性化数据（含头像）上传云端，避免退出/刷新后端不同步导致重新登录头像丢失
  if (window.Sync && Sync.isLoggedIn && Sync.isLoggedIn()) Sync.scheduleSync();
  // 同时更新个性化设置页面里的头像选择器
  switchModule('personalize');
  Toast.show('头像已更新');
}

// 把头像应用到顶栏按钮
function applyAvatarToUI(avatar) {
  const avatarBtn = document.getElementById('avatarBtn');
  if (!avatarBtn) return;
  // 未登录时一律显示默认头像
  if (!Sync.isLoggedIn()) {
    avatarBtn.innerHTML = '👤';
    avatarBtn.style.fontSize = '18px';
    return;
  }
  if (avatar && avatar.startsWith('data:')) {
    // 自定义图片
    avatarBtn.innerHTML = '<img src="' + avatar + '" alt="头像" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
    avatarBtn.style.fontSize = '';
  } else {
    // emoji 文字头像
    avatarBtn.innerHTML = avatar || 'A';
    avatarBtn.style.fontSize = (avatar && avatar.length > 2) ? '14px' : '18px';
  }
}

// 把上传头像压缩到合适尺寸，避免原图 base64 过大撑爆同步数据导致手机端同步失败
function compressAvatar(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h > w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', quality)); }
        catch (err) { reject(err); }
      };
      img.onerror = function() { reject(new Error('图片解析失败')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('读取失败')); };
    reader.readAsDataURL(file);
  });
}

// 启动时若发现已存的头像 base64 过大（历史 8MB 原图），自动压缩一遍，缩小同步体积
function shrinkAvatarIfNeeded(settings) {
  if (!settings || typeof settings.avatar !== 'string') return;
  if (!settings.avatar.startsWith('data:image/')) return;
  if (settings.avatar.length <= 60000) return; // 约 45KB 以内视为正常
  const img = new Image();
  img.onload = function() {
    let w = img.width, h = img.height, maxSize = 256;
    if (w > h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
    else if (h > w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const small = canvas.toDataURL('image/jpeg', 0.82);
    const s = getData('personalization');
    if (s) { s.avatar = small; saveData('personalization', s); }
  };
  img.src = settings.avatar;
}

// 移除自定义头像，恢复为默认 emoji
function resetCustomAvatar() {
  pickAvatar('A');
  // 更新上传预览区
  var preview = document.getElementById('avatarUploadPreview');
  if (preview) {
    preview.innerHTML = '<span style="font-size:18px;color:var(--text-light);">📷</span>';
  }
  // 高亮第一个 emoji 选项
  var picks = document.querySelectorAll('.avatar-pick');
  picks.forEach(function(b) { b.classList.remove('active'); });
  if (picks.length > 0) picks[0].classList.add('active');
}

// 绑定个性化设置页面的头像上传
function bindAvatarUpload() {
  const fileInput = document.getElementById('avatarUploadInline');
  if (!fileInput) return;
  // 移除旧监听器（避免重复绑定）
  const newInput = fileInput.cloneNode(true);
  fileInput.parentNode.replaceChild(newInput, fileInput);
  newInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { Toast.show('图片不能超过 8MB'); return; }
    Toast.show('正在处理图片...');
    compressAvatar(file, 256, 0.82).then(function(imageData) {
      pickAvatar(imageData);
      const preview = document.getElementById('avatarUploadPreview');
      if (preview) {
        preview.innerHTML = '<img src="' + imageData + '" alt="自定义头像" style="width:100%;height:100%;object-fit:cover;">';
      }
      document.querySelectorAll('.avatar-pick').forEach(b => b.classList.remove('active'));
    }).catch(function(err) {
      Toast.show('头像处理失败: ' + (err && err.message || '未知错误'), 'error');
    });
  });
}

function showAvatarModal() {
  const settings = getData('personalization');
  const currentAvatar = settings.avatar || 'A';
  const isImage = currentAvatar && currentAvatar.startsWith('data:');
  const avatars = ['A','📚','🌟','🎓','🏆','💡'];
  const overlay = document.createElement('div');
  overlay.className = 'avatar-modal-overlay';
  overlay.id = 'avatarModalOverlay';
  overlay.innerHTML = [
    '<div class="avatar-modal" style="width:360px;">',
    '<div class="avatar-modal-title">选择头像</div>',
    '<div class="avatar-grid">',
    avatars.map(a => '<div class="avatar-option' + (!isImage && currentAvatar===a?' selected':'') + '" data-avatar="' + a + '" style="font-size:32px;">' + a + '</div>').join(''),
    '</div>',
    // 自定义上传区域
    '<div class="avatar-upload-area">',
    '<div class="avatar-upload-label">或上传自定义图片</div>',
    '<div class="avatar-upload-row">',
    '<input type="file" id="avatarFileInput" accept="image/*" style="display:none;">',
    '<button class="btn btn-secondary btn-sm" id="avatarUploadBtn">📷 选择图片</button>',
    '<div class="avatar-preview-upload" id="avatarPreviewUpload">',
    isImage ? '<img src="' + currentAvatar + '" alt="当前头像" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">' : '',
    '</div>',
    '</div>',
    '<div class="text-xs text-secondary mt-2" style="text-align:center;">支持 JPG/PNG，建议正方形图片</div>',
    '</div>',
    '<div class="avatar-modal-actions">',
    '<button class="btn btn-primary" id="avatarConfirmBtn">确定</button>',
    '<button class="btn btn-secondary" id="avatarCancelBtn">取消</button>',
    '</div></div>'
  ].join('');
  document.body.appendChild(overlay);

  let selected = isImage ? currentAvatar : currentAvatar;
  let uploadedImage = isImage ? currentAvatar : '';

  // emoji 点击
  overlay.querySelectorAll('.avatar-option').forEach(opt => {
    opt.addEventListener('click', function() {
      overlay.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      this.classList.add('selected');
      selected = this.dataset.avatar;
      uploadedImage = ''; // 选 emoji 时清掉上传图
      document.getElementById('avatarPreviewUpload').innerHTML = '';
    });
  });

  // 上传按钮
  const fileInput = overlay.querySelector('#avatarFileInput');
  const previewDiv = overlay.querySelector('#avatarPreviewUpload');
  overlay.querySelector('#avatarUploadBtn').addEventListener('click', function() {
    fileInput.click();
  });
  fileInput.addEventListener('change', function() {
    const file = this.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { Toast.show('图片不能超过 8MB'); return; }
    Toast.show('正在处理图片...');
    compressAvatar(file, 256, 0.82).then(function(imageData) {
      uploadedImage = imageData;
      selected = uploadedImage;
      previewDiv.innerHTML = '<img src="' + uploadedImage + '" alt="上传预览" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:3px solid var(--theme-accent);">';
      // 取消 emoji 选中
      overlay.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
    }).catch(function(err) {
      Toast.show('头像处理失败: ' + (err && err.message || '未知错误'), 'error');
    });
  });

  document.getElementById('avatarCancelBtn').addEventListener('click', function() { overlay.remove(); });
  document.getElementById('avatarConfirmBtn').addEventListener('click', function() {
    pickAvatar(selected);
    overlay.remove();
  });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ==================== 启动 ====================
document.addEventListener('DOMContentLoaded', function () {
  // 核心脚本已成功执行（含激活页），立即标记页面就绪。
  // 否则未激活/激活页等待期间 __appReady 恒为 false，会触发 index.html 的 4 秒自检
  // 误判为 Service Worker 故障，进而无限跳转 ?nocache=1 → 表现为"一直刷新"。
  window.__appReady = true;
  // 轻付费激活码门槛：未激活先弹激活页，激活后再启动应用
  if (window.Activation && !window.Activation.isActivated()) {
    window.Activation.check(init);
  } else {
    init();
  }
});
