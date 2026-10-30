# 德扑之夜 1.0.17 发布记录

- **发布日期**：2026-10-23 23:28（CST）
- **版本**：1.0.17（versionCode 18）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 本次重点

### 完整结算列表

摊牌/结算不再只说“谁赢了”，而是按牌力从大到小列出**所有剩余玩家**：

- 排名 `#1 / #2 ...`，赢家「赢」标记；
- 每位玩家的**底牌 2 张**、**最佳五张**、牌型细节（如「两对 7/3，K 踢脚」）；
- 赢家赢多少，输家为什么输：
  - 「两对 7/3，K 踢脚，为全场最大牌型，赢得底池」；
  - 「两对 7/3，K 踢脚 大于 一对 7，A 踢脚」；
  - 同牌型时说明「同为两对，A 大于 Q」；
  - 并列时说明「牌型相同，与并列赢家平分底池」；
- 公共牌单独一行展示；
- 底部列出已弃牌玩家；
- **弃牌获胜也公开赢家底牌**：标题「本手结束 · 弃牌获胜」，显示赢家底牌 +「未摊牌（其余玩家弃牌）」。

### 移动端结算布局

- 1.0.16 的移动端结算卡片错位/裁切已修复；
- 844×390 横屏下两行玩家完整可见，卡片、牌型、原因、金额都在面板内；
- 390×844 竖屏自适应。

![在线结算列表](qa/out/online-settle.png)

![弃牌获胜也公开赢家底牌](qa/out/fold-settle.png)

![移动端结算](qa/out/lobby-mobile-settle.png)

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.17.apk` |
| 大小 | 292,757 字节 |
| SHA256 | `21DA52E5DC0DE934F3259872D61D63DCDF12F4099DBC5189759AA37C563AA417` |
| 签名 | v2 + v3 验证通过，证书与 1.0.16 一致 |
| 包名 | `com.dezhounight.poker` |
| minSdk / targetSdk | 26 / 35 |
| 在线基址 | `http://192.144.159.220:8080` |

服务端同版本：`server/server.js`、`server/lib/*.js`、`server/public/web/index.html`、`server/public/admin/index.html`、`server/public/app/latest.json`。

## 线上验证

| 检查 | 结果 |
|---|---|
| `GET /api/health` | `ok:true`、`service:dezhounight`、8 个匹配房、uptime 正常 |
| `GET /api/app/latest` | `1.0.17`、versionCode 18、SHA256/大小与 APK 一致、下载 URL 正确 |
| `GET /play` | 200，包含 `1.0.17`、`gtShowdownTitle`、`onlineCount`，无 `redeemModal` |
| `GET /admin` | 200，无兑换码导航 |
| `GET /download/DezhouNight-1.0.17.apk` | 200，292,757 字节，SHA256 匹配 |
| systemd | `active`，23:28 重启完成，日志无异常 |

## 回归

- `qa/engine-test.mjs` **10/10**：结算列表字段、弃牌获胜底牌、最佳五张、输赢原因、边池；
- `qa/run-integration.mjs` **15/15**；
- `qa/run-api.mjs` **48/48**；
- `qa/run-online-browser.mjs`：两浏览器结算 2 行、底牌/最佳五张/原因齐全；弃牌 UI 赢家底牌 2 张、未摊牌提示；
- `qa/shot-mobile.mjs`：844×390 结算面板两行完整可见，无溢出；
- 合计 **120/120**。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.17-20261023-232835.tgz
sha256 511916ce643ae49ec924a87809bdabde1b89ff2c48137d893d5b14c9277e121f
```

包含旧 `server.js`、`lib/`、`public/`、`data/`、`admin.env`、systemd unit。

## 回滚

```bash
sudo systemctl stop dezhounight
cd /opt/dezhounight
sudo tar xzf backups/pre-1.0.17-20261023-232835.tgz
sudo systemctl daemon-reload
sudo systemctl start dezhounight
```

## 注意

- 当前仍是 **HTTP 8080**，没有域名/TLS；配置 HTTPS 后需把 `PUBLIC_ORIGIN` 改为 `https://域名`，并用 `UPDATE_BASE=https://域名` 重新构建 APK。
- 旧 1.0.16/1.0.15/1.0.14 客户端在线协议不兼容，需升级到 1.0.17。
- 管理员账号沿用原 `admin.env`，本次未重置。
