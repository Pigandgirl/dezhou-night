# 德扑之夜 1.0.89 发布记录

- **发布日期**：2026-10-25 14:02（CST）
- **版本**：1.0.89（versionCode 90）
- **生产地址**：http://192.144.159.220:8080

## 异步准备卡房修复

### 活跃候选

结算后的准备集合只包含：

- 仍在房间；
- 在线；
- 未观战；
- 有资格继续下一手。

已退出、离线玩家立即从候选和准备总数移除。

### 15 秒倒计时

```text
NEXT_HAND_MS = 15000
```

- 全部活跃玩家准备 → 立即开始；
- 未全员准备 → 15 秒后自动开始；
- 在线人数不足 2 人 → 15 秒后结束，不再无限等待。

结算页显示：

```text
已准备 2/4 · 下一手 15s
```

### 5 人局退出 1 人

实测候选：

```text
p1,p2,p3,p4
ready=4
checkNextReady={started:true}
```

剩下 4 人全部准备即可开始，不再等已退出的人。

### 第 6 人中途加入

5 人正在玩，第 6 人加入等待下一手：

```text
candidates=q1,q2,q3,q4,q5,q6
ready=6
total=6
```

第 6 人自动标记 `waitingNext=true`，计入 6 人准备；当前 5 人准备后 6/6 立即开始。下一手开始后自动清除等待标记。

### 离线/离开

- SSE 离线立即触发候选重算；
- 离开房间从 `room.players` 移除并重算；
- 下一手只带入在线活跃玩家；
- 不再把离线已准备玩家带回牌桌。

## 实测

```text
5→4: candidates p1,p2,p3,p4, ready4, started=true
5+第6人: candidates q1-q6, ready6,total6
NEXT_HAND_MS=15000
UI: 已准备 2/4 · 下一手 15s
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.89.apk` |
| 大小 | 1,283,989 字节 |
| SHA256 | `8853D8BE6C9500879A4F980DDC189E023331BC476CE4A906001A970BCEA2C54F` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.89 / code 90；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.89-20261025-140232.tgz
sha256 5d7b7f173ad95cb8d0389f2fad567dbb3647b0e2b20afa46dfe6c84ffec13d91
```
