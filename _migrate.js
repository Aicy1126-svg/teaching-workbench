// 把旧 Railway 账号数据迁移到新 Railway（已确认旧服务器有完整数据）
const crypto = require('crypto');

const OLD = 'https://teaching-workbench-sync-production.up.railway.app';
const NEW = 'https://teaching-workbench-production.up.railway.app';
const SECRET = 'teaching_workbench_sync_hmac_secret_2026';

function mintToken(username) {
  const payload = { u: username, e: Date.now() + 365 * 24 * 3600 * 1000 };
  const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(pB64).digest('base64url');
  return pB64 + '.' + sig;
}

async function api(method, url, token, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  try { return { status: res.status, data: text ? JSON.parse(text) : null }; }
  catch (e) { return { status: res.status, data: text }; }
}

(async () => {
  const username = 'Aicy';
  const token = mintToken(username);
  console.log('迁移账号:', username);

  // 1. 从旧服务器拉取
  const pull = await api('GET', OLD + '/api/pull', token);
  if (pull.status !== 200 || !pull.data || !pull.data.data) {
    console.log('⚠️ 旧服务器无数据，退出'); process.exit(1);
  }
  const data = pull.data.data;
  const schedN = (data.schedule && data.schedule.list) ? data.schedule.list.length : 0;
  const stuN = (data.students && data.students.list) ? data.students.list.length : 0;
  console.log(`✅ 旧服务器拉取: schedule=${schedN}条, students=${stuN}条, updatedAt=${pull.data.updatedAt}`);

  // 2. 推到新服务器
  const push = await api('POST', NEW + '/api/push', token, { data });
  if (push.status === 200) console.log('✅ 已写入新服务器');
  else { console.log('❌ 写入失败', push.status, JSON.stringify(push.data)); process.exit(1); }

  // 3. 文档库
  const dp = await api('GET', OLD + '/api/docs/pull', token);
  if (dp.status === 200 && dp.data && dp.data.docs) {
    await api('POST', NEW + '/api/docs/push', token, { docs: dp.data.docs, updatedAt: dp.data.updatedAt });
    console.log('✅ 文档库已迁移');
  }

  // 4. 回读新服务器验证
  const v = await api('GET', NEW + '/api/pull', token);
  const vd = v.data.data || {};
  const vs = (vd.schedule && vd.schedule.list) ? vd.schedule.list.length : 0;
  const vu = (vd.students && vd.students.list) ? vd.students.list.length : 0;
  console.log(`✅ 新服务器回读验证: schedule=${vs}条, students=${vu}条`);
  if (vs === schedN && vu === stuN) console.log('🎉 迁移一致，成功！');
  else console.log('⚠️ 数量不一致，需检查');
})();
