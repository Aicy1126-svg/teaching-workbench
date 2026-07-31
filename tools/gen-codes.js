/**
 * 激活码生成工具（分销商用）
 * 用法：node tools/gen-codes.js [数量] [前缀]
 * 例：node tools/gen-codes.js 20        → 生成 20 个激活码
 *     node tools/gen-codes.js 10 AICY   → 生成 10 个，备注前缀 AICY
 *
 * 重要：本工具读取 js/activation.config.js 里的 SECRET，
 * 必须与已部署前端使用的是同一个 SECRET，生成的码才能通过校验。
 * 分发前请先改好 SECRET 再生成码，避免别人用你的源码自己造码。
 */
const crypto = require('crypto');
const path = require('path');

const cfg = require(path.join(__dirname, '..', 'js', 'activation.config.js'));
const SECRET = cfg.SECRET;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function b32encode(bytes) {
  let bits = 0, value = 0, out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function group(code) {
  return code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
}

function genCode() {
  const nonce = crypto.randomBytes(8);
  const mac = crypto.createHmac('sha256', SECRET).update(nonce).digest().slice(0, 6);
  const body = Buffer.concat([nonce, mac]); // 8 + 6 = 14 bytes
  return group(b32encode(body));
}

const count = parseInt(process.argv[2] || '5', 10);
const note = process.argv[3] || '';

console.log('\n==================== 教学工作台 激活码 ====================');
for (let i = 0; i < count; i++) {
  console.log((note ? note + ' · ' : '') + genCode());
}
console.log('==========================================================\n');
console.log(`共生成 ${count} 个。每个码可在任意设备激活一次（轻付费门槛，非强加密）。\n`);
