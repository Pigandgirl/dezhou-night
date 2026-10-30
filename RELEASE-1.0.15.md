# 德扑之夜 1.0.15 发布记录

- **发布日期**：2026-10-23 22:51（CST）
- **版本**：1.0.15（versionCode 16）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.15.apk` |
| 大小 | 292,757 字节 |
| SHA256 | `27BD82F638EA8504A00ACD527B811D6074803D2AA656681CA8AA94940D8BB062` |
| 签名 | v2 + v3 验证通过 |
| 包名 | `com.dezhounight.poker` |
| minSdk / targetSdk | 26 / 35 |
| 在线基址 | `http://192.144.159.220:8080` |

服务端同版本：`server/server.js`、`server/lib/*.js`、`server/public/web/index.html`、`server/public/admin/index.html`、`server/public/app/latest.json`。

## 本次内容

- 摊牌公开所有剩余玩家底牌、牌型、赢得筹码；公共牌可见。
- 准备时间统一 15 秒，删除 5 秒逻辑。
- 主页面显示在线人数（大厅/房间/观战）。
- 登录、退出、排行榜、规则、更新收进设置；主页面无账号条、无自动登录。
- 删除兑换码：客户端、`/api/redeem`、后台、`store.codes`。
- 大厅重做 + 移动端横竖屏适配。
- 服务端保留旧 APK query token 兼容。

## 线上验证

| 检查 | 结果 |
|---|---|
| `GET /api/health` | `ok:true`、`service:dezhounight`、8 个匹配房、uptime 正常 |
| `GET /api/app/latest` | `1.0.15`、versionCode 16、SHA256/大小与 APK 一致、下载 URL 正确 |
| `GET /play` | 200，包含 `1.0.15`、`onlineCount`、`gtShowdown`，无 `redeemModal` / `accountBar` |
| `GET /admin` | 200，无兑换码导航 |
| `GET /download/DezhouNight-1.0.15.apk` | 200，292,757 字节，SHA256 匹配 |
| systemd | `active`，22:51:49 重启完成，日志无异常 |

## 生产配置

- `PUBLIC_ORIGIN=http://192.144.159.220:8080`，下载地址不随 Host 变化。
- 管理员账号沿用原 `admin.env`，本次未重置。
- 当前仍是 HTTP；配置 HTTPS 后需同步更新 `PUBLIC_ORIGIN` 与 APK 的 `UPDATE_BASE`。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.15-20261023-225059.tgz
sha256 d38f5b78ac3eb10529268dbbd4aec85cc99f2e98e7d774e79ea546faee410d16
```

包含旧 `server.js`、`public/`、`data/`、`admin.env`、systemd unit。

## 回滚

```bash
sudo systemctl stop dezhounight
cd /opt/dezhounight
sudo tar xzf backups/pre-1.0.15-20261023-225059.tgz
sudo systemctl daemon-reload
sudo systemctl start dezhounight
```

## 注意

- 旧 1.0.14 客户端在线协议不兼容，必须升级到 1.0.15。
- 当前仍是 HTTP 8080；TLS/域名配置后需同步更新 `PUBLIC_ORIGIN` 与 APK 的 `UPDATE_BASE`。
