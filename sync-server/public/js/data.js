/**
 * data.js - 数据存储层
 * 基于 localStorage 的统一数据管理
 */

const STORAGE_PREFIX = 'teaching_workbench_';

const DB = {
  /**
   * 读取数据
   */
  get(key, defaultValue = null) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) {
      console.error('读取失败:', key, e);
      return defaultValue;
    }
  },

  /**
   * 写入数据
   */
  set(key, value) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('写入失败:', key, e);
      if (e.name === 'QuotaExceededError') {
        Toast.show('存储空间不足，请清理部分图片数据', 'error');
      }
      return false;
    }
  },

  /**
   * 删除数据
   */
  remove(key) {
    localStorage.removeItem(STORAGE_PREFIX + key);
  },

  /**
   * 导出全部数据
   */
  exportAll() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const shortKey = key.replace(STORAGE_PREFIX, '');
        try {
          data[shortKey] = JSON.parse(localStorage.getItem(key));
        } catch (e) {
          data[shortKey] = localStorage.getItem(key);
        }
      }
    }
    return data;
  },

  /**
   * 导入数据
   */
  importAll(data) {
    if (!data || typeof data !== 'object') return false;
    try {
      Object.keys(data).forEach(key => {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data[key]));
      });
      return true;
    } catch (e) {
      console.error('导入失败:', e);
      return false;
    }
  },

  /**
   * 生成唯一ID
   */
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  /**
   * 格式化日期
   */
  formatDate(date, fmt = 'YYYY-MM-DD') {
    if (!date) date = new Date();
    if (typeof date === 'string') date = new Date(date);
    const map = {
      YYYY: date.getFullYear(),
      MM: String(date.getMonth() + 1).padStart(2, '0'),
      DD: String(date.getDate()).padStart(2, '0'),
      HH: String(date.getHours()).padStart(2, '0'),
      mm: String(date.getMinutes()).padStart(2, '0'),
      ss: String(date.getSeconds()).padStart(2, '0'),
    };
    return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, m => map[m]);
  },

  /**
   * 获取本周日期范围
   */
  getWeekRange(date = new Date()) {
    const day = date.getDay() || 7;
    const monday = new Date(date);
    monday.setDate(date.getDate() - day + 1);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  },

  /**
   * 获取本月日期范围
   */
  getMonthRange(date = new Date()) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
  },

  /**
   * 判断是否同一天
   */
  isSameDay(d1, d2) {
    if (typeof d1 === 'string') d1 = new Date(d1);
    if (typeof d2 === 'string') d2 = new Date(d2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  },

  /**
   * 天数差
   */
  daysBetween(date1, date2) {
    if (typeof date1 === 'string') date1 = new Date(date1);
    if (typeof date2 === 'string') date2 = new Date(date2);
    const diff = date2.setHours(0,0,0,0) - date1.setHours(0,0,0,0);
    return Math.round(diff / 86400000);
  },
};

/**
 * 数据模型 - 各模块默认数据结构
 */
