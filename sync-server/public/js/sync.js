/**
 * sync.js - 跨设备云同步客户端（同源 Railway API 版）
 * 调用部署平台自带的同步服务器 /api/* 接口
 * 支持账号登录、数据推送/拉取、自动同步
 */

const Sync = {
  token: localStorage.getItem('sync_token') || null,
  username: localStorage.getItem('sync_username') || null,
  serverUrl: localStorage.getItem('sync_server_url') || '',
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
      // 切换账号时清空同步时间戳，强制拉取新账号的完整数据（含其头像/个性化设置）
      this.lastSyncAt = 0;
      localStorage.setItem('sync_last_at', '0');
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

  async _request(path, method = 'GET', body = null, attempt = 1) {
    // 离线时直接给出明确提示
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('当前设备离线，请检查网络');
    }

    const headers = {
      'Content-Type': 'application/json',
    };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

    const doFetch = async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 45000);
      try {
        const res = await fetch(path, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: ctrl.signal,
          cache: 'no-store',
        });
        if (!res.ok) {
          let errText = '';
          try { errText = (await res.json()).error || ''; } catch (e) {}
          throw new Error((errText || ('HTTP ' + res.status)));
        }
        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? await res.json() : await res.text();
      } catch (e) {
        if (e.name === 'AbortError') throw new Error('连接超时，请检查网络');
        throw e;
      } finally {
        clearTimeout(timer);
      }
    };

    try {
      return await doFetch();
    } catch (e) {
      // 网络切换等瞬断：自动重试一次
      const msg = (e.message || '').toLowerCase();
      const isNetworkError = !e.message || /load failed|failed to fetch|network|offline|fetch|connection/i.test(e.message);
      if (attempt === 1 && isNetworkError) {
        await new Promise(r => setTimeout(r, 1200));
        return this._request(path, method, body, attempt + 1);
      }
      // 把浏览器难懂的报错转成中文
      if (!e.message || /load failed/i.test(e.message)) {
        throw new Error('网络连接失败，请检查网络后重试');
      }
      throw e;
    }
  },

  async register(username, password) {
    const res = await this._request('/api/register', 'POST', { username, password });
    this._saveAuth(res.token, username);
    return res;
  },

  async login(username, password) {
    const res = await this._request('/api/login', 'POST', { username, password });
    this._saveAuth(res.token, username);
    return res;
  },

  async logout() {
    try { await this._request('/api/logout', 'POST'); } catch (e) {}
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
    const STORAGE_PREFIX = 'teaching_workbench_';
    const keys = Object.keys(remoteData);
    keys.forEach(key => {
      const fullKey = STORAGE_PREFIX + key;
      const remoteVal = remoteData[key];
      try {
        const localRaw = localStorage.getItem(fullKey);
        if (localRaw != null && Sync._isEmptyData(remoteVal) && !Sync._isEmptyData(localRaw)) return;
        // 对 personalization 配置对象做字段级合并：
        // 云端明确包含的字段整体覆盖本地同名字段，本地独有字段（云端没有）保留，
        // 避免云端缺头像/主题等字段时把本地自定义头像整体覆盖成默认。
        if (key === 'personalization' && localRaw != null && remoteVal && typeof remoteVal === 'object' && !Array.isArray(remoteVal)) {
          let localObj = null;
          try { localObj = JSON.parse(localRaw); } catch (e) { localObj = null; }
          if (localObj && typeof localObj === 'object' && !Array.isArray(localObj)) {
            const merged = { ...localObj };
            Object.keys(remoteVal).forEach(k => { merged[k] = remoteVal[k]; });
            localStorage.setItem(fullKey, JSON.stringify(merged));
            return;
          }
        }
        localStorage.setItem(fullKey, typeof remoteVal === 'string' ? remoteVal : JSON.stringify(remoteVal));
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

  async _fetchRemote() {
    try {
      const res = await this._request('/api/pull?username=' + encodeURIComponent(this.username), 'GET');
      if (res && res.data) return { data: res.data, updatedAt: res.updatedAt || 0 };
    } catch (e) {
      this._lastResult.error = e.message || '网络连接失败';
    }
    return null;
  },

  async _pushLocal() {
    const localData = this.collectLocalData();
    let merged = localData;
    let remoteData = null;
    let remote = null;
    try {
      remote = await this._fetchRemote();
      if (remote) {
        remoteData = remote.data;
        merged = this._mergeData(localData, remote.data);
      }
    } catch (e) {}

    // 关键修复：本地与服务器数据一致时不更新时间戳，避免多端互相触发"有新数据"的同步风暴
    if (remoteData && this._dataEqual(merged, remoteData)) {
      // 仅把本地 lastSyncAt 对齐到服务器的 updatedAt，不重新 push、不刷时间戳
      if (remote && remote.updatedAt) {
        this.lastSyncAt = remote.updatedAt;
        localStorage.setItem('sync_last_at', String(remote.updatedAt));
      }
      return;
    }

    const payload = { username: this.username, data: merged, updatedAt: Date.now() };
    await this._request('/api/push', 'POST', payload);
    this.lastSyncAt = payload.updatedAt;
    localStorage.setItem('sync_last_at', String(payload.updatedAt));
  },

  _normalize(o) {
    if (o == null) return o;
    if (Array.isArray(o)) return o.map(x => this._normalize(x));
    if (typeof o === 'object') {
      const keys = Object.keys(o).sort();
      const out = {};
      keys.forEach(k => { out[k] = this._normalize(o[k]); });
      return out;
    }
    return o;
  },

  _dataEqual(a, b) {
    try {
      return JSON.stringify(this._normalize(a)) === JSON.stringify(this._normalize(b));
    } catch (e) {
      return false;
    }
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

  async _pullOnly() {
    const result = await this._fetchRemote();
    if (result && result.updatedAt && result.updatedAt > this.lastSyncAt) {
      const before = this.collectLocalData();
      this.applyRemoteData(result.data);
      const after = this.collectLocalData();
      this.lastSyncAt = result.updatedAt;
      localStorage.setItem('sync_last_at', String(result.updatedAt));
      this._lastResult = { ok: true, time: Date.now(), error: '', pulled: true };
      this._updateStatus('ok');
      // 仅当实际数据发生变化时才刷新页面，避免无谓的反复加载
      if (!this._dataEqual(before, after)) {
        setTimeout(() => location.reload(), 400);
      }
    }
  },

  async pull() {
    const result = await this._fetchRemote();
    if (!result) return false;
    const remote = result.data || {};
    const local = this.collectLocalData();
    const localMissing = (k) => !local[k] || this._isEmptyData(local[k]);
    const remoteHas = (k) => remote[k] && !this._isEmptyData(remote[k]);
    const needForce = (localMissing('schedule') && remoteHas('schedule')) ||
                      (localMissing('students') && remoteHas('students'));
    if (result.updatedAt && (result.updatedAt > this.lastSyncAt || needForce)) {
      const before = this.collectLocalData();
      this.applyRemoteData(remote);
      const after = this.collectLocalData();
      this.lastSyncAt = result.updatedAt;
      localStorage.setItem('sync_last_at', String(result.updatedAt));
      // 仅当实际数据发生变化（或强制补全关键数据）时才认为"拉取成功并需刷新"
      return !this._dataEqual(before, after) || needForce;
    }
    return false;
  },

  async push() {
    await this._pushLocal();
  },

  async forceRestore() {
    const result = await this._fetchRemote();
    if (result) {
      this.applyRemoteData(result.data);
      this.lastSyncAt = result.updatedAt || Date.now();
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
      if (opts.reload !== false && changed) setTimeout(() => location.reload(), 600);
      return { ok: true, pulled };
    } catch (e) {
      this._updateStatus('error');
      this._lastResult = { ok: false, time: Date.now(), error: e.message || '未知错误', pulled: false };
      return { ok: false, error: e.message };
    } finally {
      this._syncing = false;
    }
  },

  scheduleSync() {
    if (!this.isLoggedIn()) return;
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.syncNow({ reload: false }), 3000);
  },

  getSyncInfo() {
    const fmt = (ts) => ts ? new Date(ts).toLocaleString('zh-CN') : '从未';
    return {
      serverUrl: this.serverUrl || '同源部署 (Railway)',
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
    const t = this._lastResult.time ? new Date(this._lastResult.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    if (state === 'ok') return t ? '已同步 ' + t : '已同步';
    return '同步失败: ' + (this._lastResult.error || '未知错误');
  },
};

(function patchDBSet() {
  const origSet = DB.set.bind(DB);
  DB.set = function (key, value) {
    const r = origSet(key, value);
    Sync.scheduleSync();
    return r;
  };
})();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!Sync.isLoggedIn() || Sync._syncing) return;
  Sync._pullOnly().catch(() => {});
});
