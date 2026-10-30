# 德扑之夜 1.1.15 发布记录

- **发布日期**：2026-10-27 20:32（CST）
- **版本**：1.1.15（versionCode 122）
- **生产地址**：http://192.144.159.220:8080
- **性质**：语音播报去掉数字，只保留称呼+操作

## 修复

- 动作播报不再追加下注/跟注/加注/全下金额；
- 只播放动作音，不再拼接数字音；
- 文字兜底也不念数字；
- 在线/单机结算去掉底池金额；
- 保持1.0倍速、原音色；
- 称呼结束立即接操作。

界面上的筹码、下注金额、底池数字保持不变，只改变语音。

## 实测

```text
speak('raise', 20, '阿凯')
动作音频 buffers = 1
rate = 1
名称结束/操作开始间隔 = 0ms
pageerror = 0
```

证据：`docs/requirements/2026-10-27-voice-no-numbers/evidence/no-number.txt`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.15.apk` |
| 大小 | 4,782,214 字节 |
| SHA256 | `B6221B1034B31927843AF8588B771403AEED7BE61DD930B9A5E28957D5D6BE3D` |
| versionCode | 122 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.15 / 122
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.15-20261027-203008.tgz
sha256 d73387cd3ac2a4225883d29dc3d7510d07216e1461e8eaa528eb3f1628079963
```

## 风险/边界

- 真机听感未验证；
- 成就等系统播报仍可能包含数字；
- 语音不再报金额，需要看界面金额。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.15.apk
- 测试报告：docs/requirements/2026-10-27-voice-no-numbers/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-voice-no-numbers/04-验收报告.md