const Models = {
  // ToDo 任务
  todo: {
    list: [],
    // { id, text, type: 'teach'|'prep', completed, isRecurring, recurringDays: [0-6], createdAt, completedAt, pomodoroCount }
  },

  // 教研 & 备考素材库
  materials: {
    list: [],
    // { id, title, content, image, tags: [], source: 'manual'|'baidu', createdAt }
  },

  // 备考真题集
  examBank: {
    list: [],
    // { id, title, subject, year, image, isWrong, wrongReason, tags: [], createdAt }
  },

  // 错题收集板
  errorBoard: {
    list: [],
    // { id, category: 'student'|'personal', studentName, subject, questionImage, wrongAnswer, correctAnswer, analysis, tags: [], createdAt }
  },

  // 排课管理
  schedule: {
    list: [],
    // { id, studentName, dayOfWeek: 1-7, startTime: 'HH:mm', endTime: 'HH:mm', subject, status: 'pending'|'done'|'changed'|'leave', notes, date, weekStart: '2026-07-27' }
    lastAutoWeek: '', // 上次自动延续的周，避免重复复制
  },

  // 排课个性化设置
  scheduleSettings: {
    // 科目 → 色板颜色（8个默认科目）
    subjectColors: {
      '数学': '#D4E4D0', '物理': '#C8D6E0', '化学': '#D8D0E8',
      '英语': '#E8D4C0', '语文': '#D8E8D0', '生物': '#E0D8C8',
      '历史': '#D0D4DC', '政治': '#E8D8D0', '地理': '#C8D8D8',
      '科学': '#DCE4D0', '其他': '#DCD8D4',
    },
    // 主题色板（可自定义 → 对应CSS变量）
    themePrimary: '#9BA88B',
    themeAccent: '#C4B8A8',
    themeBg: '#F5F3F0',
    themeCard: '#FFFFFF',
    themeText: '#4A4A4A',
  },

  // 备课文档库
  lessonPrep: {
    list: [],
    // { id, studentName, date, subject, teacherVersion, studentVersion, notes, createdAt }
  },

  // 学生名单（独立于课消，供排课/结算使用）
  students: {
    list: [],
    // { id, name, phone, notes, color, createdAt }
  },

  // 学生课消台账
  studentHours: {
    list: [],
    // { id, name, totalHours, usedHours, notes, phone, createdAt }
  },

  // 学生成绩档案
  grades: {
    list: [],
    // { id, studentName, examName, examType: 'school'|'institution', subject, score, fullScore, date, createdAt }
  },

  // 德化中考分数测算
  scoreCalc: {
    scores: {},
    // { chinese, math, english, physics, chemistry, history, politics, pe, experiment, geography, biology }
    targetSchool: '',
    cutoffScores: [],
    // { schoolName, cutoffScore, year }
  },

  // AI 对话记录
  aiChats: {
    ta: [],
    prep: [],
    // { id, role: 'user'|'ai', content, timestamp }
  },

  // 日历事件
  calendar: {
    events: [],
    // { id, title, date, type: 'teach'|'prep'|'important', notes }
  },

  // 考试倒计时
  countdown: {
    list: [],
    // { id, name, date, type: 'cert'|'exam', createdAt }
  },

  // 学习时长统计
  studyTime: {
    records: [],
    // { id, type: 'lesson'|'prep', duration: minutes, date, label }
  },

  // 课后反馈模板
  feedbackTemplates: {
    list: [],
    // { id, name, template, createdAt }
  },

  // 应用设置
  settings: {
    moduleOrder: [
      'dashboard', 'todo', 'calendar', 'countdown',
      'schedule', 'lessonPrep', 'studentHours', 'grades', 'billing', 'feedback', 'scoreCalc',
      'materials', 'examBank', 'errorBoard', 'statistics', 'aiAssistant', 'personalize'
    ],
    hiddenModules: [],
    pomodoroWorkMin: 25,
    pomodoroBreakMin: 5,
    aiRole: 'ta',
  },

  // 个性化设置
  personalization: {
    // 各模块图标（模块key → emoji）
    icons: {
      dashboard: '🏠', todo: '✅', calendar: '📅', countdown: '⏰',
      schedule: '📋', lessonPrep: '📝', studentHours: '📊', grades: '📈',
      feedback: '💬', scoreCalc: '🧮', materials: '📁', examBank: '📑',
      errorBoard: '❌', statistics: '⏱️', aiAssistant: '🤖',
      billing: '💰', personalize: '🎨',
    },
    // 背景设置
    background: {
      type: 'color',          // 'color' | 'gradient' | 'image'
      color: '#F5F3F0',       // 纯色背景
      gradient: 'linear-gradient(135deg, #F5F3F0 0%, #EDE9E4 100%)', // 渐变
      image: '',              // base64 图片
      overlayOpacity: 0.0,    // 背景叠加透明度（让内容可读）
    },
  },
};

/**
 * 初始化数据 - 如果没有数据则写入默认值
 */
function initData() {
  Object.keys(Models).forEach(key => {
    const stored = DB.get(key);
    if (stored === null) {
      DB.set(key, Models[key]);
    }
  });

  // 排课个性化设置兼容旧数据（没有 scheduleSettings 时补上）
  const ss = DB.get('scheduleSettings');
  if (!ss || typeof ss.subjectColors === 'undefined') {
    DB.set('scheduleSettings', Models.scheduleSettings);
  }

  // 学生名单迁移：从旧版 studentHours 中提取学生信息
  const studentsData = DB.get('students');
  const hoursData = DB.get('studentHours');
  if ((!studentsData || studentsData.list.length === 0) && hoursData && hoursData.list.length > 0) {
    const migrated = hoursData.list.map(h => ({
      id: h.id,
      name: h.name,
      phone: h.phone || '',
      notes: h.notes || '',
      createdAt: h.createdAt || DB.formatDate(new Date(), 'YYYY-MM-DD'),
    }));
    DB.set('students', { list: migrated });
  }

  // 旧排课数据自动添加 weekStart（默认当前周周一）
  const schedule = DB.get('schedule');
  if (schedule && schedule.list) {
    const todayMonday = getWeekMonday(new Date());
    let changed = false;
    schedule.list.forEach(s => {
      if (!s.weekStart) {
        s.weekStart = todayMonday;
        changed = true;
      }
    });
    if (changed) DB.set('schedule', schedule);
  }
}

