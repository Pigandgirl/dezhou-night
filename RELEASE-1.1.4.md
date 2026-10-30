# 德扑之夜 1.1.4 发布记录

- **发布日期**：2026-10-26 20:47（CST）
- **版本**：1.1.4（versionCode 110）
- **生产地址**：http://192.144.159.220:8080
- **性质**：播报先读玩家称呼；单机主角使用账号昵称

## 修复

之前播报只有动作/金额，现在：

```text
阿凯 加注 150
小明 过牌
单机阿凯 跟注 20
```

实现：

- 先读称呼：当前音色的 TTS；
- 再读动作+金额：当前选择的离线音色包；
- 称呼等待 `380ms + 每字190ms`，最长1900ms；
- 新动作取消上一动作待播计时，避免叠音；
- 单机主角使用登录账号昵称，不再固定读“你”；
- 无账号昵称时回退角色名；
- 称呼最多12字。

## 实测

本地：

```text
speak('raise',150,'阿凯')
speak('check',0,'小明')
names = ['阿凯','小明']
keys = [['raise','one','hundred','five','ten'], ['check']]
单机 playerName = 单机阿凯
```

生产 `/play`：

```text
names = ['阿凯']
keys = [['raise','one','hundred','five','ten']]
version = 1.1.4
pageerror = 0
```

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.4.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `A4DFA96CC7B61292D1FB35F7EF1CC14470DF4551C1C63A4F9F7E755C7A83B714` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.4 / 110
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.4-20261026-204610.tgz
sha256 ad92c052051de62bd77d10b13a6e926ea75dd43e1379f05d25e5f0c6066f4fb8
```

## 风险

- 称呼 TTS 与离线动作包是不同引擎，音色可能仍有轻微差异；
- 长名字的等待时间按字数估算；
- 真机连续动作听感未测试。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.4.apk
- 测试报告：docs/requirements/2026-10-26-voice-name-fix/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-voice-name-fix/04-验收报告.md
