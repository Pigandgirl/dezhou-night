# 部署说明（TLS / 反向代理 / 发布）

## 1. 架构

```
Internet ──443──> Caddy/Nginx ──127.0.0.1:8080──> Node server.js
                                                    ├─ /api/*  + SSE
                                                    ├─ /play   单文件 Web 客户端
                                                    ├─ /admin  后台
                                                    └─ /download APK
```

Node 进程**只监听 0.0.0.0:8080**，生产环境应放在 TLS 反向代理之后。
`server/dezhounight.service` 已加 `TRUST_PROXY=1`，并且只信任来自本机代理的
`X-Forwarded-For`（`server/lib/rate-limit.js` 会校验来源地址）。

## 2. 证书与反向代理

Caddy（推荐，自动证书）：

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/poker.example.com/你的域名/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Nginx 示例见 `deploy/nginx.conf.example`，关键点是：

- `proxy_buffering off;`（SSE 必须）
- `proxy_read_timeout 3600s;`
- 传入 `X-Forwarded-For` / `X-Forwarded-Proto`

## 3. 环境变量

写入 `/opt/dezhounight/admin.env`（systemd 的 `EnvironmentFile`）：

```ini
ADMIN_USER=admin
ADMIN_PASSWORD=请换成随机强密码
PUBLIC_ORIGIN=https://你的域名
# 可选
TRUST_PROXY=1
MAX_ROOMS=600
MAX_SSE=2000
RL_REGISTER=20
RL_LOGIN_IP=40
RL_ROOM_CREATE=10
RL_ROOM_JOIN=120
RL_MATCH_JOIN=120
```

`PUBLIC_ORIGIN` 用于 `GET /api/app/latest` 生成 APK 下载地址。不设置时回退到
请求的 `Host` 头（仅建议本地开发）。

## 4. 构建 Web / Android 资源

Web（同源 API）：

```bash
npm run build
copy dist/index.html server/public/web/index.html
```

Android 资源（`file://` 页面必须写死 API 地址）：

```powershell
$env:UPDATE_BASE='https://你的域名'
npm run build
copy dist/index.html android/app/src/main/assets/index.html
Remove-Item Env:UPDATE_BASE
```

> 当前已生成 `android/DezhouNight-1.0.67.apk`（versionCode 68），使用
> `http://192.144.159.220:8080`；旧 ≤1.0.67 客户端需升级。生产 1.0.67 已于
> 2026-10-24 01:19 部署，`PUBLIC_ORIGIN` 固定为 `http://192.144.159.220:8080`。
> 配置 HTTPS/域名后，改用 `https://你的域名` 重新构建 APK，并更新 `PUBLIC_ORIGIN`。

## 5. 发布

```powershell
$env:DEPLOY_PASS='服务器密码'
python scripts/deploy_server.py
```

脚本会上传：

- `server/server.js`
- `server/lib/*.js`（**新增，必须上传，否则服务启动失败**）
- `server/public/web/index.html`
- `server/public/admin/index.html`
- `server/public/app/latest.json`
- `android/DezhouNight-<version>.apk` → `server/public/apk/`
- systemd unit

并重启服务、执行健康检查。

## 6. 旧 APK 兼容

旧 APK（≤1.0.14）仍请求 `http://192.144.159.220:8080`。迁移期有两种选择：

1. 继续开放 8080（旧 APK 可用），同时 443 提供新 Web；
2. 只开放 443，旧 APK 会失效，必须发布新 APK。

旧 APK 的账号 Token 仍可通过 query 参数访问 `/api/auth/me`；新客户端已改用
`Authorization: Bearer`，服务端保留 query 回退仅用于旧版本兼容。

## 7. 回滚

```bash
sudo systemctl stop dezhounight
# 1.0.67 部署前的备份（含 server.js/lib/public/data/admin.env/systemd unit）：
# /opt/dezhounight/backups/pre-1.0.67-20261024-203509.tgz
# 解压覆盖后重新 daemon-reload/restart
sudo systemctl start dezhounight
```

`data/store.json` 为全量 JSON，部署前建议备份：

```bash
sudo cp /opt/dezhounight/data/store.json /opt/dezhounight/data/store.json.bak
```
