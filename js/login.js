/**
 * login.js - 极简账号登录 / 注册（同源，免填服务器地址）
 * 用自己的账号：第一次输入即注册，之后本机自动登录；手机/平板用同一账号即可同步。
 * v2: 增强错误提示 + 同步调试面板
 */

// 公网同步服务器（Railway 固定地址）。仅在显式使用 Railway 时作为可选地址。
const DEFAULT_SYNC_URL = 'https://teaching-workbench-sync-production.up.railway.app';

function ensureDefaultServerUrl() {
  const url = Sync.serverUrl || '';
  if (!url) {
    // 首次使用：默认同源 —— 谁打开 app 就同步到谁（本地服务器或 Railway 都行）
    Sync.setServerUrl(location.origin);
  } else if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // 旧逻辑曾把 localhost 强制改成 Railway，导致本地服务器无法当同步枢纽。
    // 改为同源：本地服务器（启动工作台.bat）即可作为手机/电脑的同步中心。
    Sync.setServerUrl(location.origin);
  }
  // 若已显式设为 Railway 或其他地址，保留不动（保留已有云端数据）
}

function lastUsername() { return localStorage.getItem('sync_last_username') || ''; }
function saveLastUsername(u) { if (u) localStorage.setItem('sync_last_username', u); }

function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showLoginModal() {
  // file:// 协议警告
  if (location.protocol === 'file:') {
    const body = `
      <div class="text-sm text-danger mb-3" style="font-weight:bold">⚠️ 当前以 file:// 协议打开，无法进行云同步！</div>
      <div class="text-sm text-secondary mb-3">
        请通过以下方式之一打开工作台才能使用同步功能：<br><br>
        <strong>方法一（推荐）：</strong>双击运行「启动工作台.bat」，然后浏览器打开 <code>http://localhost:8080</code><br><br>
        <strong>方法二：</strong>直接访问 Railway 线上地址<br>
        <code>https://teaching-workbench-sync-production.up.railway.app</code><br><br>
        <span class="text-xs text-light">两个方法登录同一账号即可跨设备同步。</span>
      </div>
    `;
    Modal.show('⚠️ 无法同步', body, '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">知道了</button>');
    return;
  }

  ensureDefaultServerUrl();
  const prefill = esc(Sync.username || lastUsername() || '');
  const body = `
    <div class="text-sm text-secondary mb-3">
      🔑 输入你<strong>自己的账号和密码</strong>即可：第一次会自动<strong>注册</strong>，之后这台设备自动登录。<br>
      用<strong>同一个账号</strong>在电脑 / 手机 / 平板上登录，排课、学生、便��贴等数据会自动同步。
    </div>
    <div class="form-group">
      <label class="form-label">账号（用户名）</label>
      <input class="input" id="syncUsername" value="${prefill}" placeholder="自己取一个，例如：li_laoshi">
    </div>
    <div class="form-group">
      <label class="form-label">密码</label>
      <input type="password" class="input" id="syncPassword" placeholder="自己设置，记住即可">
    </div>
    <div id="syncMsg" class="text-sm text-danger" style="min-height:18px"></div>
    <details class="sync-advanced" style="margin-top:10px;font-size:12px;color:var(--text-light)">
      <summary style="cursor:pointer">🔧 高级：自定义同步服务器</summary>
      <div class="form-group" style="margin-top:8px">
        <label class="form-label">服务器地址（可选）</label>
        <input class="input" id="syncServerUrl" value="${esc(Sync.serverUrl || '')}" placeholder="如 https://你的公网地址:8080">
        <div class="text-xs text-light mt-2">默认使用 Railway 公网服务器。如有自建服务器，可在此填入地址。</div>
      </div>
      <button class="btn btn-sm btn-secondary" onclick="applyServerUrl()">保存服务器地址</button>
    </details>
    <div class="text-xs text-light mt-3" style="border-top:1px solid var(--border);padding-top:8px">
      💡 同步服务器地址：<code style="word-break:break-all">${esc(Sync.serverUrl || DEFAULT_SYNC_URL)}</code>
    </div>
  `;
  const footer = `
    <button class="btn btn-secondary" onclick="Modal.close(document.querySelector('.modal-overlay'))">取消</button>
    <button class="btn btn-primary" onclick="doSyncLogin()">登录 / 注册</button>
  `;
  Modal.show('☁️ 账号登录 · 云同步', body, footer);
  setTimeout(() => {
    const u = document.getElementById('syncUsername');
    const p = document.getElementById('syncPassword');
    if (u && u.value) { if (p) p.focus(); }
    else if (u) u.focus();
  }, 100);
}

