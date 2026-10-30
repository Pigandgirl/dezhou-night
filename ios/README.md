# 德扑之夜 iOS 原生壳（WKWebView）

这是一个不依赖 CocoaPods 的纯 Swift WKWebView 壳，加载与网页/Android 相同的
`/play` 客户端。仓库内只保存 iOS 工程源文件，构建产物由 macOS CI 生成。

## 当前状态

| 项 | 值 |
|---|---|
| Bundle ID | `com.dezhounight.poker` |
| 最低系统 | iOS 15.0 |
| 方向 | 横屏（iPhone / iPad） |
| 加载地址 | `DZ_APP_URL`，默认 `http://192.144.159.220:8080/play` |
| 签名 | 未签名构建，需要 Sideloadly/AltStore/开发者证书签名后安装 |

> **重要**：当前生产地址是 HTTP。iOS 的麦克风（房间语音）要求 HTTPS 安全上下文，
> 因此原生壳在切换 HTTPS 之前只能登录、匹配、单机、文字/播报，不能语音。
> 把 `project.yml` 里的 `DZ_APP_URL` 改成 HTTPS 域名，并删除 Info.plist 里的
> `NSAllowsArbitraryLoads`，即可解除限制。

## 本机构建（macOS）

```bash
brew install xcodegen
cd ios
xcodegen generate
xcodebuild -project DezhouNight.xcodeproj \
  -scheme DezhouNight \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath ../build/DezhouNight.xcarchive \
  archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO
```

生成未签名 IPA：

```bash
mkdir -p ../build/Payload
cp -R ../build/DezhouNight.xcarchive/Products/Applications/DezhouNight.app ../build/Payload/
cd ../build && zip -qry DezhouNight-unsigned.ipa Payload
```

## 在 iPhone 上安装（无开发者账号）

1. Windows/macOS 安装 [Sideloadly](https://sideloadly.io/)（Windows 还需要 iTunes/Apple Devices）；
2. 用数据线连接 iPhone，信任电脑；
3. 把 `DezhouNight-unsigned.ipa` 拖进 Sideloadly，填 Apple ID，开始签名；
4. iPhone 设置 → 通用 → VPN 与设备管理 → 信任该开发者；
5. 免费 Apple ID 签名的 App 7 天后过期，重新签一次即可。

App Store / TestFlight 需要 Apple Developer Program（每年 99 美元）：
在 CI 里配置证书和 Provisioning Profile 后，用 `ExportOptions.plist` 导出
`app-store-connect` 包，再上传 TestFlight。

## CI（GitHub Actions）

工程同步在私有构建仓库 `dezhounight-ios`。工作流 `iOS Build` 会：

- 用 XcodeGen 生成 `.xcodeproj`；
- 构建未签名 device archive 并打包 `.ipa`；
- 在 iOS 模拟器安装并截图（artifact `DezhouNight-ios-simulator/ios-simulator.png`）；
- 可选：如果配置了签名 Secrets，额外导出已签名 IPA。

触发方式：推送到 `main` 或 `workflow_dispatch`。

## 已知限制（不是 bug）

- 这是 WebView 壳，App Store 审核可能按 4.2（最低功能）要求补充原生能力；
- 远程加载的页面无法离线打开，断网时会显示原生重试页；
- 真机麦克风/音频路由未在本机验证，需要 iPhone 实机；
- 方向锁定横屏，和游戏内“建议横屏”的设计一致。
