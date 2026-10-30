# 德扑之夜 1.0.59 发布记录

- **发布日期**：2026-10-24 19:32（CST）
- **版本**：1.0.59（versionCode 60）
- **生产地址**：http://192.144.159.220:8080
- **状态**：已部署

## 筹码补充改为 1 小时

- 默认每 **60 分钟**补充一次；
- 每次补充 **100 筹码**；
- 不再是 6 小时；
- 离线期间按间隔累计，最多补到账户上限 100000。

实测：把用户 `chipsAt` 设为 3 小时前，首次登录补充：

```text
chips: 0 → 300
chipRefillMinutes: 60
chipGrant: 100
下次补充：60 分钟后
```

## 后台可调整

后台 `/admin` → **权限开关**：

新增两项：

- **筹码补充间隔（分钟）**：
  - 最小 1；
  - 最大 1440；
  - 默认 60；
- **每次补充筹码**：
  - 最小 1；
  - 最大 100000；
  - 默认 100。

保存后立即对所有用户生效。

接口验证：

```text
GET /api/admin/features
  chipRefillMinutes: 60
  chipGrant: 100

POST /api/admin/features
  chipRefillMinutes: 90
  chipGrant: 250

GET /api/auth/me
  chipRefillMinutes: 90
  chipGrant: 250
  下次补充：90 分钟后

GET /api/features
  chipRefillMinutes: 90
  chipGrant: 250
```

## 用户端提示同步

- 登录弹窗不再写死 6 小时；
- 账户资料显示当前间隔和补充数量；
- 快速匹配筹码不足提示读取后台配置；
- 在线牌局筹码用完提示读取后台配置；
- 排行榜说明读取后台配置。

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.59.apk` |
| 大小 | 321,429 字节 |
| SHA256 | `85C3C2B165C91BFC612C8AC2CB6E78B21AC4C066043F31A6B9D1D35D1B753492` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.59 / code 60；
- `/api/features` 返回 `chipRefillMinutes: 60, chipGrant: 100`；
- `/play` 200；
- `/admin` 200；
- systemd active。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.59-20261024-193258.tgz
sha256 03fef5e70bd66f310da36145e8b5804ea24aec093ed1d0fa6d0437195e24ad68
```
