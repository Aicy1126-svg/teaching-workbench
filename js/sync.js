/**
 * sync.js - 跨设备云同步客户端（Supabase 版）
 * 直接连接 Supabase REST API，无需中间服务器
 * 支持账号登录、数据推送/拉取、自动同步
 */

const SUPABASE_URL = 'https://znbwuxnn1zdxvgrrgkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpuYnd1bXhubml6ZHZ4Z3JyZ2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzOTk4NTksImV4cCI6MjEwMDk3NTg1OX0.YfnVj_RPzJcSUrV57toBJ2_alGkTie7yOlxk47PmQak';

const Sync = {
  serverUrl: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
  token: localStorage.getItem('sync_token') || null,
  username: localStorage.getItem('sync_username') || null,
  lastSyncAt: parseInt(localStorage.getItem('sync_last_at') || '0'),
  _debounceTimer: null,
  _syncing: false,
  _autoPullTimer: null,
  _lastResult: { ok: false, time: 0, error: '', pulled: false },

  isLoggedIn() {
    return !!this.token;
  },

  _saveAuth(token, username) {
    this.token = token;
    this.username = username;
    if (token) {
      localStorage.setItem('sync_token', token);
      localStorage.setItem('sync_username', username);
      this._startAutoPull();
    } else {
      localStorage.removeItem('sync_token');
      localStorage.removeItem('sync_username');
      this._stopAutoPull();
      this.lastSyncAt = 0;
      localStorage.removeItem('sync_last_at');
    }
  },

  _startAutoPull() {
    this._stopAutoPull();
    this._autoPullTimer = setInterval(() => {
      if (!this.isLoggedIn() || this._syncing) return;
      this._pullOnly().catch(() => {});
    }, 60000);
  },

  _stopAutoPull() {
    if (this._autoPullTimer) {
      clearInterval(this._autoPullTimer);
      this._autoPullTimer = null;
    }
  },

  async _pullOnly() {
    try {
      const result = await this._fetchRow(this.username);
      if (result && result.updated_at && result.updated_at > this.lastSyncAt) {
        this.applyRemoteData(result.data);
        this.lastSyncAt = result.updated_at;
        localStorage.setItem('sync_last_at', String(result.updated_at));
        this._lastResult = { ok: true, time: Date.now(), error: '', pulled: true };
        this._updateStatus('ok');
        setTimeout(() => location.reload(), 400);
      }
    } catch (e) {
      if (this._lastResult.ok) {
        this._lastResult.error = e.message;
      }
    }
  },

  // Supabase REST API 请求封装
  async _supabaseRequest(path, method = 'GET', body = null) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': 'Bearer ' + this.anonKey,
      'Prefer': 'return=representation',
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(SUPABASE_URL + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
        mode: 'cors',
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error('Supabase 错误 (' + res.status + '): ' + errText);
      }
      const data = await res.json().catch(() => null);
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        throw new Error('连接超时，请检查网络');
      }
      console.error('[Supabase] 请求失败:', e.message, path);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  async _fetchRow(username) {
    const data = await this._supabaseRequest(
      '/rest/v1/user_data?username=eq.' + encodeURIComponent(username) + '&select=*',
      'GET'
    );
    return data && data.length ? data[0] : null;
  },

  async _upsertRow(username, payload) {
    return this._supabaseRequest('/rest/v1/user_data', 'POST', {
      username,
      data: payload,
      updated_at: Date.now(),
    });
  },

  async _updateRow(username, payload) {
    return this._supabaseRequest(
      '/rest/v1/user_data?username=eq.' + encodeURIComponent(username),
      'PATCH',
      { data: payload, updated_at: Date.now() }
    );
  },

  // 账号登录：用户名+密码，密码用简单哈希存储（纯前端方案）
  async register(username, password) {
    // 简单哈希（非加密，仅用于本地校验）
    const pwdHash = btoa(unescape(encodeURIComponent(username + ':' + password)));
    // 检查用户是否存在
    const existing = await this._supabaseRequest(
      '/rest/v1/user_data?username=eq.' + encodeURIComponent(username) + '&select=username',
      'GET'
    );
    if (existing && existing.length) {
      throw new Error('用户名已存在');
    }
    const token = btoa(unescape(encodeURIComponent(username + ':' + Date.now())));
    await this._upsertRow(username, { _pwdHash: pwdHash, accounts: {} });
    this._saveAuth(token, username);
    return { token, username };
  },

  async login(username, password) {
    const pwdHash = btoa(unescape(encodeURIComponent(username + ':' + password)));
    const row = await this._fetchRow(username);
    if (!row) {
      throw new Error('用户不存在，请先注册');
    }
    const storedHash = (row.data && row.data._pwdHash) || '';
    if (storedHash !== pwdHash) {
      throw new Error('密码错误');
    }
    const token = btoa(unescape(encodeURIComponent(username + ':' + Date.now())));
    this._saveAuth(token, username);
    return { token, username };
  },

  async logout() {
    this._saveAuth(null, null);
    this._lastResult = { ok: false, time: 0, error: '', pulled: false };
    if (typeof updateSyncUI === 'function') updateSyncUI();
  },

  collectLocalData() {
    const STORAGE_PREFIX = 'teaching_workbench_';
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const shortKey = key.replace(STORAGE_PREFIX, '');
        try { data[shortKey] = JSON.parse(localStorage.getItem(key)); }
        catch (e) { data[shortKey] = localStorage.getItem(key); }
      }
    }
    return data;
  },

  applyRemoteData(remoteData) {
    if (!remoteData) return;
    // 去掉内部字段
    const cleanData = { ...remoteData };
    delete cleanData._pwdHash;
    const STORAGE_PREFIX = 'teaching_workbench_';
    const keys = Object.keys(cleanData);
    console.log('[Sync] 应用远程数据，共 ' + keys.length + ' 个键:', keys.join(', '));
    keys.forEach(key => {
      const fullKey = STORAGE_PREFIX + key;
      const remoteVal = cleanData[key];
      try {
        const localRaw = localStorage.getItem(fullKey);
        if (localRaw != null && Sync._isEmptyData(remoteVal) && !Sync._isEmptyData(localRaw)) {
          console.warn('[Sync] 跳过空覆盖：' + key + '（保留本地数据）');
          return;
        }
      } catch (e) {}
      try {
        localStorage.setItem(fullKey, typeof remoteVal === 'string'
          ? remoteVal
          : JSON.stringify(remoteVal));
      } catch (e) { console.warn('同步写入失败:', key, e); }
    });
  },

  _isEmptyData(v) {
    if (v == null) return true;
    if (typeof v === 'string') return v.trim() === '' || v === '[]' || v === '{}';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 0) return true;
      if (v.list && Array.isArray(v.list) && v.list.length === 0) return true;
      return false;
    }
    return false;
  },

  async pull() {
    const result = await this._fetchRow(this.username);
    if (!result) return false;
    const remote = (result.data && Object.keys(result.data).length > 1) ? result.data : {};
    const local = this.collectLocalData();
    const localMissing = (k) => !local[k] || this._isEmptyData(local[k]);
    const remoteHas = (k) => remote[k] && !this._isEmptyData(remote[k]);
    const needForce = (localMissing('schedule') && remoteHas('schedule')) ||
                      (localMissing('students') && remoteHas('students'));
    if (result.updated_at && (result.updated_at > this.lastSyncAt || needForce)) {
      this.applyRemoteData(remote);
      this.lastSyncAt = result.updated_at;
      localStorage.setItem('sync_last_at', String(result.updated_at));
      return true;
    }
    return false;
  },

  async push() {
    const localData = this.collectLocalData();
    let merged = localData;
    try {
      const remote = await this._fetchRow(this.username);
      const remoteData = remote ? (remote.data || {}) : {};
      merged = this._mergeData(localData, remoteData);
    } catch (e) {}
    // 保留密码哈希
    const remote = await this._fetchRow(this.username);
    if (remote && remote.data && remote.data._pwdHash) {
      merged._pwdHash = remote.data._pwdHash;
    }
    try {
      await this._updateRow(this.username, merged);
    } catch (e) {
      // 可能行不存在，尝试 insert
      await this._upsertRow(this.username, merged);
    }
    const now = Date.now();
    this.lastSyncAt = now;
    localStorage.setItem('sync_last_at', String(now));
  },

  _mergeData(local, server) {
    const out = { ...server };
    for (const k of Object.keys(local || {})) {
      const lv = local[k];
      const sv = server ? server[k] : undefined;
      if (this._isEmptyData(lv)) {
        if (!this._isEmptyData(sv)) out[k] = sv;
      } else {
        out[k] = lv;
      }
    }
    return out;
  },

  async forceRestore() {
    const result = await this._fetchRow(this.username);
    if (result) {
      this.applyRemoteData(result.data);
      this.lastSyncAt = result.updated_at || Date.now();
      localStorage.setItem('sync_last_at', String(this.lastSyncAt));
    }
    this._lastResult = { ok: true, time: Date.now(), error: '', pulled: true };
    this._updateStatus('ok');
    setTimeout(() => location.reload(), 500);
    return true;
  },

  async syncNow(opts = {}) {
    if (!this.isLoggedIn()) return { ok: false, error: '未登录' };
    if (this._syncing) return { ok: false, error: '同步进行中' };
    this._syncing = true;
    this._updateStatus('syncing');
    try {
      const pulled = await this.pull();
      await this.push();
      const now = Date.now();
      this._lastResult = { ok: true, time: now, error: '', pulled: !!pulled };
      this._updateStatus('ok');
      const changed = pulled;
      if (opts.reload !== false && changed) {
        setTimeout(() => location.reload(), 600);
      }
      return { ok: true, pulled };
    } catch (e) {
      this._updateStatus('error');
      this._lastResult = { ok: false, time: Date.now(), error: e.message || '未知错误', pulled: false };
      console.error('[Sync] 同步失败:', e.message);
      return { ok: false, error: e.message };
    } finally {
      this._syncing = false;
    }
  },

  scheduleSync() {
    if (!this.isLoggedIn()) return;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this.syncNow({ reload: false });
    }, 3000);
  },

  getSyncInfo() {
    const fmt = (ts) => {
      if (!ts) return '从未';
      const d = new Date(ts);
      return d.toLocaleString('zh-CN');
    };
    return {
      serverUrl: 'Supabase (云端)',
      username: this.username || '(未登录)',
      loggedIn: this.isLoggedIn(),
      lastSyncAt: fmt(this.lastSyncAt),
      lastResult: this._lastResult,
      lastResultTime: fmt(this._lastResult.time),
      lastError: this._lastResult.error || '无',
      tokenPreview: this.token ? (this.token.substring(0, 20) + '...') : '无',
      protocol: location.protocol,
      origin: location.origin,
    };
  },

  _updateStatus(state) {
    const el = document.getElementById('syncStatusDot');
    if (!el) return;
    const map = {
      syncing: { color: '#D4A957', title: '同步中...' },
      ok: { color: '#8BAA8B', title: this._formatStatusTitle('ok') },
      error: { color: '#C48080', title: this._formatStatusTitle('error') },
      offline: { color: '#AAA', title: '未同步' },
    };
    const s = map[state] || map.offline;
    el.style.background = s.color;
    el.title = s.title;
  },

  _formatStatusTitle(state) {
    const t = this._lastResult.time
      ? new Date(this._lastResult.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      : '';
    if (state === 'ok') return t ? '已同步 ' + t : '已同步';
    return '同步失败: ' + (this._lastResult.error || '未知错误');
  },
};

// 包装 DB.set 触发自动同步
(function patchDBSet() {
  const origSet = DB.set.bind(DB);
  DB.set = function (key, value) {
    const r = origSet(key, value);
    Sync.scheduleSync();
    return r;
  };
})();

// 切回页面时立即拉取
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!Sync.isLoggedIn() || Sync._syncing) return;
  Sync._pullOnly().catch(() => {});
});