async function doSyncLogin() {
  const username = document.getElementById('syncUsername').value.trim();
  const password = document.getElementById('syncPassword').value;
  const urlEl = document.getElementById('syncServerUrl');
  if (urlEl && urlEl.value.trim()) Sync.setServerUrl(urlEl.value.trim());
  const msgEl = document.getElementById('syncMsg');

  if (!username) {
    msgEl.textContent = '请填写账号';
    return;
  }
  msgEl.innerHTML = '<span style="color:#D4A957">⏳ 正在连接服务器...</span>';
  try {
    let result;
    try {
      result = await Sync.login(username, password);
    } catch (e) {
      if (e.message && e.message.includes('用户名或密码错误')) {
        // 账号存在但密码错了 → 给明确提示
        msgEl.textContent = '密码错误，请重试';
        return;
      }
      // 其他错误（网络/超时等）→ 尝试注册
      msgEl.innerHTML = '<span style="color:#D4A957">⏳ 账号不存在，正在注册...</span>';
      result = await Sync.register(username, password);
    }
    saveLastUsername(username);
    Modal.close(document.querySelector('.modal-overlay'));
    Toast.show('✅ 登录成功，正在同步数据...');
    updateSyncUI();
    const r = await Sync.syncNow();
    if (r.ok && r.pulled) {
      Toast.show('📥 已从云端同步最新数据，即将刷新...');
    } else if (r.ok) {
      Toast.show('📤 本地数据已上传云端');
    } else {
      Toast.show('⚠️ 登录成功但同步失败: ' + (r.error || '未知'), 'error');
    }
  } catch (e) {
    let msg;
    if (e && e.fileProtocol) {
      msg = '⚠️ 当前以 file:// 协议打开，无法连接同步服务器。请通过 http://localhost:8080 或 Railway 线上地址打开工作台。';
    } else if (e && e.offline) {
      msg = '⚠️ ' + (e.message || '连接超时') + '<br><small>请确认网络正常，并将此地址在浏览器打开：<br><code>' + esc(DEFAULT_SYNC_URL) + '</code></small>';
    } else if (e && e.message && /fetch|network|Failed|ERR_/i.test(e.message)) {
      msg = '⚠️ 无法连接同步服务器<br><small>请检查：<br>1. 网络是否正常<br>2. 同步服务器是否在运行<br>服务器地址：<code>' + esc(Sync.serverUrl || DEFAULT_SYNC_URL) + '</code></small>';
    } else {
      msg = '❌ ' + esc(e.message || '连接失败');
    }
    msgEl.innerHTML = msg;
  }
}

function logoutAccount() {
  if (!confirm('确定退出登录？本机数据会保留，云端同步将暂停。')) return;
  Sync.logout();
  updateSyncUI();
  Toast.show('已退出登录');
}

function applyServerUrl() {
  const el = document.getElementById('syncServerUrl');
  if (!el) return;
  Sync.setServerUrl(el.value.trim());
  Toast.show(el.value.trim() ? '已保存公网服务器地址' : '已切换回同源（电脑本地）');
}

function updateSyncUI() {
  const btn = document.getElementById('syncAccountBtn');
  const statusDot = document.getElementById('syncStatusDot');
  if (!btn) return;
  if (Sync.isLoggedIn()) {
    btn.innerHTML = '👤 ' + esc(Sync.username) + ' · 同步';
    btn.onclick = showSyncMenu;
    if (statusDot) statusDot.style.display = 'inline-block';
  } else {
    btn.innerHTML = '☁️ 登录同步';
    btn.onclick = showLoginModal;
    if (statusDot) statusDot.style.display = 'none';
  }
}

