# 德扑之夜 1.1.3 发布记录

- **发布日期**：2026-10-26 20:45（CST）
- **版本**：1.1.3（versionCode 109）
- **生产地址**：http://192.144.159.220:8080
- **性质**：播报增加玩家称呼

## 修复

之前动作播报只有“加注 150”。现在：

```text
阿凯 加注 150
小明 过牌
```

实现：

- 先读称呼：使用当前音色的 TTS；
- 再读动作+金额：使用当前选择的离线音色包；
- 称呼等待 `380ms + 每字190ms`，最长1900ms；
- 新动作到来时取消上一动作待播计时，避免叠音；
- 无称呼时直接播动作；
- 称呼最多12字。

## 实测

本地：

```text
speak('raise',150,'阿凯')
speak('check',0,'小明')
names = ['阿凯','小明']
keys = [['raise','one','hundred','five','ten'], ['check']]
```

生产 `/play`：

```text
names = ['阿凯']
keys = [['raise','one','hundred','five','ten']]
version = 1.1.3
pageerror = 0
```

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.3.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `158BFB12A12E854D62A170D2D10361294DC7BD26B1D1136709C59E1411CFFCB6` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.3 / 109
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.3-20261026-204319.tgz
sha256 9f77b58781e9aa3fd4f416631bc5d5a5bb7ba599afa6ca3b7070c88786a1d25c
```

## 风险

- 称呼 TTS 与动作离线音色包是不同引擎，音色可能不是完全同一人；
- 长名字等待时间按字数估算，可能与实际朗读长度有差异；
- 单机主角仍读“你”；
- 真机连续动作听感未测试。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.3.apk
- 测试报告：docs/requirements/2026-10-26-voice-name-fix/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-voice-name-fix/04-验收报告.md
