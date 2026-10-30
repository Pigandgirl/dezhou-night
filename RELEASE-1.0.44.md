# 德扑之夜 1.0.44 发布记录

- **发布日期**：2026-10-24 14:30（CST）
- **版本**：1.0.44（versionCode 45）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署并验证

## 好友房间简化

### 点击「好友房间」直接看到正在等待的房间

- 不需要先点「加入房间」；
- 不需要手动输入 3 位房间号；
- 不需要单独输入昵称；
- 房间列表展示：
  - 房间名；
  - 房间号（仅展示，方便分享）；
  - 当前人数 / 总座位；
  - 是否可加入。

### 点击房间直接加入

点击一个房间后只弹出一个输入框：

- 输入 3 位口令；
- 点「加入房间」。

昵称自动使用当前账号昵称，服务端也使用账户昵称，不再接受客户端昵称覆盖。

例如：

- 房主甲创建「周末好友局」；
- 加入者乙点击房间，只输入口令；
- 房间内显示「房主甲」「加入者乙」。

### 创建房间

- 创建时房主昵称同样自动使用当前账号；
- 仍保留房间名、口令、人数、初始筹码、盲注、输家观战；
- 不再要求输入玩家昵称。

## 服务端

新增：

```text
GET /api/rooms/open
```

返回当前未开局、非匹配房的好友房间：

- code
- name
- seats
- players
- online
- joinable
- hasPassword

不返回口令。

加入接口仍为：

```text
POST /api/rooms/:code/join
```

客户端不再传昵称，服务端使用账户 `user.name`。

## 验证

自动化测试：

```text
create 201 348
open [{ code:'348', name:'好友测试房', players:1, joinable:true }]
ui cards: 好友测试房 / 房间348 · 1/8人 / 输入口令加入
joinCode: false
joinName: false
modal fields: ['joinRoomPass']
joined: { room:'348', mode:'guest', players:['房主甲','加入者乙'] }
```

- 房间列表不再出现房间号/昵称输入框；
- 点击房间只显示口令框；
- 加入后房间内昵称正确；
- 生产接口 `/api/rooms/open` 返回 200。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.44.apk` |
| 大小 | 313,237 字节 |
| SHA256 | `79E744C1371AAB5F0ACA01F2CF9B585311E710D1CA9D52E91F4E25E75515875B` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.44 / code 45；
- `/api/rooms/open` 200；
- `/play` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.44-20261024-143048.tgz
sha256 f0e64eec08093f13b6287f0c6b3a3f23af3febe0e0354c2a0132067fe3c61f59
```
