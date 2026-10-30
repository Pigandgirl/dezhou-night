# 德扑之夜 1.1.18 发布记录

- **发布日期**：2026-10-27 20:58（CST）
- **版本**：1.1.18（versionCode 125）
- **生产地址**：http://192.144.159.220:8080
- **性质**：房间语音单次说话时长 4秒 → 5秒

## 修改

- 客户端 `beginTalkLimit`：4000ms → 5000ms；
- 自动闭麦提示改为“单次最长5秒”；
- 服务端 `voiceClaim` 单说话人窗口：4000ms → 5000ms。

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.18.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `0A7CB6A1C4D64932C835DE52C6C4E16366ED3DDE8B2AED892FC2787CDB413570` |
| versionCode | 125 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.18 / 125
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.18-20261027-205708.tgz
sha256 461416370efefe7514e2130b4817a94ad722a4991574f3b093c6698b84ae66e5
```

## 风险

- 真机5秒计时未实测；
- 双客户端单说话人窗口未实测。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.18.apk
- 测试报告：docs/requirements/2026-10-27-voice-5s/03-测试报告.md
- 验收报告：docs/requirements/2026-10-27-voice-5s/04-验收报告.md
