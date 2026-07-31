/**
 * 激活码配置（前端校验 + 分销商生成码 共用）
 * 分销商：发布前把 SECRET 改成你自己的随机串，然后再用 tools/gen-codes.js 生成激活码。
 * 注意：SECRET 会打包进客户端，技术用户可逆向提取——本方案是“轻付费” deterrent（ deterrent 门槛），
 * 不是强加密。若需强保护，请接入服务器校验（见 README“进阶：服务端激活校验”）。
 */
(function (root, factory) {
  const SECRET = 'TW-Rzade8HdPvvZY0PPkdmwaaZmo9QdoC39gKS5aMlZV50tJJGN-2026';
  const cfg = { SECRET: SECRET };
  if (typeof module !== 'undefined' && module.exports) module.exports = cfg;
  if (typeof window !== 'undefined') window.ACTIVATION_CONFIG = cfg;
})(typeof self !== 'undefined' ? self : this, function () {});
