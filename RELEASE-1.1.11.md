# 德扑之夜 1.1.11 发布记录

- **发布日期**：2026-10-27 18:36（CST）
- **版本**：1.1.11（versionCode 117）
- **生产地址**：http://192.144.159.220:8080
- **性质**：删除播报加速、恢复原速、裁掉称呼静音、名称后立即接操作

## 修复

- 删除队列1.8/2.1/2.3/2.5倍加速；
- `playBuffer` 固定 `playbackRate=1`；
- 不再实时改变当前音频速率；
- 新增首尾静音裁剪：
  - 阈值0.006；
  - 保留15ms开头/45ms结尾；
- 称呼音频结束后立即播操作，无 `setTimeout`；
- 保留队列顺序、结算切断、音效逻辑。

## 单机 AI 实测

```text
阿凯名称：
  rate=1
  raw=1.368s
  trimStart=0.196s
  played=0.578s
  end=7942ms

en_call,en_two：
  start=7942ms
  end=8793ms

间隔=0ms
pageerror=0
```

完整日志：`docs/requirements/2026-10-27-voice-original-trim/evidence/ai-voice-gap.json`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.11.apk` |
| 大小 | 4,782,214 字节 |
| SHA256 | `A1216BCCF83670BB60C9990F4B4D879BD0E4D86AF49932597E25B75188EEC835` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.11 / 117
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.11-20261027-183425.tgz
sha256 d5c62b2a26849b6333627aab12898dea2e3e3195f897b544fee22365332b8923
```

## 风险

- 真机扬声器听感未验证；
- 原速下较长金额播报可能超过1.5s；
- 静音裁剪保留45ms尾部，个别短音可能受阈值影响；
- 服务端TTS首次生成仍有网络耗时。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.11.apk
- 测试报告：docs/requirements/2026-10-27-voice-original-trim/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-voice-original-trim/04-验收报告.md