function showSyncMenu() {
  resolvePhoneUrl().then(phoneUrl => {
    const otherUrl = phoneUrl || location.origin;
    const info = Sync.getSyncInfo();
    const statusColor = info.lastResult.ok ? '#8BAA8B' : (info.lastResult.error ? '#C48080' : '#AAA');
    const statusText = info.lastResult.ok
      ? (info.lastResult.pulled ? '已同步（有更新）' : '已同步')
      : (info.lastResult.error ? '失败: ' + esc(info.lastResult.error) : '未同步');
    const body = `
      <div class="text-sm text-secondary mb-3">
        当前账号：<strong>${esc(Sync.username)}</strong><br>
        同步状态：<span style="color:${statusColor};font-weight:bold">● ${statusText}</span><br>
        上次同步：${esc(info.lastResultTime)}
      </div>
      <div class="form-group">
        <label class="form-label">📱 在其他设备同步</label>
        <div class="input" style="background:var(--bg-input);word-break:break-all;font-size:12px">${esc(otherUrl)}</div>
        <div class="text-xs text-light mt-2">手机/电脑连<strong>同一 WiFi</strong>，用这个网址打开，登录<strong>同一账号</strong>即可同步。</div>
      </div>
    <details class="sync-advanced" style="margin-top:10px;font-size:12px;color:var(--text-light)">
      <summary style="cursor:pointer">🔍 同步诊断信息</summary>
      <div style="margin-top:8px;font-family:monospace;font-size:11px;line-height:1.6;background:var(--bg-input);padding:8px;border-radius:6px">
        服务器：${esc(info.serverUrl)}<br>
        登录状态：${info.loggedIn ? '✅ 已登录' : '❌ 未登录'}<br>
        协议：${esc(info.protocol)}<br>
        来源：${esc(info.origin)}<br>
        Token：${esc(info.tokenPreview)}<br>
        上次同步：${esc(info.lastSyncAt)}<br>
        最近结果：${info.lastResult.ok ? '✅ 成功' : (info.lastResult.error ? '❌ 失败' : '—')}<br>
        失败原因：${esc(info.lastError)}
      </div>
    </details>
    <div class="flex gap-2 flex-col mt-3">
      <button class="btn btn-primary w-full" onclick="quickSync();Modal.close(document.querySelector('.modal-overlay'))">🔄 立即同步</button>
      <button class="btn btn-secondary w-full" onclick="Modal.close(document.querySelector('.modal-overlay'));setTimeout(showInstallGuide,250)">📱 安装到手机/平板</button>
      <button class="btn btn-danger w-full" onclick="logoutAccount();Modal.close(document.querySelector('.modal-overlay'))">🚪 退出登录</button>
    </div>
  `;
    Modal.show('☁️ 云同步', body, '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">关闭</button>');
  });
}

// 解析"另一台设备"应该打开的网址：本地服务器用局域网 IP，Railway 用自身域名
async function resolvePhoneUrl() {
  if (location.protocol === 'file:') return '';
  const host = location.hostname;
  const isPrivate = host === 'localhost' || host === '127.0.0.1' || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) {
    try {
      const r = await fetch('/api/network');
      const j = await r.json();
      if (j && j.lan && j.lan.length) return `http://${j.lan[0]}:${j.port}`;
    } catch (e) {}
  }
  return location.origin;
}

