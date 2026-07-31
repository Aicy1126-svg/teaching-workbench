/**
 * login.js - 极简账号登录 / 注册（Railway 同源云端同步）
 * 用自己的账号：第一次输入即注册，之后本机自动登录；手机/平板用同一账号即可同步。
 */

function ensureDefaultServerUrl() {
  // 同源部署，不需要额外 serverUrl
}

function lastUsername() { return localStorage.getItem('sync_last_username') || ''; }
function saveLastUsername(u) { if (u) localStorage.setItem('sync_last_username', u); }

function esc(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showLoginModal() {
  const prefill = esc(Sync.username || lastUsername() || '');
  const body = `
    <div class="text-sm text-secondary mb-3">
      🔑 输入你<strong>自己的账号和密码</strong>即可：第一次会自动<strong>注册</strong>，之后这台设备自动登录。<br>
      用<strong>同一个账号</strong>在电脑 / 手机 / 平板上登录，排课、学生、便贴等数据会自动同步到云端。
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
    <div class="text-xs text-light mt-3" style="border-top:1px solid var(--border);padding-top:8px">
      ☁️ 数据存储在 Railway 云端数据库，永不过期、不丢失。
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
  const msgEl = document.getElementById('syncMsg');

  if (!username) {
    msgEl.textContent = '请填写账号';
    return;
  }
  msgEl.innerHTML = '<span style="color:#D4A957">⏳ 正在连接云端...</span>';
  try {
    let result;
    try {
      result = await Sync.login(username, password);
    } catch (e) {
      if (e.message && e.message.includes('密码错误')) {
        msgEl.textContent = '密码错误，请重试';
        return;
      }
      msgEl.innerHTML = '<span style="color:#D4A957">⏳ 账号不存在，正在注册...</span>';
      result = await Sync.register(username, password);
    }
    saveLastUsername(username);
    Modal.close(document.querySelector('.modal-overlay'));
    Toast.show('✅ 登录成功，正在同步数据...');
    updateSyncUI();
    if (typeof applyPersonalization === 'function') applyPersonalization();
    if (typeof renderModule === 'function' && App.module) renderModule(App.module);
    const r = await Sync.syncNow();
    if (r.ok && r.pulled) {
      Toast.show('📥 已从云端同步最新数据，即将刷新...');
    } else if (r.ok) {
      Toast.show('📤 本地数据已上传云端');
    } else {
      Toast.show('⚠️ 登录成功但同步失败: ' + (r.error || '未知'), 'error');
    }
  } catch (e) {
    console.error('[Login] 登录/注册失败:', e);
    let msg = '❌ ' + esc(e.message || '连接失败');
    msgEl.innerHTML = msg;
  }
}

function logoutAccount() {
  if (!confirm('确定退出登录？本机数据会保留，云端同步将暂停。')) return;
  Sync.logout();
  updateSyncUI();
  if (typeof applyPersonalization === 'function') applyPersonalization();
  Toast.show('已退出登录');
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
      <div class="input" style="background:var(--bg-input);word-break:break-all;font-size:12px">${esc(location.origin)}</div>
      <div class="text-xs text-light mt-2">手机/平板用浏览器打开这个网址，登录<strong>同一账号</strong>即可同步。</div>
    </div>
    <details class="sync-advanced" style="margin-top:10px;font-size:12px;color:var(--text-light)">
      <summary style="cursor:pointer">🔍 同步诊断信息</summary>
      <div style="margin-top:8px;font-family:monospace;font-size:11px;line-height:1.6;background:var(--bg-input);padding:8px;border-radius:6px">
        存储：${esc(info.serverUrl)}<br>
        登录状态：${info.loggedIn ? '✅ 已登录' : '❌ 未登录'}<br>
        Token：${esc(info.tokenPreview)}<br>
        上次同步：${esc(info.lastSyncAt)}<br>
        最近结果：${info.lastResult.ok ? '✅ 成功' : (info.lastResult.error ? '❌ 失败' : '—')}<br>
        失败原因：${esc(info.lastError)}
      </div>
    </details>
    <div class="flex gap-2 flex-col mt-3">
      <button class="btn btn-primary w-full" onclick="quickSync();Modal.close(document.querySelector('.modal-overlay'))">🔄 立即同步</button>
      <button class="btn btn-warning w-full" onclick="forceRestoreFromCloud()">⬇️ 强制从云端恢复数据（找回丢失数据）</button>
      <button class="btn btn-secondary w-full" onclick="Modal.close(document.querySelector('.modal-overlay'));setTimeout(showInstallGuide,250)">📱 安装到手机/平板</button>
      <button class="btn btn-danger w-full" onclick="logoutAccount();Modal.close(document.querySelector('.modal-overlay'))">🚪 退出登录</button>
    </div>
  `;
  Modal.show('☁️ 云同步', body, '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">关闭</button>');
}

// 安装指南
function showInstallGuide() {
  const url = location.origin;
  const body = `
    <div class="text-sm text-secondary mb-3">把工作台当成 App 放到手机/平板桌面上，打开即用、全屏显示。</div>
    <div class="form-group">
      <div class="form-label">🍎 iPhone / iPad（Safari）</div>
      <div class="text-sm text-light" style="line-height:1.7">
        1. 用手机 Safari 打开本工作台网址<br>
        <code style="word-break:break-all">${esc(url)}</code><br>
        2. 点底部中间的 <strong>分享</strong> 按钮（⬆️ 方框箭头）<br>
        3. 向上滑，找到并点 <strong>"添加到主屏幕"</strong><br>
        4. 起个名字（如"教培工作台"），点右上角 <strong>添加</strong><br>
        5. 桌面出现图标，点开即全屏 App ✅
      </div>
    </div>
    <div class="form-group">
      <div class="form-label">🤖 Android（Chrome / Edge）</div>
      <div class="text-sm text-light" style="line-height:1.7">
        1. 用手机 Chrome 打开本工作台网址<br>
        <code style="word-break:break-all">${esc(url)}</code><br>
        2. 点右上角 <strong>⋮</strong> 菜单 → <strong>"安装应用"</strong> 或 <strong>"添加到主屏幕"</strong><br>
        3. 按提示确认，桌面出现图标即完成<br>
      </div>
    </div>
  `;
  Modal.show('📱 安装到手机 / 平板', body, '<button class="btn btn-secondary" onclick="Modal.close(document.querySelector(\'.modal-overlay\'))">知道了</button>');
}

async function quickSync() {
  Toast.show('正在同步...');
  const r = await Sync.syncNow();
  updateSyncUI();
  if (r.ok) {
    Toast.show(r.pulled ? '✅ 同步成功，数据已更新' : '✅ 同步成功');
  } else {
    Toast.show('❌ 同步失败: ' + (r.error || '未知错误'), 'error');
    setTimeout(() => showSyncMenu(), 800);
  }
}

async function forceRestoreFromCloud() {
  if (!Sync.isLoggedIn()) { Toast.show('请先登录', 'error'); return; }
  if (!confirm('将从云端下载数据并覆盖本机当前显示的内容。\n\n此操作会用服务器上的数据（含排课表、学生、成绩等）替换本机所见。\n确定继续？')) return;
  Toast.show('正在从云端恢复数据...');
  try {
    await Sync.forceRestore();
    Toast.show('✅ 已从云端恢复数据，页面即将刷新');
  } catch (e) {
    Toast.show('❌ 恢复失败: ' + (e.message || '未知错误'), 'error');
    setTimeout(() => showSyncMenu(), 800);
  }
}

// 启动时初始化同步UI + 自动同步
function initSync() {
  ensureDefaultServerUrl();
  updateSyncUI();

  if (!Sync.isLoggedIn()) {
    Sync._updateStatus('offline');
    return;
  }

  Sync._updateStatus('offline');
  Sync._startAutoPull();
  setTimeout(() => {
    Sync.syncNow({ reload: false }).then(r => {
      if (r.ok && r.pulled) {
        Toast.show('📥 已从云端同步最新数据');
        setTimeout(() => location.reload(), 800);
      } else if (!r.ok) {
        console.warn('[Sync] 云端同步暂不可用: ' + (r.error || ''));
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
