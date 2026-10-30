# TestFlight 发布手册（德扑之夜 iOS）

TestFlight 是 Apple 的测试分发渠道：构建上传到 App Store Connect 后，
测试者安装 TestFlight App，接受邀请即可安装。**每个构建只有 90 天有效期**，
过期后需要重新上传；测试者不会看到 App Store 公开页面。

## 0. 先确认

| 项目 | 要求 |
| --- | --- |
| Apple Developer Program | 已付费加入（个人/公司均可），拿到 Team ID |
| App Store Connect | 能登录，角色为 App Manager 或 Admin |
| Bundle ID | 默认 `com.dezhounight.poker`，必须与 App Store Connect 的 App 记录一致 |
| HTTPS 入口 | **必须是 https://**；WKWebView 里 `getUserMedia`（房间语音）要求安全上下文 |
| Mac / CI | 本仓库用 GitHub Actions `macos-14`；本地需要 macOS + Xcode 15.4+ |
| 构建有效期 | TestFlight 构建 90 天；到期前重新上传 |

> 只用 HTTP 也能装 App 和玩单机，但 iOS 不会给 `getUserMedia` 麦克风权限，
> 房间语音不可用。TestFlight 构建请使用稳定 HTTPS 域名，不要用临时隧道。

## 1. App Store Connect 建 App 记录

1. App Store Connect → My Apps → `+` → New App；
2. Platform: iOS；Name: `德扑之夜`（App Store 全局唯一，被占用就换一个）；
3. Primary Language: Chinese (Simplified)；
4. Bundle ID: 选择/创建 `com.dezhounight.poker`；
5. SKU: 例如 `dezhounight-ios-001`；
6. User Access: Full Access。

创建后记下 **Apple ID（数字）**，上传构建时 App Store Connect 会自动匹配 Bundle ID。

## 2. 准备签名材料

在 Apple Developer → Certificates, Identifiers & Profiles：

1. **App ID**：`com.dezhounight.poker`，勾选需要的 capability（麦克风不需要 entitlement，
   但 WebView 需要 `NSMicrophoneUsageDescription`，已在工程里）。
2. **Distribution Certificate**：Apple Distribution，导出 `.p12` 并设置密码。
3. **Provisioning Profile**：Distribution → App Store → 选 App ID 和证书 → 下载
   `.mobileprovision`。记下 profile 的 **Name**（不是文件名）。

在 App Store Connect → Users and Access → Integrations → **App Store Connect API**：

1. 生成 Team Key，Role 选 **App Manager**（或 Admin）；
2. 记下 **Key ID** 和 **Issuer ID**；
3. 下载 `AuthKey_XXXXXXXXXX.p8`（只能下载一次）。

## 3. 配置 GitHub Secrets / Variables

仓库：`Pigandgirl/dezhounight-ios`（私有）→ Settings → Secrets and variables → Actions。

**Secrets：**

| 名称 | 内容 |
| --- | --- |
| `IOS_DIST_CERT_P12_BASE64` | `base64 -i dist.p12` 的整段输出 |
| `IOS_DIST_CERT_PASSWORD` | 导出 `.p12` 时设置的密码 |
| `IOS_APPSTORE_PROFILE_BASE64` | `base64 -i appstore.mobileprovision` 的整段输出 |
| `APPSTORE_KEY_ID` | API Key ID（10 位） |
| `APPSTORE_ISSUER_ID` | Issuer ID（UUID 形式） |
| `APPSTORE_PRIVATE_KEY` | `AuthKey_XXXXXXXXXX.p8` 的完整文本（含 BEGIN/END） |

**Variables：**

| 名称 | 示例 |
| --- | --- |
| `IOS_TEAM_ID` | `ABCDE12345` |
| `IOS_BUNDLE_ID` | `com.dezhounight.poker` |
| `IOS_PROFILE_SPECIFIER` | App Store profile 的 Name，例如 `DezhouNight AppStore` |

macOS 下生成 base64：