function showInstallGuide() {
  resolvePhoneUrl().then(phoneUrl => {
    const url = phoneUrl || location.origin;
    const body = `
      <div class="text-sm text-secondary mb-3">把工作台当成 App 放到手机/平板桌面上，打开即用、全屏显示。</div>
      <div class="form-group">
        <div class="form-label">🍎 iPhone / iPad（Safari）</div>
        <div class="text-sm text-light" style="line-height:1.7">
          1. 手机和电脑连<strong>同一个 WiFi</strong><br>
          2. 用手机 Safari 打开本工作台网址<br>
          <code style="word-break:break-all">${esc(url)}</code><br>
          3. 点底部中间的 <strong>分享</strong> 按钮（⬆️ 方框箭头）<br>
          4. 向上滑，找到并点 <strong>"添加到主屏幕"</strong><br>
          5. 起个名字（如"教培工作台"），点右上角 <strong>添加</strong><br>
          6. 桌面出现图标，点开即全屏 App ✅
        </div>
      </div>
      <div class="form-group">
        <div class="form-label">🤖 Android（Chrome / Edge）</div>
        <div class="text-sm text-light" style="line-height:1.7">
          1. 手机和电脑连<strong>同一个 WiFi</strong><br>
          2. 用手机 Chrome 打开本工作台网址<br>
          <code style="word-break:break-all">${esc(url)}</code><br>
          3. 点右上角 <strong>⋮</strong> 菜单 → <strong>"安装应用"</strong> 或 <strong>"添加到主屏幕"</strong><br>
          4. 按提示确认，桌面出现图标即完成<br>
          <span style="color:#C48080">⚠️ 手机用电脑局域网地址同步，无需联网也能用；如需随时随地访问，再把本应用部署到 Railway 等公网。</span>
        </div>
      </div>
      ${location.protocol === 'file:' ? '<div class="text-sm text-danger" style="font-weight:bold">⚠️ 你正以 file:// 打开，无法同步。请通过上面的网址（或双击「启动工作台.bat」）打开本应用。</div>' : ''}
    `;
    Modal.show('📱 安装到手机 / 平板', body, '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">知道了</button>');
  });
}

async function quickSync() {
  Toast.show('正在同步...');
  const r = await Sync.syncNow();
  updateSyncUI();
  if (r.ok) {
    Toast.show(r.pulled ? '✅ 同步成功，数据已更新' : '✅ 同步成功');
  } else {
    Toast.show('❌ 同步失败: ' + (r.error || '未知错误'), 'error');
    // 同步失败后打开诊断面板
    setTimeout(() => showSyncMenu(), 800);
  }
}

// 启动时初始化同步UI + 自动同步
function initSync() {
  ensureDefaultServerUrl();
  updateSyncUI();

  // file:// 协议：显示明确警告但不阻塞使用
  if (location.protocol === 'file:') {
    Sync._updateStatus('offline');
    console.warn('[Sync] 当前以 file:// 打开，云同步不可用。请通过 http://localhost:8080 访问。');
    // 在顶部显示一条短暂提示
    setTimeout(() => {
      Toast.show('⚠️ file:// 协议无法同步，请用 http://localhost:8080 打开', 'error');
    }, 2000);
    return;
  }

  if (!Sync.isLoggedIn()) {
    Sync._updateStatus('offline');
    return;
  }

  // 已登录：后台静默同步 + 启动自动拉取定时器
  Sync._updateStatus('offline');
  // 关键修复：页面加载时必须重启 auto-pull 定时器，
  // 否则电脑端只在登录瞬间拉了那一次，之后手机端的数据永远同步不过来
  Sync._startAutoPull();
  setTimeout(() => {
    Sync.syncNow({ reload: false }).then(r => {
      if (r.ok && r.pulled) {
        Toast.show('📥 已从云端同步最新数据');
        setTimeout(() => location.reload(), 800);
      } else if (!r.ok) {
        console.warn('[Sync] 云端同步暂不可用: ' + (r.error || ''));
        // 失败时更新 UI 状态
        updateSyncUI();
      }
    }).catch(() => {
      console.warn('[Sync] 云端同步异常');
    });
  }, 1500);
}

window.addEventListener('online', () => {
  if (Sync.isLoggedIn()) {
    Toast.show('📶 网络已恢复，正在同步...');
    Sync.syncNow({ reload: false }).then(r => {
      if (r.ok && r.pulled) {
        Toast.show('📥 已同步最新数据');
        setTimeout(() => location.reload(), 600);
      }
    });
  }
});
