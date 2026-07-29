# 教培工作台 · 部署到公网（永久固定地址，无需 Cloudflare）

> 目标：把 `sync-server` 部署到长期在线的云平台，拿到**固定不变**的公网地址，
> 手机/平板在任何网络下都能同步。**不需要 Cloudflare 账号**，用 Railway 或 Render（任选其一，都免费）。

---

## 方式一：Railway（推荐，最简单）

1. 注册：打开 https://railway.app ，用 GitHub 账号登录（免费）。
2. 新建项目 →「Deploy from GitHub repo」→ 选中你存放本项目的 GitHub 仓库。
   - 若还没仓库：在本机 `sync-server/` 目录 `git init` 后推到 GitHub（`.gitignore` 已备好，不会传 `data/` 和 `cloudflared.exe`）。
3. 部署配置已就绪（`railway.json`）：`startCommand: node server.js`，监听 `PORT`（平台自动注入）。
4. 部署完成后，Railway 会分配一个**固定域名**，形如 `teaching-workbench-sync.up.railway.app`。
5. 在项目 Settings → Domains 可自定义/绑定自己的域名（可选）。

## 方式二：Render

1. 注册：打开 https://render.com ，用 GitHub 登录（免费）。
2. New → Web Service → 连 GitHub 仓库。
3. 配置（`render.yaml` 已备好）：runtime node、build `npm install`、start `node server.js`、`PORT=3000`、free 计划、healthCheck `/api/health`。
4. 部署完成后拿到固定地址，形如 `teaching-workbench-sync.onrender.com`。

---

## 方式三：你自己的云服务器（阿里云/腾讯云/任意 VPS）

1. 把整个 `sync-server/` 传到服务器（scp / git clone）。
2. 安装 Node.js（>=14）。
3. 运行：`cd sync-server && node server.js`（建议用 pm2 守护：`npm i -g pm2 && pm2 start server.js --name wb-sync`）。
4. 服务器安全组放行 `8080`（或你改的端口）。
5. 地址就是云服务器的固定公网 IP 或域名。

---

## 拿到地址后怎么用

1. 电脑、手机、平板都打开这个**固定公网地址**（如 `xxx.up.railway.app`）。
2. 右上角「☁️ 登录同步」→ 填**同一账号** → 数据自动跨设备同步。
3. 之前在本机 `localhost:8080` 存的数据，登录同一账号后会从云端拉取（注意：云上 `data/` 是独立的，首次登录需重新注册账号；若要迁移旧数据，把本机 `sync-server/data/` 拷到云实例同目录即可）。

> 注意：备案/域名绑定、HTTPS 证书等由云平台处理；Railway/Render 默认已带 HTTPS。

## 与"本机启动"的关系

- 本机 `启动工作台.bat` 仍可用于纯局域网/离线场景。
- 想要"任何网络都能同步"就用上面的公网地址；想切回本机，登录框「高级」里把服务器地址留空即可同源。
