# 德扑之夜 1.1.8 发布记录

- **发布日期**：2026-10-26 23:55（CST）
- **版本**：1.1.8（versionCode 114）
- **生产地址**：http://192.144.159.220:8080
- **性质**：好友房加入/等待入座/模型座位/播报队列综合修复

## 修复

### 加入进行中好友房

- 输入口令后立即显示加载层和进度；
- 有空位：显示“本手进行中 · 已为你保留座位”，结束后自动入座；
- 不再卡在大厅/等待界面。

### 名字与观战

- 等待玩家、观战者都进入右侧 roster；
- 显示“等待入座/观战”；
- 满员房观战不再是无名字的自由视角。

### 座位/模型

- 等待玩家不进入当前手，避免中途加入造成模型错位；
- 下一手 `state.seats` 与场景玩家数对齐；
- 6人桌为主角第一视角 + 5个对手模型。

### 播报

- FIFO 队列，不取消上一位；
- 空闲1.06，1/2/3/4/5+条为1.18/1.40/1.62/1.80/1.95；
- 称呼+操作+金额全部播完才下一位；
- 结算/成就文本入队，在线和单机结算都有播报。

## 10轮测试

```text
5轮好友房 + 5轮在线匹配
5人开局 → 第6人中途加入
10/10 通过
seatsBefore=5, seatsAfter=6
joinWaiting=true, spectator=false
```

完整输出：`docs/requirements/2026-10-26-friend-room-join-voice/evidence/10-rounds.txt`

## 实测边界

- 8人房第6人可入座；
- 5座位房第6人只能观战，右侧显示名字与“观战”；
- 入座后 stateSeats=6，scenePlayerCount=6，主角不生成额外模型（5个对手模型）。

## 构建

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.1.8.apk` |
| 大小 | 4,774,022 字节 |
| SHA256 | `9D457A0632CFA289504B653550BD8DDEB09644560096CCDD2C6E1765FCF6823F` |
| 签名 | v2 + v3 通过 |

## 部署

```text
/api/app/latest = 1.1.8 / 114
/play = 200
/admin = 200
API phrase = 200
APK HTTP = 200
```

## 备份

```text
/opt/dezhounight/backups/pre-1.1.8-20261026-235355.tgz
sha256 f771340844b21d0eb2ce97f282cd093777c8f1f9250a4091ccd91c0372509418
```

## 风险

- 真机连续快节奏听感未验证；
- 5座位房满员只能观战；
- 队列无上限；
- 服务端 TTS 首次约2秒。

## 链接

- 游戏：http://192.144.159.220:8080/play
- APK：http://192.144.159.220:8080/download/DezhouNight-1.1.8.apk
- 测试报告：docs/requirements/2026-10-26-friend-room-join-voice/03-测试报告.md
- 验收报告：docs/requirements/2026-10-26-friend-room-join-voice/04-验收报告.md
