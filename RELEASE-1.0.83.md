# 德扑之夜 1.0.83 发布记录

- **发布日期**：2026-10-25 11:15（CST）
- **版本**：1.0.83（versionCode 84）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 全服筹码重置

- 已停止服务、备份 store；
- 57 个玩家全部设置为 **100 筹码**；
- 全部 `chipsAt` 重置为当前时间；
- 后台补足目标设为 100，检测间隔 60 分钟；
- 服务重新启动。

验证：

```text
users = 57
chips 总和 = 5700
每个用户 chips = 100
```

## 新筹码规则

旧逻辑：

```text
每 1 小时，直接加 100 筹码
100 → 200 → 300 …
```

新逻辑：

```text
每 1 小时检测一次
如果当前筹码 < 100：补足到 100
如果当前筹码 >= 100：不发放
```

例子：

```text
0 → 100
37 → 100
99 → 100
100 → 100（不变）
180 → 180（不变）
```

- 不会叠加多个小时的赠送；
- 不会把 100 变成 200；
- 系统最多补到 100；
- 后台补足目标限制为 1–100；
- 服务端每 15 秒巡检一次，用户到点后按小时判定。

## 左下底牌面板遮挡操作

- 行动条打开时，底牌面板强制隐藏；
- 新增 CSS `:has()` 规则：只要操作条可见，底牌面板就不渲染；
- 新增 `MutationObserver`：操作条显示/隐藏时同步折叠底牌；
- 用户弃牌、过牌、跟注、加注、全下完成后，操作条关闭，底牌面板恢复；
- 手机横屏同样生效。

手机实测：

```text
actionbar class = actionbar
hud class = hero-action-open
cardViewer class = card-viewer turn-hidden
cardViewer display = none
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.83.apk` |
| 大小 | 1,275,797 字节 |
| SHA256 | `001D13BB596902566036103092294AB51FA6C3F8F9C12D350603594F899A6A30` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.83 / code 84；
- `/play` 200；
- `/admin` 200；
- features: `chipRefillMinutes=60`, `chipGrant=100`。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.83-20261025-111433.tgz
sha256 c610060d92ad2d51a511e634d85be54e072bc07d05290bee8c3038109918c3bd
```

筹码重置前 store 备份位于：

```text
/opt/dezhounight/backups/store-pre-chipreset-<timestamp>.json
```
