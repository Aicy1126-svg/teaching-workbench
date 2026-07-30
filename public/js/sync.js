/**
 * sync.js - 跨设备云同步客户端（GitHub 仓库文件版）
 * 用 GitHub Contents API 读写仓库里的 data/<用户名>.json
 * 支持账号登录、数据推送/拉取、自动同步
 */

const GITHUB_OWNER = 'Aicy1126-svg';
const GITHUB_REPO = 'teaching-workbench';
const GITHUB_API = 'https://api.github.com';

const Sync = {
  token: localStorage.getItem('github_token') || null,
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
      localStorage.setItem('sync_username', username);
      this._startAutoPull();
    } else {
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
      const result = await this._fetchData();
      if (result && result.updatedAt && result.updatedAt > this.lastSyncAt) {
        this.applyRemoteData(result.data);
        this.lastSyncAt = result.updatedAt;
        localStorage.setItem('sync_last_at', String(result.updatedAt));
        this._lastResult = { ok: true, time: Date.now(), error: '', pulled: true };
        this._updateStatus('ok');
        setTimeout(() => location.reload(), 400);
      }
    } catch (e) {
      if (this._lastResult.ok) this._lastResult.error = e.message;
    }
  },

  async _githubRequest(path, method = 'GET', body = null) {
    const headers = {
      'Authorization': 'Bearer ' + this.token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const res = await fetch(GITHUB_API + path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
        cache: 'no-store',
        mode: 'cors',
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error('GitHub 错误 (' + res.status + '): ' + errText.slice(0, 200));
      }
      return await res.json().catch(() => null);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('连接超时，请检查网络');
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  _dataPath() {
    return '/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/data/' + encodeURIComponent(this.username) + '.json';
  },

  async _fetchData() {
    try {
      const res = await this._githubRequest(this._dataPath(), 'GET');
      if (res && res.content) {
        const json = JSON.parse(atob(res.content.replace(/\s/g, '')));
        return { data: json.data || {}, updatedAt: json.updatedAt || 0, sha: res.sha };
      }
    } catch (e) {
      if (e.message && e.message.includes('404')) return null;
      throw e;
    }
    return null;
  },

  async _saveData(payload) {
    const existing = await this._fetchData().catch(() => null);
    const body = {
      message: 'sync: update ' + this.username + ' data',
      content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2)))),
      branch: 'main',
    };
    if (existing && existing.sha) body.sha = existing.sha;
    return this._githubRequest(this._dataPath(), 'PUT', body);
  },

  async register(username, password) {
    const pwdHash = btoa(unescape(encodeURIComponent(username + ':' + password)));
    const existing = await this._fetchData().catch(() => null);
    if (existing) throw new Error('用户名已存在');
    const token = btoa(unescape(encodeURIComponent(username + ':' + Date.now())));
    await this._saveData({ _pwdHash: pwdHash, accounts: {}, updatedAt: Date.now() });
    this._saveAuth(token, username);
    return { token, username };
  },

  async login(username, password) {
    const pwdHash = btoa(unescape(encodeURIComponent(username + ':' + password)));
    const row = await this._fetchData();
    if (!row) throw new Error('用户不存在，请先注册');
    const storedHash = (row.data && row.data._pwdHash) || '';
    if (storedHash !== pwdHash) throw new Error('密码错误');
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
    const cleanData = { ...remoteData };
    delete cleanData._pwdHash;
    const STORAGE_PREFIX = 'teaching_workbench_';
    const keys = Object.keys(cleanData);
    keys.forEach(key => {
      const fullKey = STORAGE_PREFIX + key;
      const remoteVal = cleanData[key];
      try {
        const localRaw = localStorage.getItem(fullKey);
        if (localRaw != null && Sync._isEmptyData(remoteVal) && !Sync._isEmptyData(localRaw)) return;
      } catch (e) {}
      try {
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

  async pull() {
    const result = await this._fetchData();
    if (!result) return false;
    const remote = result.data || {};
    const local = this.collectLocalData();
    const localMissing = (k) => !local[k] || this._isEmptyData(local[k]);
    const remoteHas = (k) => remote[k] && !this._isEmptyData(remote[k]);
    const needForce = (localMissing('schedule') && remoteHas('schedule')) ||
                      (localMissing('students') && remoteHas('students'));
    if (result.updatedAt && (result.updatedAt > this.lastSyncAt || needForce)) {
      this.applyRemoteData(remote);
      this.lastSyncAt = result.updatedAt;
      localStorage.setItem('sync_last_at', String(result.updatedAt));
      return true;
    }
    return false;
  },

  async push() {
    const localData = this.collectLocalData();
    let merged = localData;
    try {
      const remote = await this._fetchData();
      const remoteData = remote ? (remote.data || {}) : {};
      merged = this._mergeData(localData, remoteData);
      if (remoteData._pwdHash) merged._pwdHash = remoteData._pwdHash;
    } catch (e) {}
    merged.updatedAt = Date.now();
    await this._saveData(merged);
    this.lastSyncAt = merged.updatedAt;
    localStorage.setItem('sync_last_at', String(merged.updatedAt));
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
    const result = await this._fetchData();
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
      serverUrl: 'GitHub 仓库 (云端)',
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