/**
 * 获取模块数据快捷方法
 */
function getData(key) {
  return DB.get(key, Models[key] || {});
}

/**
 * 保存模块数据快捷方法
 */
function saveData(key, data) {
  return DB.set(key, data);
}

/**
 * 应用个性化设置 - 更新图标、主题、头像、水印
 */
function applyPersonalization() {
  const settings = getData('personalization');

  // 更新导航图标
  if (settings.icons) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const module = item.dataset.module;
      const iconSpan = item.querySelector('.nav-icon');
      if (iconSpan && settings.icons[module]) {
        iconSpan.textContent = settings.icons[module];
      }
    });
  }

  // 更新主题颜色
  applyTheme(settings.theme || 'blue');

  // 历史大图自动压缩，缩小同步体积（避免手机端同步超时失败）
  if (typeof shrinkAvatarIfNeeded === 'function') shrinkAvatarIfNeeded(settings);

  // 更新头像（未登录一律默认头像）
  const avatarBtn = document.getElementById('avatarBtn');
  if (avatarBtn) {
    const uiAvatar = (!Sync.isLoggedIn()) ? '👤' : (settings.avatar || 'A');
    if (uiAvatar.startsWith('data:')) {
      avatarBtn.innerHTML = '<img src="' + uiAvatar + '" alt="头像" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      avatarBtn.style.fontSize = '';
    } else {
      avatarBtn.innerHTML = uiAvatar;
      avatarBtn.style.fontSize = uiAvatar.length > 2 ? '14px' : '18px';
    }
  }

  // 更新水印/标题（用用户名）
  const username = localStorage.getItem('sync_username') || '用户';
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) {
    titleEl.textContent = username + '的工作台';
  }
  // 更新 launch screen 标题
  const launchTitle = document.querySelector('.launch-title');
  if (launchTitle) launchTitle.textContent = username + '的工作台';
  // 更新页面 title
  document.title = username + '的工作台';
  // 更新首页总览副标题
  const subtitleEl = document.querySelector('.module-subtitle');
  if (subtitleEl) subtitleEl.textContent = username + '，欢迎回来';

  // 更新背景
  // 先移除旧的背景图层与遮罩层，避免切换类型时残留
  const oldBg = document.getElementById('customBgLayer');
  if (oldBg) oldBg.remove();
  const oldOv = document.getElementById('customBgOverlay');
  if (oldOv) oldOv.remove();
  if (settings.background) {
    const bg = settings.background;
    const appEl = document.getElementById('app') || document.body;
    // 遮罩底色：深色主题用深底，其余用浅底，保证叠加层下内容可读
    const overlayRGB = (settings.theme === 'dark') ? '26,29,36' : '245,243,240';
    if (bg.type === 'color') {
      appEl.style.background = bg.color;
      appEl.style.backgroundImage = 'none';
    } else if (bg.type === 'gradient') {
      appEl.style.background = bg.gradient;
      appEl.style.backgroundImage = bg.gradient;
    } else if (bg.type === 'image' && bg.image) {
      // 关键修复：不要给容器设实色背景（会盖住后面的背景图），也不要降低背景图本身的 opacity
      appEl.style.background = 'transparent';
      appEl.style.backgroundImage = 'none';
      const layer = document.createElement('div');
      layer.id = 'customBgLayer';
      layer.style.cssText = 'position:fixed;inset:0;z-index:-2;background-image:url(' + bg.image + ');background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;';
      document.body.prepend(layer);
      // 叠加遮罩层：用底色 + overlayOpacity 控制背景图淡入程度（默认 0.15，背景图清晰可见）
      const overlay = document.createElement('div');
      overlay.id = 'customBgOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;z-index:-1;background:rgba(' + overlayRGB + ',' + (bg.overlayOpacity || 0.15) + ');pointer-events:none;';
      document.body.prepend(overlay);
    } else {
      appEl.style.background = bg.color || '#F5F3F0';
      appEl.style.backgroundImage = 'none';
    }
  }
}

