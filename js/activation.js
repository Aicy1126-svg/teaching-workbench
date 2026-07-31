/**
 * activation.js - 轻付费激活码门槛
 * 启动检查：未激活则全屏拦截，输入正确激活码才能进入应用。
 * HMAC-SHA256 用纯 JS 实现，保证 file://、localhost、https 各环境都能校验。
 */
(function () {
  'use strict';

  // ---------- 纯 JS SHA-256 ----------
  function ror(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256bytes(bytes) {
    const K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ]);
    let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
    const l = bytes.length;
    const bitLen = l * 8;
    const withOne = l + 1;
    const k = (56 - (withOne % 64) + 64) % 64;
    const total = withOne + k + 8;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[l] = 0x80;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 4, bitLen >>> 0, false);
    dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
    const w = new Uint32Array(64);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
      for (let i = 16; i < 64; i++) {
        const s0 = ror(w[i-15],7) ^ ror(w[i-15],18) ^ (w[i-15] >>> 3);
        const s1 = ror(w[i-2],17) ^ ror(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,hh=h7;
      for (let i = 0; i < 64; i++) {
        const S1 = ror(e,6) ^ ror(e,11) ^ ror(e,25);
        const ch = (e & f) ^ ((~e) & g);
        const t1 = (hh + S1 + ch + w[i] + K[i]) | 0;
        const S0 = ror(a,2) ^ ror(a,13) ^ ror(a,22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        hh=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
      }
      h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+g)|0; h7=(h7+hh)|0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    odv.setUint32(0,h0,false); odv.setUint32(4,h1,false); odv.setUint32(8,h2,false); odv.setUint32(12,h3,false);
    odv.setUint32(16,h4,false); odv.setUint32(20,h5,false); odv.setUint32(24,h6,false); odv.setUint32(28,h7,false);
    return out;
  }
  function hmacSha256(keyBytes, msgBytes) {
    const blockSize = 64;
    let key = keyBytes;
    if (key.length > blockSize) key = sha256bytes(key);
    if (key.length < blockSize) { const k2 = new Uint8Array(blockSize); k2.set(key); key = k2; }
    const oKey = new Uint8Array(blockSize), iKey = new Uint8Array(blockSize);
    for (let i = 0; i < blockSize; i++) { oKey[i] = key[i] ^ 0x5c; iKey[i] = key[i] ^ 0x36; }
    const inner = new Uint8Array(blockSize + msgBytes.length);
    inner.set(iKey); inner.set(msgBytes, blockSize);
    const innerHash = sha256bytes(inner);
    const outer = new Uint8Array(blockSize + 32);
    outer.set(oKey); outer.set(innerHash, blockSize);
    return sha256bytes(outer);
  }

  // ---------- Base32 (RFC4648, 无填充) ----------
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  function b32encode(bytes) {
    let bits = 0, value = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
  }
  function b32decode(str) {
    str = (str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0, value = 0; const out = [];
    for (let i = 0; i < str.length; i++) {
      const idx = B32.indexOf(str[i]);
      if (idx < 0) continue;
      value = (value << 5) | idx; bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  function group(code) {
    return code.replace(/(.{4})/g, '$1-').replace(/-$/, '');
  }
  function codeFromBody(body) { return group(b32encode(body)); }

  // ---------- 激活逻辑 ----------
  const KEY_ACT = 'tw_activated';
  const KEY_CODE = 'tw_activation_code';
  const SECRET = (window.ACTIVATION_CONFIG && window.ACTIVATION_CONFIG.SECRET) || 'TW-ACT-DEFAULT';

  function strToBytes(s) { const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff; return b; }

  function verify(code) {
    try {
      const body = b32decode(code);
      if (body.length < 14) return false;
      const nonce = body.slice(0, 8);
      const mac = body.slice(8, 14);
      const expect = hmacSha256(strToBytes(SECRET), nonce).slice(0, 6);
      if (mac.length !== expect.length) return false;
      let diff = 0;
      for (let i = 0; i < expect.length; i++) diff |= (mac[i] ^ expect[i]);
      return diff === 0;
    } catch (e) { return false; }
  }

  function isActivated() {
    try { return localStorage.getItem(KEY_ACT) === '1'; } catch (e) { return false; }
  }
  function getCode() {
    try { return localStorage.getItem(KEY_CODE) || ''; } catch (e) { return ''; }
  }
  function activate(code) {
    if (!verify(code)) return { ok: false, error: '激活码无效，请检查后重试' };
    try {
      localStorage.setItem(KEY_ACT, '1');
      localStorage.setItem(KEY_CODE, code.trim().toUpperCase());
    } catch (e) {}
    return { ok: true };
  }
  function deactivate() {
    try { localStorage.removeItem(KEY_ACT); localStorage.removeItem(KEY_CODE); } catch (e) {}
  }

  // 全屏放大收款码（点击收款码后弹出，方便手机扫码）
  function openZoom(src) {
    const z = document.getElementById('qrZoom');
    if (z) z.parentNode.removeChild(z);
    const zov = document.createElement('div');
    zov.id = 'qrZoom';
    zov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:zoom-out;font-family:system-ui,-apple-system,sans-serif;';
    zov.innerHTML = `
      <div style="color:#fff;font-size:14px;margin-bottom:12px;">长按图片可保存 · 点击任意处关闭</div>
      <img src="${src}" style="width:min(86vw,86vh);max-width:440px;height:auto;background:#fff;border-radius:12px;padding:12px;box-sizing:border-box;" />
      <div style="color:#cbd5e0;font-size:12px;margin-top:14px;">用另一台手机扫这个码付款</div>`;
    zov.addEventListener('click', () => { if (zov.parentNode) zov.parentNode.removeChild(zov); });
    document.body.appendChild(zov);
  }

  // 全屏激活页
  function showScreen(onSuccess) {
    // 激活页已正常渲染，标记页面就绪，避免启动自检误判为白屏而循环刷新
    window.__appReady = true;
    const existing = document.getElementById('activationOverlay');
    if (existing) existing.parentNode.removeChild(existing);
    const ACT = window.ACTIVATION_CONFIG || {};
    const PAYMENT_QR = ACT.PAYMENT_QR || '';
    const MERCHANT_TIP = ACT.MERCHANT_TIP || '输入商家发给你的激活码以继续';
    const ov = document.createElement('div');
    ov.id = 'activationOverlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:linear-gradient(135deg,#1a1d24,#2a2d38);color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';
    ov.innerHTML = `
      <div style="max-width:440px;width:92%;text-align:center;padding:28px 24px;">
        <div style="font-size:44px;margin-bottom:8px;">🦋</div>
        <div style="font-size:24px;font-weight:700;margin-bottom:6px;">教学工作台</div>
        <div style="font-size:13px;color:#cbd5e0;margin-bottom:20px;line-height:1.6;">本软件为付费授权使用。请先付款，再输入激活码进入。</div>
        ${PAYMENT_QR ? `
        <div style="background:#fff;border-radius:16px;padding:14px;display:inline-block;margin-bottom:10px;">
          <img id="payQrImg" src="${PAYMENT_QR}" alt="商家收款码" style="width:160px;height:160px;display:block;border-radius:8px;object-fit:contain;cursor:pointer;"
               title="点击放大"
               onerror="this.style.display='none';this.parentNode.insertAdjacentHTML('beforeend','<div style=\\'width:160px;height:160px;display:flex;align-items:center;justify-content:center;color:#888;font-size:13px;text-align:center;\\'>（商家未设置收款码）<br>请联系商家付款</div>');" />
        </div>
        <div style="font-size:12px;color:#cbd5e0;margin-bottom:16px;line-height:1.6;">${MERCHANT_TIP}</div>
        ` : `<div style="font-size:12px;color:#cbd5e0;margin-bottom:16px;">${MERCHANT_TIP}</div>`}
        <input id="actCodeInput" placeholder="XXXX-XXXX-XXXX" style="width:100%;padding:14px 16px;font-size:18px;text-align:center;letter-spacing:2px;border-radius:12px;border:2px solid #4a5568;background:#11151c;color:#fff;outline:none;box-sizing:border-box;text-transform:uppercase;" />
        <div id="actError" style="color:#fc8181;font-size:13px;min-height:20px;margin-top:10px;"></div>
        <button id="actSubmitBtn" style="width:100%;padding:14px;font-size:16px;font-weight:600;border:none;border-radius:12px;background:linear-gradient(135deg,#805AD5,#3182CE);color:#fff;cursor:pointer;margin-top:6px;">激活并进入</button>
        <div style="font-size:12px;color:#718096;margin-top:16px;line-height:1.6;">激活码由提供方发放，一码一机。<br>遇到问题请联系你的软件提供方。</div>
      </div>`;
    document.body.appendChild(ov);
    const qrImg = ov.querySelector('#payQrImg');
    if (qrImg) qrImg.addEventListener('click', () => openZoom(PAYMENT_QR));
    const input = ov.querySelector('#actCodeInput');
    const err = ov.querySelector('#actError');
    const btn = ov.querySelector('#actSubmitBtn');
    function submit() {
      const code = input.value.trim();
      if (!code) { err.textContent = '请输入激活码'; return; }
      const r = activate(code);
      if (!r.ok) { err.textContent = r.error; input.focus(); return; }
      ov.parentNode.removeChild(ov);
      if (typeof onSuccess === 'function') onSuccess();
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    setTimeout(() => input.focus(), 100);
  }

  // 启动检查：未激活返回 false 并展示拦截页；已激活返回 true
  function check(onSuccess) {
    if (isActivated()) return true;
    showScreen(onSuccess);
    return false;
  }

  window.Activation = {
    isActivated, getCode, activate, deactivate, verify, showScreen, check,
    // 调试用：暂时移除拦截页并进入（不影响已激活状态，刷新后仍会拦截）
    forceOpen: function () {
      const ov = document.getElementById('activationOverlay');
      if (ov) ov.parentNode.removeChild(ov);
    }
  };
})();
