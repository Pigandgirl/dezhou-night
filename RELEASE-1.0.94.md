# 德扑之夜 1.0.94 发布记录

- **发布日期**：2026-10-25 15:57（CST）
- **版本**：1.0.94（versionCode 95）
- **生产地址**：http://192.144.159.220:8080

## admin 主账号打通后台

使用游戏账号 `admin` 登录主页面后：

- 右上角出现「后台管理」按钮；
- 无需再次输入管理员密码；
- 点击使用 admin 游戏 token 自动进入后台；
- 普通账号不显示按钮，后台 API 返回401。

## 主页面入口

```text
[ONLINE 1] [🛡 后台管理] [设置]
```

打开地址：

```text
http://.../admin#token=<gameToken>
```

后台页面读取 fragment token 后立即清空 hash，不需要二次登录。

## 后台概览

新增并展示：

- 注册用户；
- 在线玩家；
- 观战人数；
- 进行中游戏；
- 在线房间；
- 服务器连接数；
- 服务器内存；
- 服务器运行时间；
- 累计对局/历史记录。

概览和房间数据每5秒自动刷新，页面隐藏时暂停请求。

## 保留的后台功能

- 用户管理：搜索、编辑昵称/积分/筹码/密码；
- 对局记录；
- 房间管理/关闭；
- 权限开关：
  - 在线游戏总开关；
  - 在线快速匹配；
  - 好友房/局域网；
  - 筹码补充间隔与补足目标。

新增「返回游戏」按钮；「退出后台」只清理后台会话。

## 鉴权

`/api/admin/*` 现在接受：

1. 原管理员登录 token；
2. `ADMIN_USER` 对应的游戏账号 Bearer token。

普通游戏账号 token 仍然返回401。

## 实测

```text
admin 登录：isAdmin=true，后台按钮显示
普通账号：后台按钮隐藏
点击 URL：/admin#token=...
后台自动登录：loginView hidden，appView visible
6秒内 overview 请求：2次（5秒刷新）
admin game token：200
normal game token：401
```

## 构建产物

| 项目 | 值 |
|---|---|
| APK | `android/DezhouNight-1.0.94.apk` |
| 大小 | 2,011,909 字节 |
| SHA256 | `6DE246494301FA51C04B3E70455DF9ACA1076FF642BCE2C39CE55C6FAF1A8312` |
| 签名 | v2 + v3 通过 |

## 线上

- `/api/app/latest` = 1.0.94 / code 95；
- `/play` 200；
- `/admin` 200。

## 部署前备份

```text
/opt/dezhounight/backups/pre-1.0.94-20261025-155637.tgz
sha256 2d86a9d1387aca0fee23d4e1e21e6d4442d7c08c9aeb775eb425596195f87e75
```