/**
 * 应用主题颜色到 CSS 变量
 */
function applyTheme(themeId) {
  const root = document.documentElement;
  const themes = {
    blue: {
      bgGradient: 'linear-gradient(160deg, #E8F0F8 0%, #D6E4F2 50%, #C4D8EC 100%)',
      bgMain: '#E8F0F8',
      accent: '#3182CE', accentDark: '#2B6CB0',
      accentLight: 'rgba(49,130,206,0.12)', accentText: '#1A56DB',
      textPrimary: '#1A365D', textSecondary: '#5A7A9A', textMuted: '#8AAAC8',
      glassBg: 'rgba(255,255,255,0.45)', glassBorder: 'rgba(255,255,255,0.5)',
      glassCard: 'rgba(255,255,255,0.5)', glassHover: 'rgba(255,255,255,0.6)',
      sidebarBg: 'rgba(255,255,255,0.35)', topbarBg: 'rgba(255,255,255,0.35)'
    },
    mint: {
      bgGradient: 'linear-gradient(160deg, #E8F5EC 0%, #D4EDDA 50%, #C3E6CB 100%)',
      bgMain: '#E8F5EC',
      accent: '#38A169', accentDark: '#2F855A',
      accentLight: 'rgba(56,161,105,0.12)', accentText: '#276749',
      textPrimary: '#1A3D2A', textSecondary: '#5A7A6A', textMuted: '#8AAA9A',
      glassBg: 'rgba(255,255,255,0.45)', glassBorder: 'rgba(255,255,255,0.5)',
      glassCard: 'rgba(255,255,255,0.5)', glassHover: 'rgba(255,255,255,0.6)',
      sidebarBg: 'rgba(255,255,255,0.35)', topbarBg: 'rgba(255,255,255,0.35)'
    },
    lavender: {
      bgGradient: 'linear-gradient(160deg, #F0ECF8 0%, #E4DCF0 50%, #D8CCE8 100%)',
      bgMain: '#F0ECF8',
      accent: '#805AD5', accentDark: '#6B46C1',
      accentLight: 'rgba(128,90,213,0.12)', accentText: '#553C9A',
      textPrimary: '#2D1B4E', textSecondary: '#6A5A8A', textMuted: '#9A8AAA',
      glassBg: 'rgba(255,255,255,0.45)', glassBorder: 'rgba(255,255,255,0.5)',
      glassCard: 'rgba(255,255,255,0.5)', glassHover: 'rgba(255,255,255,0.6)',
      sidebarBg: 'rgba(255,255,255,0.35)', topbarBg: 'rgba(255,255,255,0.35)'
    },
    warm: {
      bgGradient: 'linear-gradient(160deg, #F8F2E8 0%, #F0E4D0 50%, #E8D8C0 100%)',
      bgMain: '#F8F2E8',
      accent: '#D69E2E', accentDark: '#975A16',
      accentLight: 'rgba(214,158,46,0.12)', accentText: '#744210',
      textPrimary: '#4A3520', textSecondary: '#7A6A5A', textMuted: '#AA9A8A',
      glassBg: 'rgba(255,255,255,0.45)', glassBorder: 'rgba(255,255,255,0.5)',
      glassCard: 'rgba(255,255,255,0.5)', glassHover: 'rgba(255,255,255,0.6)',
      sidebarBg: 'rgba(255,255,255,0.35)', topbarBg: 'rgba(255,255,255,0.35)'
    },
    dark: {
      bgGradient: 'linear-gradient(160deg, #1A1D24 0%, #22252E 50%, #2A2D38 100%)',
      bgMain: '#1A1D24',
      accent: '#63B3ED', accentDark: '#4299E1',
      accentLight: 'rgba(99,179,237,0.15)', accentText: '#90CDF4',
      textPrimary: '#E2E8F0', textSecondary: '#A0AEC0', textMuted: '#718096',
      glassBg: 'rgba(255,255,255,0.08)', glassBorder: 'rgba(255,255,255,0.1)',
      glassCard: 'rgba(255,255,255,0.08)', glassHover: 'rgba(255,255,255,0.12)',
      sidebarBg: 'rgba(255,255,255,0.05)', topbarBg: 'rgba(255,255,255,0.06)'
    }
  };

  const t = themes[themeId] || themes.blue;
  root.style.setProperty('--theme-bg-gradient', t.bgGradient);
  root.style.setProperty('--theme-bg-main', t.bgMain);
  root.style.setProperty('--theme-accent', t.accent);
  root.style.setProperty('--theme-accent-dark', t.accentDark);
  root.style.setProperty('--theme-accent-light', t.accentLight);
  root.style.setProperty('--theme-accent-text', t.accentText);
  root.style.setProperty('--theme-text-primary', t.textPrimary);
  root.style.setProperty('--theme-text-secondary', t.textSecondary);
  root.style.setProperty('--theme-text-muted', t.textMuted);
  root.style.setProperty('--theme-glass-bg', t.glassBg);
  root.style.setProperty('--theme-glass-border', t.glassBorder);
  root.style.setProperty('--theme-glass-card', t.glassCard);
  root.style.setProperty('--theme-glass-hover', t.glassHover);
  root.style.setProperty('--theme-sidebar-bg', t.sidebarBg);
  root.style.setProperty('--theme-topbar-bg', t.topbarBg);
}

