# 德扑之夜 1.0.90 发布记录

- **发布日期**：2026-10-25 14:22（CST）
- **版本**：1.0.90（versionCode 91）
- **生产地址**：http://192.144.159.220:8080

## 底牌常显

底牌面板固定在左上角标题右侧后，不再随以下状态隐藏：

- 玩家行动；
- 下注、跟注、过牌、加注、弃牌；
- 行动条显示；
- 本手结算。

保留了用户主动点击「收起」的手动折叠能力。

## 移除的隐藏逻辑

- `setCardViewerTurnHidden(true)` 的实际隐藏效果；
- `#hud.hero-action-open .card-viewer`；
- `#hud:has(#actionbar:not(.hidden)) .card-viewer`；
- `#hud.settle-open .card-viewer`；
- 行动条 MutationObserver 对底牌的折叠。

## 实测

手机 844×390：

```text
actionbar = 显示中
cardViewer class = card-viewer
display = flex
x=150, y=6
```

桌面 1200×540：

```text
display = flex
x=228, y=8
```

页面错误：无。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.90.apk` |
| 大小 | 1,283,989 字节 |
| SHA256 | `D2EF4F9C16BD82CD4CADE5057F7EF6FD07BF814509A3B72525174331507A2E61` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.90 / code 91；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.90-20261025-142229.tgz
sha256 2b8dba91701df3a996fdac18e001dc597dbd0ea1b74f76c088d71e978711d73f
```
