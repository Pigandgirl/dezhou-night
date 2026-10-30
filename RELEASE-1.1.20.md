# 德扑之夜 1.1.20 发布记录

- **发布日期**：2026-10-28 08:06（CST）
- **版本**：1.1.20（versionCode 127）
- **生产地址**：http://192.144.159.220:8080
- **性质**：固定8座位、第三人/后续加入不重排；语音取消5秒限制

## 固定座位

分配顺序（1-based）：

```text
第1人→1号位，第2人→5号位
第3人→2号位，第4人→3号位，第5人→4号位
第6人→6号位，第7人→7号位，第8人→8号位
```

内部seatNo：`0,4,1,2,3,5,6,7`。

- 已入座玩家seatNo不被新人改变；
- 新人只占空位；
- 当前手进行中加入仍等待下一手；
- 3/4人桌默认自动拉远，避免对手在镜头背后。

## 语音

- 移除客户端5秒自动闭麦；
- 移除服务端5秒占用过期；
- 点击麦克风持续说话，再点关闭；
- 关闭只提示“语音已关闭”；
- 不再弹出5秒限制大段提示；
- 同一时间仍只允许一个说话人；
- 关闭时发送leave释放说话人。

## 实测

```text
2人 seatNo=[0,4]
第三人 waiting=true，当前手不重排
下一手 seatNo=[0,4,1]
scene.rigs=2 visible=[true,true]
3人默认 userZoom=1.55
pageerror=0
```

截图：`docs/requirements/2026-10-28-fixed-seats-continuous-voice/evidence/fixed-seats-third.png`

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.20.apk` |
| 大小 | 4,786,310 字节 |
| SHA256 | `AD6C40A207D01CF48DF273E7D7D29332CF489ACCED9BBE09DEC2E530BD416422` |
| versionCode | 127 |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.20 / 127
/play = 200
/admin = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.20-20261028-080426.tgz
sha256 4c95247fcd09cb76b8a22282dcd6c50ce380a0292962f38684fb99c123575ce9
```

## 风险/未验证

- 4/5人未逐人截图；
- 真机持续语音未实测；
- 双客户端语音并发未实测；
- 低端机模型性能未测。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.20.apk
- 测试报告：docs/requirements/2026-10-28-fixed-seats-continuous-voice/03-测试报告.md
- 验收报告：docs/requirements/2026-10-28-fixed-seats-continuous-voice/04-验收报告.md