/**
 * 获取某个日期所在周的周一（YYYY-MM-DD）
 */
function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return DB.formatDate(monday, 'YYYY-MM-DD');
}

/**
 * 自动延续排课 - 从有数据的最近一周复制到目标周
 * @param {string} targetMonday - 目标周的周一日期（YYYY-MM-DD）
 * @returns {boolean} 是否执行了延续
 */
function autoContinueSchedule(targetMonday) {
  const schedule = DB.get('schedule', { list: [], lastAutoWeek: '' });
  if (schedule.lastAutoWeek === targetMonday) return false; // 已经延续过

  // 检查目标周是否已有数据
  const hasTargetData = schedule.list.some(s => s.weekStart === targetMonday);
  if (hasTargetData) return false;

  // 找最近有数据的周（排除目标周之后的）
  const weeks = new Set();
  schedule.list.forEach(s => {
    if (s.weekStart && s.weekStart < targetMonday) weeks.add(s.weekStart);
  });
  if (weeks.size === 0) return false;

  const sortedWeeks = Array.from(weeks).sort().reverse();
  const sourceWeek = sortedWeeks[0]; // 最近的周

  // 复制排课：相同 dayOfWeek + startTime + endTime + student，重置状态为 pending
  const sourceSlots = schedule.list.filter(s => s.weekStart === sourceWeek);
  sourceSlots.forEach(slot => {
    schedule.list.push({
      id: DB.uid(),
      studentName: slot.studentName,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      subject: slot.subject,
      status: 'pending', // 新周重置状态
      notes: '',
      date: DB.formatDate(),
      weekStart: targetMonday,
    });
  });

  schedule.lastAutoWeek = targetMonday;
  DB.set('schedule', schedule);
  return true;
}

/**
 * 应用排课主题色 → 注入 CSS 变量
 */
function applyScheduleTheme() {
  const ss = getData('scheduleSettings');
  const root = document.documentElement;
  root.style.setProperty('--sch-primary', ss.themePrimary || '#9BA88B');
  root.style.setProperty('--sch-accent', ss.themeAccent || '#C4B8A8');
  root.style.setProperty('--sch-bg', ss.themeBg || '#F5F3F0');
  root.style.setProperty('--sch-card', ss.themeCard || '#FFFFFF');
  root.style.setProperty('--sch-text', ss.themeText || '#4A4A4A');
}

/**
 * 获取科目对应的颜色
 */
function getSubjectColor(subject) {
  const ss = getData('scheduleSettings');
  return ss.subjectColors[subject] || ss.subjectColors['其他'] || '#DCD8D4';
}

/**
 * 学生色板预设（16种柔和色）
 */
const STUDENT_COLOR_PALETTE = [
  '#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF', '#FFB3DE', '#B3FFE0',
  '#FFD4B3', '#B3D4FF', '#D4FFB3', '#FFB3D4', '#B3FFF0', '#F0B3FF', '#FFE0B3', '#B3E0FF',
];

/**
 * 获取学生对应的颜色（优先学生自定义，否则按索引取色板）
 */
function getStudentColor(studentName) {
  const students = getData('students');
  const s = students.list.find(x => x.name === studentName);
  if (s && s.color) return s.color;
  // 按学生名取颜色（同名学生同色）
  const idx = students.list.findIndex(x => x.name === studentName);
  if (idx >= 0) {
    return STUDENT_COLOR_PALETTE[idx % STUDENT_COLOR_PALETTE.length];
  }
  return '#DCD8D4'; // fallback
}
