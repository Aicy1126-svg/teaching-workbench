/**
 * sync.js - 跨设备云同步客户端
 * 负责账号登录、数据推送/拉取、自动同步
 * v2: 长超时、定期拉取、错误可视化、调试面板
 */

const Sync = {
  serverUrl: localStorage.getItem('sync_server_url') || '',
  token: localStorage.getItem('sync_token') || null,
  username: localStorage.getItem('sync_username') || null,
  lastSyncAt: parseInt(localStorage.getItem('sync_last_at') || '0'),
  _debounceTimer: null,
  _syncing: false,
  _autoPullTimer: null,
  // 追踪最后同步结果，供 UI 展示
  _lastResult: { ok: false, time: 0, error: '', pulled: false },

  isLoggedIn() {
    return !!this.token;
  },

  setServerUrl(url) {
    url = (url || '').trim().replace(/\/+$/, '');
    this.serverUrl = url;
    if (url) localStorage.setItem('sync_server_url', url);
    else localStorage.removeItem('sync_server_url');
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

  // 定期后台拉取（已登录时每 60 秒拉一次，感知其他设备变更）
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

  // 仅拉取（不推送），供定期后台使用
  async _pullOnly() {
    try {
      const result = await this._request('/api/pull', 'GET');
      if (result.updatedAt && result.updatedAt > this.lastSyncAt) {
        this.applyRemoteData(result.data);
        this.lastSyncAt = result.updatedAt;
        localStorage.setItem('sync_last_at', String(result.updatedAt));
        this._lastResult = { ok: true, time: Date.now(), error: '', pulled: true };
        this._updateStatus('ok');
        // 有新数据，静默刷新页面
        setTimeout(() => location.reload(), 400);
      }
    } catch (e) {
      // 后台拉取失败不要弹提示，只记录
      if (this._lastResult.ok) {
        this._lastResult.error = e.message;
      }
    }
  },

  async _request(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const url = this.serverUrl ? (this.serverUrl + path) : path;

    // file:// 协议禁止 fetch 到 HTTPS → 直接给明确错误
    if (location.protocol === 'file:' && /^https?:/i.test(url)) {
      const err = new Error('当前以 file:// 打开，无法连接同步服务器。请通过 http://localhost:8080 或 Railway 地址打开。');
      err.offline = true;
      err.fileProtocol = true;
      throw err;
    }

    // 超时 15 秒，覆盖弱网和 Railway 冷启动
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        this._saveAuth(null, null);
        this._updateStatus('offline');
        if (typeof updateSyncUI === 'function') updateSyncUI();
        const err = new Error('登录已过期，请重新登录');
        err.authExpired = true;
        throw err;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || ('请求失败 (' + res.status + ')'));
      }
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        const err = new Error('连接超时，请检查网络或服务器状态');
        err.offline = true;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  },

  async register(username, password) {
    const data = await this._request('/api/register', 'POST', { username, password });
    this._saveAuth(data.token, data.username);
    return data;
  },

  async login(username, password) {
    const data = await this._request('/api/login', 'POST', { username, password });
    this._saveAuth(data.token, data.username);
    return data;
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
    console.log('[Sync] 应用远程数据，共 ' + keys.length + ' 个键:', keys.join(', '));
    keys.forEach(key => {
      const fullKey = STORAGE_PREFIX + key;
      try {
        localStorage.setItem(fullKey, typeof remoteData[key] === 'string'
          ? remoteData[key]
          : JSON.stringify(remoteData[key]));
      } catch (e) { console.warn('同步写入失败:', key, e); }
    });
  },

  async pull() {
    const result = await this._request('/api/pull', 'GET');
    if (result.updatedAt && result.updatedAt > this.lastSyncAt) {
      this.applyRemoteData(result.data);
      this.lastSyncAt = result.updatedAt;
      localStorage.setItem('sync_last_at', String(result.updatedAt));
      return true;
    }
    return false;
  },

  async push() {
    const localData = this.collectLocalData();
    const result = await this._request('/api/push', 'POST', { data: localData });
    // 使用服务器时间戳，保证多设备时钟一致
    if (result.updatedAt) {
      this.lastSyncAt = result.updatedAt;
      localStorage.setItem('sync_last_at', String(result.updatedAt));
    }
  },

  async syncNow(opts = {}) {
    if (!this.isLoggedIn()) return { ok: false, error: '未登录' };
    if (this._syncing) return { ok: false, error: '同步进行中' };
    this._syncing = true;
    this._updateStatus('syncing');
    try {
      const pulled = await this.pull();
      await this.push();
      const docRes = await this.syncDocs();
      const now = Date.now();
      this._lastResult = { ok: true, time: now, error: '', pulled: !!pulled };
      this._updateStatus('ok');
      const changed = pulled || (docRes && docRes.pulled);
      if (opts.reload !== false && changed) {
        setTimeout(() => location.reload(), 600);
      }
      return { ok: true, pulled, docSynced: docRes && docRes.ok };
    } catch (e) {
      this._updateStatus('error');
      this._lastResult = { ok: false, time: Date.now(), error: e.message || '未知错误', pulled: false };
      console.error('[Sync] 同步失败:', e.message);
      if (e.authExpired && typeof showLoginModal === 'function') {
        setTimeout(() => showLoginModal(), 500);
      }
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

  // 获取同步诊断信息
  getSyncInfo() {
    const fmt = (ts) => {
      if (!ts) return '从未';
      const d = new Date(ts);
      return d.toLocaleString('zh-CN');
    };
    return {
      serverUrl: this.serverUrl || '(同源)',
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

  // 文档同步（保持原逻辑，不变）
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  },

  _dataUrlToBlob(dataUrl) {
    return new Promise((resolve, reject) => {
      try {
        const [head, b64] = dataUrl.split(',');
        const mime = (head.match(/:(.*?);/) || [])[1] || 'application/octet-stream';
        const bin = atob(b64);
        const len = bin.length;
        const arr = new Uint8Array(len);
        for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: mime }));
      } catch (e) { reject(e); }
    });
  },

  async syncDocs() {
    if (!this.isLoggedIn()) return { ok: false, error: '未登录' };
    if (typeof DocDB === 'undefined') return { ok: false, error: '无文档库' };
    try {
      const pullRes = await this._request('/api/docs/pull', 'GET');
      const cloudDocs = pullRes.docs || { documents: [], handwriting: [] };
      const [localDocs, localHw] = await Promise.all([
        DocDB.getAll('documents'),
        DocDB.getAll('handwriting'),
      ]);
      if (localDocs.length === 0 && localHw.length === 0 && (cloudDocs.documents || []).length > 0) {
        for (const d of (cloudDocs.documents || [])) {
          const restored = { ...d };
          if (d.blobDataUrl) {
            restored.blob = await this._dataUrlToBlob(d.blobDataUrl);
            delete restored.blobDataUrl;
          }
          await DocDB.put('documents', restored);
        }
        for (const h of (cloudDocs.handwriting || [])) {
          await DocDB.put('handwriting', h);
        }
        return { ok: true, pulled: true };
      }
      const docsForPush = await Promise.all(localDocs.map(async d => {
        const out = { ...d };
        if (d.blob && typeof d.blob !== 'string') {
          out.blobDataUrl = await this._blobToBase64(d.blob);
          delete out.blob;
        }
        return out;
      }));
      await this._request('/api/docs/push', 'POST', {
        docs: { documents: docsForPush, handwriting: localHw },
        updatedAt: Date.now(),
      });
      return { ok: true, pushed: true };
    } catch (e) {
      console.warn('[Sync] 文档同步��败:', e.message);
      return { ok: false, error: e.message };
    }
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

// 切回页面时立即拉取（比如手机改完数据、切回电脑浏览器时立刻同步）
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (!Sync.isLoggedIn() || Sync._syncing) return;
  Sync._pullOnly().catch(() => {});
});