```bash
base64 -i dist.p12 | pbcopy
base64 -i appstore.mobileprovision | pbcopy
cat AuthKey_XXXXXXXXXX.p8 | pbcopy
```

> 不要把 `.p8`、`.p12`、密码提交到仓库或发到聊天里；只放 GitHub Secrets。

## 4. 运行上传

GitHub → Actions → **iOS TestFlight Upload** → Run workflow：

- `app_url`：稳定的 HTTPS 地址，例如 `https://game.example.com/play`；
- `build_number`：留空则用当前 Unix 时间戳（每次必须比上次大）。

工作流会：

1. 检查 secrets 和 HTTPS；
2. XcodeGen 生成工程；
3. 用 Distribution 证书 + App Store profile 手动签名 archive；
4. 导出 `app-store-connect` IPA；
5. 用 App Store Connect API Key 调 `xcrun altool --upload-app` 上传；
6. 把 IPA/ExportOptions 保存为 artifact（7 天）。

上传成功后 App Store Connect → TestFlight 会出现构建，状态
`Processing` → `Ready to Submit`/可测试。处理通常 10–30 分钟。

## 5. 添加测试者

### 内部测试（推荐先做，不需 Beta App Review）

1. App Store Connect → Users and Access → 添加测试者 Apple ID，角色
   `Developer`/`App Manager`（需要接受邀请）；
2. TestFlight → Internal Testing → 新建组 → 选构建 → 添加内部测试者；
3. 测试者收到 TestFlight 邀请邮件，安装 TestFlight 后接受；
4. 内部测试最多 100 人，构建 90 天有效。

### 外部测试（需要 Beta App Review）

1. TestFlight → External Testing → 新建组 → 添加构建；
2. 填写 Beta App Description、测试说明、联系信息、隐私政策 URL；
3. 提交 Beta App Review；通过后测试者可通过邀请或 Public Link 安装；
4. 外部测试最多 10,000 人，构建 90 天有效。

> 这是 WKWebView 壳，App Store 审核可能按 **4.2 Minimum Functionality**
> 要求补充原生能力。内部 TestFlight 不经过 Beta App Review；外部测试会审核，
> 风险更高。若只给同事/朋友测试，优先用内部测试。

## 6. 审核/合规注意

- **HTTPS**：TestFlight 构建必须用 HTTPS；`Info.plist` 里的
  `NSAllowsArbitraryLoads` 只保留给 HTTP 调试，正式提交前应删除。
- **麦克风**：`NSMicrophoneUsageDescription` 已写；`WKUIDelegate`
  已实现 `requestMediaCapturePermissionFor` 并只对当前 host 授权。
- **隐私政策 / 支持 URL**：外部 TestFlight 和 App Store 需要；请准备可访问页面。
- **出口合规**：工程已设 `ITSAppUsesNonExemptEncryption=false`；App Store Connect
  里按实际选择。
- **年龄分级**：扑克/模拟赌博内容，按 App Store Connect 问卷如实填写。
- **4.2**：纯 WebView 壳可能被拒；内部测试不受影响。若要上架，建议加入原生能力
  （推送、原生分享、触感、离线缓存等）并说明。

## 7. 常见错误

| 现象 | 处理 |
| --- | --- |
| `Missing repository secret ...` | 按第 3 节补 Secrets/Variables |
| `app_url must start with https://` | 换稳定 HTTPS 域名；临时隧道不算 |
| `No profiles for 'com.dezhounight.poker' were found` | profile 的 Bundle ID/证书/Team 不匹配；重下 App Store profile |
| `The provided entity includes an attribute with a value that has already been used` | build number 重复；换更大的 build_number |
| `altool` 认证失败 | Key ID/Issuer ID/`.p8` 不匹配；确认 API Key 有 App Manager 权限 |
| 上传成功但 TestFlight 一直 Processing | 等 10–30 分钟；检查 App Store Connect 邮件 |
| 测试者装不上 | 确认构建未过期（90 天）、测试者已接受邀请、设备 iOS 15+ |
| 语音没声音/无法授权 | 确认 URL 是 HTTPS；设置里允许麦克风；真机测试 |
