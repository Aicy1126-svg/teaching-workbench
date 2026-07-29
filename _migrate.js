const crypto = require('crypto');
const SECRET = 'teaching_workbench_sync_hmac_secret_2026';

function makeToken(username) {
  const payload = { u: username, e: Date.now() + 365 * 864e5 };
  const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(pB64).digest('base64url');
  return pB64 + '.' + sig;
}

const OLD = 'https://teaching-workbench-sync-production.up.railway.app';
const NEW = 'https://teaching-workbench-production.up.railway.app';

const fs = require('fs');
const users = (fs.readFileSync(__dirname + '/_migrate_users.txt', 'utf8'))
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean);

(async () => {
  for (const u of users) {
    const tok = makeToken(u);
    // 从旧服务器拉取
    const pull = await fetch(OLD + '/api/pull', { headers: { Authorization: 'Bearer ' + tok } });
    const j = await pull.json();
    const data = j.data || {};
    console.log(`[${u}] 旧服务器: updatedAt=${j.updatedAt}, 键数=${Object.keys(data).length}`);
    // 推到新服务器
    const push = await fetch(NEW + '/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ data }),
    });
    const pr = await push.json();
    // 回读验证
    const re = await fetch(NEW + '/api/pull', { headers: { Authorization: 'Bearer ' + tok } });
    const rj = await re.json();
    const rd = rj.data || {};
    const cnt = (k) => (rd[k] && rd[k].list) ? rd[k].list.length : 0;
    console.log(`[${u}] 迁移后新服务器: updatedAt=${rj.updatedAt}`);
    console.log(`   schedule=${cnt('schedule')} students=${cnt('students')} grades=${cnt('grades')} billing=${cnt('billing')} 总键=${Object.keys(rd).length}`);
  }
  console.log('=== 迁移完成 ===');
})().catch(e => { console.error('迁移失败:', e); process.exit(1); });
