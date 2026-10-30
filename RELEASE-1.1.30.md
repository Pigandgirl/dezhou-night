# 德扑之夜 1.1.30 发布记录

- **发布日期**：2026-10-29 08:16（CST）
- **版本**：1.1.30（versionCode 137）
- **生产地址**：http://192.144.159.220:8080
- **性质**：发言状态移入右侧在线名单

## 变更

- 移除顶部“昵称正在发言”横条，避免多人发言撑满顶部；
- 右侧“在线”入口显示在线人数；
- 有人发言时入口显示发言人数（如 ●3）；
- 点开在线入口显示三列：玩家 / 状态 / 发言；
- 状态：已准备、未准备、游玩中、观战中、等待入座、离线；
- 发言列显示“发言中”，支持多人；
- 面板固定宽268px，昵称超长省略；手机宽238px。

## 实测

```text
在线 5
● 3
玩家1（你） 游玩中 发言中
玩家2       游玩中 发言中
玩家3       游玩中 发言中
玩家4       游玩中
玩家5       游玩中
顶部发言横条不存在
pageerror=0
```

截图：`docs/requirements/2026-10-29-roster-speaking-panel/evidence/roster-multi-speaking.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.30.apk` |
| 大小 | 4,790,406 字节 |
| SHA256 | `0A8DCA103BB7D04ABFBDC2A089DAD862D54C395CE26C8DFA1CFE1821F2CD4EBF` |
| versionCode | 137 |

## 部署

```text
/api/app/latest = 1.1.30 / 137
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.30-20261029-081504.tgz
sha256 ab3025c83903658bcfd58c5e3a2540d0f465f08f3f56b6bbf8d555024906173f
```

## 风险

- 未真机8人面板；
- 未测超长昵称；
- 面板与房间设置同时打开未测；
- 发言状态静音约1秒后清除。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.30.apk
- 测试报告：docs/requirements/2026-10-29-roster-speaking-panel/03-测试报告.md
- 验收报告：docs/requirements/2026-10-29-roster-speaking-panel/04-验收报告.md
