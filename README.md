# 教培备考工作台 · 分发与部署手册

一个面向初高中教培老师的轻量化效率工具（排课备课、课消成绩、学情报告、课时结算、AI 反馈等）。
**手机端 / 平板端**通过「添加到主屏幕」即可当作原生 App 使用（PWA），无需应用商店。
内置**轻付费激活码门槛**，可发给别人按码收费。

---

## 一、给买家的使用方式（两种，任选）

### 方式 A：你代部署，买家只拿「网址 + 激活码」（最省事，推荐小批量）
1. 你把自己的 Railway 实例地址（如 `https://你的域名`）发给买家。
2. 用 `tools/gen-codes.js` 生成激活码发给买家。
3. 买家打开网址 → 输入激活码 → 进入。手机/平板点「分享 / 添加到主屏幕」即可当 App。

### 方式 B：买家自己一键部署（数据各自独立，推荐大批量）
1. 买家把本目录上传到自己的 GitHub 仓库（或你发 ZIP，买家解压后上传）。
2. 打开 https://railway.app → New Project → Deploy from GitHub repo → 选该仓库。
3. 在 Railway 项目里 **Add Plugin → PostgreSQL**（必须，否则重启丢数据）。
4. 部署完成，Railway 会给一个 `xxx.up.railway.app` 网址。
5. 买家打开网址 → 输入你给的激活码 → 进入；手机/平板「添加到主屏幕」。

> 已内置 `Procfile` / `package.json` 的 `start` 脚本，Railway 自动识别 `node sync-server/server.js`。
> 不配 `DATABASE_URL` 时，数据以文件形式存在服务器本地（适合本地运行 / 演示）。

---

## 二、手机 / 平板「安装」为 App（PWA）

| 平台 | 操作 |
|------|------|
| **iPhone / iPad (Safari)** | 打开网址 → 点底部「分享」图标 → 「添加到主屏幕」→ 名称默认「教培工作台」→ 主屏出现图标，全屏打开无地址栏 |
| **安卓手机 / 平板 (Chrome)** | 打开网址 → 地址栏右侧「⋮」或「安装」提示 → 「安装」→ 主屏出现图标；或「分享 → 添加到主屏幕」 |
| **桌面 (Chrome/Edge)** | 地址栏右侧「安装」图标 → 安装为桌面应用 |

安装后体验与 App 一致：独立图标、全屏、可离线打开（数据仍存在云端/本地）。

---

## 三、轻付费激活码（分销商操作）

激活逻辑在 `js/activation.js`：启动即检查本机是否已激活，未激活弹出全屏激活页，输入正确激活码才能进入。
校验用 `HMAC-SHA256(SECRET, 随机值)`，纯前端、零依赖，**属于「轻门槛」而非强加密**——能拦住普通用户白嫖，但技术用户可从源码提取 SECRET 自造码。

### 1. 改 SECRET（分发前必做）
编辑 `js/activation.config.js`，把 `SECRET` 改成你自己的长随机串：
```js
const SECRET = '换成你自己的-至少32位-随机串-例如-xK9pQ2mZ8vL1nB4wR7tY3uC6s';
```
> 改完 SECRET 后，**必须用下面工具重新生成码**，旧码会全部失效。

### 2. 生成激活码
```bash
node tools/gen-codes.js 20          # 生成 20 个
node tools/gen-codes.js 10 AICY     # 生成 10 个，带备注前缀 AICY
```
把输出的码发给买家即可（一码可在任意设备激活，按「码」收费）。

### 3. 自己先用
你自己的实例也要激活一次：打开网址 → 输入你生成的某个码 → 之后本机记住，不再弹窗。
换设备 / 清缓存后重新输入一次即可。

---

## 四、你自己的数据永不离线（换电脑也不丢）

- **云端同步**：登录同一账号，手机/平板/电脑数据自动同步（Railway 同源 PostgreSQL）。
- **手动备份（双保险）**：设置页 → 「💾 数据备份与迁移」→
  - 「📤 导出全部数据」：把所有本地数据打包成一个 JSON 下载。
  - 「📥 导入备份」：换电脑 / 重装后选这个 JSON 恢复，刷新即回。
- 建议每隔一段时间导出一份 JSON 存网盘，万一服务异常也不怕。

---

## 五、目录结构（分销商须知）

```
teaching-workbench/
├─ index.html              # 入口
├─ manifest.json           # PWA 配置（名称/图标/全屏）
├─ sw.js                   # Service Worker（缓存/离线/可安装）
├─ icons/                  # App 图标 192 / 512
├─ css/  js/               # 前端代码
│  ├─ activation.config.js # ★ 改这里换 SECRET
│  └─ activation.js        # 激活码校验与拦截页
├─ sync-server/            # 后端：node server.js，含本地/PostgreSQL 存储
└─ tools/
   └─ gen-codes.js         # 激活码生成工具
```

## 六、换图标 / 改名（可选）
- 改图标：替换 `icons/icon-192.png` 与 `icon-512.png`（需为正方形 PNG）。
- 改应用名：改 `manifest.json` 的 `name` / `short_name` 与 `index.html` 的 `<title>`。
- 改主题色：改 `manifest.json` 的 `theme_color` / `background_color`。

---
© 教学工作台 · 轻付费分发版
