/**
 * 教培备考工作台 - 一体化服务器
 * 纯 Node.js 实现（无需 npm install）
 * 同时托管：网页静态资源 + 账号同步 API（同源，免填地址）
 * 启动：node server.js   (默认端口 8080)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 8080;
// 计算局域网 IP（供手机/平板通过同一 WiFi 连接本机服务器）
const LAN_IPS = (() => {
  const list = [];
  const ifaces = os.networkInterfaces();
  for (const k in ifaces) for (const a of ifaces[k]) {
    if (a.family === 'IPv4' && !a.internal) list.push(a.address);
  }
  return list;
})();
// 静态根目录：
// 1. 若 sync-server/public/ 存在（部署到云平台时，把前端资源打包在这里），优先用它
// 2. 否则兼容本地开发： teaching-workbench/ 根目录
let ROOT = path.join(__dirname, 'public');
if (!fs.existsSync(path.join(ROOT, 'index.html'))) {
  ROOT = path.join(__dirname, '..');
}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
console.log('[DATA_DIR] 数据目录:', DATA_DIR);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SALT = 'teaching_workbench_sync_2026';

// ---------- 用户数据 ----------
let users = {};
if (fs.existsSync(USERS_FILE)) {
  try { users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch (e) { users = {}; }
}
async function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  if (pg) {
    try {
      for (const username of Object.keys(users)) {
        const u = users[username];
        await pg.pool.query(
          `INSERT INTO accounts (username, "pwdHash", "createdAt")
           VALUES ($1, $2, $3)
           ON CONFLICT (username) DO UPDATE SET "pwdHash"=$2, "createdAt"=$3`,
          [username, u.pwdHash, u.createdAt]
        );
      }
    } catch (e) { console.error('[pg accounts]', e.message); }
  }
}
// ===== Token：HMAC 签名，无状态，部署重启不丢失 =====
const TOKEN_SECRET = 'teaching_workbench_sync_hmac_secret_2026';
const TOKEN_TTL = 365 * 24 * 3600 * 1000; // 365 天，几乎不掉线

function createToken(username) {
  const payload = {
    u: username,
    e: Date.now() + TOKEN_TTL, // 过期时间戳（毫秒）
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  return payloadB64 + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  // 校验签名
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(payloadB64).digest('base64url');
  if (sig !== expected) return null;
  // 解码并检查过期
  let payload;
  try { payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')); }
  catch (e) { return null; }
  if (!payload.u || !payload.e) return null;
  if (Date.now() > payload.e) return null; // 已过期
  return payload.u;
}
function hashPwd(pwd) { return crypto.createHash('sha256').update(pwd + SALT).digest('hex'); }
function userDataFile(username) {
  const safe = Buffer.from(username).toString('hex');
  return path.join(DATA_DIR, `data_${safe}.json`);
}
function userDocsFile(username) {
  const safe = Buffer.from(username).toString('hex');
  return path.join(DATA_DIR, `data_docs_${safe}.json`);
}

// ---------- 云存储（PostgreSQL / Supabase，可选）----------
// 设置了环境变量 DATABASE_URL 则数据存云端，Railway 重启/重新部署都不丢；否则用本地文件兜底
let pg = null; // { pool }

async function readUserData(username) {
  if (pg) {
    try {
      const r = await pg.pool.query('SELECT data, "updatedAt" FROM user_data WHERE username=$1', [username]);
      if (r.rows.length > 0) return { data: r.rows[0].data, updatedAt: r.rows[0].updatedAt || 0 };
      return null;
    } catch (e) { console.error('[pg read]', e.message); }
  }
  const f = userDataFile(username);
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } }
  return null;
}
async function writeUserData(username, payload) {
  if (pg) {
    try {
      await pg.pool.query(
        `INSERT INTO user_data (username, data, "updatedAt")
         VALUES ($1, $2, $3)
         ON CONFLICT (username) DO UPDATE SET data=$2, "updatedAt"=$3`,
        [username, JSON.stringify(payload.data), payload.updatedAt]
      );
      return;
    } catch (e) { console.error('[pg write]', e.message); }
  }
  fs.writeFileSync(userDataFile(username), JSON.stringify(payload, null, 2));
}
async function readUserDocs(username) {
  if (pg) {
    try {
      const r = await pg.pool.query('SELECT docs, "docsUpdatedAt" FROM user_docs WHERE username=$1', [username]);
      if (r.rows.length > 0) return { docs: r.rows[0].docs, updatedAt: r.rows[0].docsUpdatedAt || 0 };
      return { docs: null, updatedAt: 0 };
    } catch (e) { console.error('[pg docs read]', e.message); }
  }
  const f = userDocsFile(username);
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { docs: null, updatedAt: 0 }; } }
  return { docs: null, updatedAt: 0 };
}
async function writeUserDocs(username, payload) {
  if (pg) {
    try {
      await pg.pool.query(
        `INSERT INTO user_docs (username, docs, "docsUpdatedAt")
         VALUES ($1, $2, $3)
         ON CONFLICT (username) DO UPDATE SET docs=$2, "docsUpdatedAt"=$3`,
        [username, JSON.stringify(payload.docs), payload.updatedAt]
      );
      return;
    } catch (e) { console.error('[pg docs write]', e.message); }
  }
  fs.writeFileSync(userDocsFile(username), JSON.stringify(payload, null, 2));
}

// 启动时从 PostgreSQL 加载账号
async function loadAccountsFromPG() {
  const r = await pg.pool.query('SELECT username, "pwdHash", "createdAt" FROM accounts');
  const map = {};
  for (const row of r.rows) map[row.username] = { pwdHash: row.pwdHash, createdAt: row.createdAt };
  return map;
}
async function initStorage() {
  if (!process.env.DATABASE_URL) {
    console.log('[storage] 未设置 DATABASE_URL，使用本地文件存储');
    return;
  }
  try {
    const { Pool } = await import('pg');
    pg = { pool: new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 8000 }) };
    // 建表（如不存在）
    await pg.pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        username TEXT PRIMARY KEY,
        "pwdHash" TEXT,
        "createdAt" BIGINT
      );
      CREATE TABLE IF NOT EXISTS user_data (
        username TEXT PRIMARY KEY,
        data JSONB,
        "updatedAt" BIGINT
      );
      CREATE TABLE IF NOT EXISTS user_docs (
        username TEXT PRIMARY KEY,
        docs JSONB,
        "docsUpdatedAt" BIGINT
      );
    `);
    users = await loadAccountsFromPG();
    console.log('[storage] PostgreSQL 已连接，已加载', Object.keys(users).length, '个账号');
  } catch (e) {
    console.error('[storage] PostgreSQL 连接失败，回退本地文件:', e.message);
    pg = null;
  }
}

// ---------- 数据合并保护 ----------
// 判断数据是否为「空」（空数组、空对象、仅含空 list 的对象、空字符串）
function isEmptyData(v) {
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
}
// 合并：本地优先（本地非空覆盖服务器），本地为空时保留服务器数据，防止空推送清库
function mergeData(local, server) {
  const out = { ...server };
  for (const k of Object.keys(local || {})) {
    const lv = local[k];
    const sv = server ? server[k] : undefined;
    if (isEmptyData(lv)) {
      if (!isEmptyData(sv)) out[k] = sv; // 本地空、服务器有 → 保留服务器
    } else {
      out[k] = lv; // 本地有数据 → 本地优先
    }
  }
  return out;
}

// ---------- 静态文件 MIME ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function sendJSON(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(obj));
}
function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 50 * 1024 * 1024) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('JSON 解析失败')); } });
    req.on('error', reject);
  });
}
function authUser(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyToken(token);
}

// ---------- 路由 ----------
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;

  try {
    // ===== 同步 API =====
    if (p === '/api/health' && req.method === 'GET') {
      return sendJSON(res, 200, { ok: true, time: Date.now(), dataDir: DATA_DIR, storage: pg ? 'postgresql' : 'local-file' });
    }
    // 返回本机局域网地址，方便手机/平板通过同一 WiFi 连接本机服务器同步
    if (p === '/api/network' && req.method === 'GET') {
      return sendJSON(res, 200, { lan: LAN_IPS, port: PORT, origin: `http://${req.headers.host}` });
    }
    if (p === '/api/register' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username) return sendJSON(res, 400, { error: '用户名不能为空' });
      if (username.length < 2) return sendJSON(res, 400, { error: '用户名至少2个字符' });
      if (users[username]) return sendJSON(res, 409, { error: '该用户名已被注册，请直接登录' });
      users[username] = { pwdHash: hashPwd(password || ''), createdAt: Date.now() };
      await saveUsers();
      const token = createToken(username);
      return sendJSON(res, 200, { token, username });
    }
    if (p === '/api/login' && req.method === 'POST') {
      const { username, password } = await readBody(req);
      if (!username) return sendJSON(res, 400, { error: '用户名不能为空' });
      const u = users[username];
      if (!u || u.pwdHash !== hashPwd(password || '')) return sendJSON(res, 401, { error: '用户名或密码错误' });
      const token = createToken(username);
      return sendJSON(res, 200, { token, username });
    }
    const username = authUser(req);
    if (p.startsWith('/api/')) {
      if (!username) return sendJSON(res, 401, { error: '未登录或登录已过期' });
      if (p === '/api/pull' && req.method === 'GET') {
        return sendJSON(res, 200, (await readUserData(username)) || { data: null, updatedAt: 0 });
      }
      if (p === '/api/push' && req.method === 'POST') {
        const body = await readBody(req);
        // 合并保护：本地空字段不覆盖服务器真实数据，杜绝多端空推送清库
        const existing = await readUserData(username);
        const merged = mergeData(body.data || {}, existing ? existing.data : null);
        const serverTime = Date.now();
        await writeUserData(username, { data: merged, updatedAt: serverTime });
        return sendJSON(res, 200, { ok: true, updatedAt: serverTime });
      }
      if (p === '/api/logout' && req.method === 'POST') {
        // Token 无状态，客户端自己清除即可；服务器端无需操作
        return sendJSON(res, 200, { ok: true });
      }
      // 备课文档库同步（PDF/Word 二进制 + 手写图），与文本数据分开存储
      if (p === '/api/docs/pull' && req.method === 'GET') {
        return sendJSON(res, 200, await readUserDocs(username));
      }
      if (p === '/api/docs/push' && req.method === 'POST') {
        const body = await readBody(req);
        await writeUserDocs(username, { docs: body.docs || null, updatedAt: body.updatedAt || Date.now() });
        return sendJSON(res, 200, { ok: true, updatedAt: body.updatedAt || Date.now() });
      }
      return sendJSON(res, 404, { error: '接口不存在' });
    }

    // ===== 静态文件 =====
    let rel = decodeURIComponent(p);
    if (rel === '/' || rel === '') rel = '/index.html';
    const filePath = path.normalize(path.join(ROOT, rel));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return sendFile(res, filePath);
    }
    // SPA 回退
    if (!path.extname(rel)) {
      const idx = path.join(ROOT, 'index.html');
      if (fs.existsSync(idx)) return sendFile(res, idx);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  } catch (err) {
    console.error('[ERR]', err.message);
    if (!res.headersSent) sendJSON(res, 500, { error: '服务器错误: ' + err.message });
  }
});

(async function start() {
  await initStorage();
  server.listen(PORT, '0.0.0.0', () => {
    const ifaces = os.networkInterfaces();
    const lan = [];
    for (const k in ifaces) for (const a of ifaces[k]) {
      if (a.family === 'IPv4' && !a.internal) lan.push(a.address);
    }
    console.log('========================================');
    console.log(' 教培工作台 已启动（网页 + 云同步 一体化）');
    console.log(` 本机访问:  http://localhost:${PORT}`);
    if (lan.length) console.log(` 手机/平板: http://${lan[0]}:${PORT}`);
    console.log('========================================');
    console.log(' 登录只需用户名+密码，同账号自动跨设备同步');
    console.log(' 按 Ctrl+C 停止');
    console.log('========================================');
  });
})();

// ---------- 崩溃保护：异常不导致进程退出（保持服务可用）----------
process.on('uncaughtException', (err) => {
  console.error('[守护] 捕获未处理异常，服务继续运行:', err && err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[守护] 捕获未处理 Promise 拒绝，服务继续运行:', reason);
});
