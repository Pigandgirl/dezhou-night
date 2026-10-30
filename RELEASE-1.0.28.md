# 德扑之夜 1.0.28 发布记录

- **发布日期**：2026-10-24 02:19（CST）
- **版本**：1.0.28（versionCode 29）
- **生产地址**：http://192.144.159.220:8080
- **后台**：http://192.144.159.220:8080/admin
- **状态**：已部署并验证

## 在线游戏总开关

后台「权限开关」新增 **在线游戏总开关**：

- 一键关闭：
  - 在线快速匹配；
  - 好友房 / 局域网；
- 关闭后所有用户只能玩单机；
- 只阻止新进入，已经开局的牌局继续；
- 再次打开即恢复匹配和好友房；
- 仍保留两个单独开关，可分别控制；
- 开关持久化，重启后保持；
- 服务端强制校验，前端不能绕过。

## 管理员账号

- 后台：`/admin`
- 用户名：`admin`
- 密码在服务器 `admin.env` 中配置，不写入仓库；
- 已重置为可登录密码，并验证 `/api/admin/features` 可读。

## 客户端

- `/api/features` 返回 `onlineEnabled`、`matchEnabled`、`lanEnabled`；
- 客户端每 15 秒同步；
- 总开关关闭后：
  - 快速匹配按钮禁用，显示“在线匹配已关闭”；
  - 好友房创建/加入按钮禁用；
  - 单机牌桌保持可用。

## 验证

- 管理员 `{onlineEnabled:false}` → 公共 `/api/features` 三项全 false；
- 快速匹配 403；创建好友房 403；
- `{onlineEnabled:true}` 恢复三项 true；
- 生产环境已实测关闭再恢复；
- API 51/51，总回归 127/127；
- 后台权限页截图 `qa/out/admin-features.png`。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.28.apk` |
| 大小 | 300,949 字节 |
| SHA256 | `4F58BEDEEF34273ACDD938064E4F6EA3C2439F9DFD9FFF61D7ABF649E6816FA1` |
| 签名 | v2 + v3 通过 |
| 包名 | `com.dezhounight.poker` |

## 线上验证

| 检查 | 结果 |
|---|---|
| `GET /api/health` | ok，features 三项 |
| `GET /api/app/latest` | `1.0.28` / code 29 / SHA 一致 |
| `/admin` | 200，含 `featureOnline` 总开关 |
| `/play` | 200，1.0.28 |
| APK 下载 | 300,949 字节，SHA 匹配 |
| systemd | active，02:19 重启 |

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.28-20261024-021919.tgz
sha256 867d68b389fa0758859a6c9155413bf5651e99e3161d457fb3edfb5f8065165c
```

## 注意

- 仍为 HTTP 8080，未配置 TLS/域名；
- 管理员密码请上线后更换；
- 旧 1.0.27/… 客户端需升级到 1.0.28。
