import UIKit
import WebKit

/// Full-screen WKWebView shell for 德扑之夜.
///
/// The web client is served from the same Node process as the Android APK /
/// browser build, so a web fix reaches the iOS app without a new binary.
final class WebViewController: UIViewController {

    private enum Palette {
        static let ink = UIColor(red: 0.031, green: 0.035, blue: 0.043, alpha: 1)
        static let gold = UIColor(red: 0.851, green: 0.725, blue: 0.467, alpha: 1)
        static let cream = UIColor(red: 0.957, green: 0.925, blue: 0.867, alpha: 1)
        static let muted = UIColor(red: 0.957, green: 0.925, blue: 0.867, alpha: 0.58)
    }

    private var webView: WKWebView!
    private let spinner = UIActivityIndicatorView(style: .large)
    private let loadingLabel = UILabel()
    private var errorView: UIView?
    private var errorLabel: UILabel?

    private var appURL: URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "DZAppURL") as? String ?? ""
        if let url = URL(string: raw), url.scheme?.lowercased().hasPrefix("http") == true {
            return url
        }
        // Safe fallback for a local/debug build. TestFlight builds pass an
        // HTTPS DZ_APP_URL explicitly.
        return URL(string: "http://192.144.159.220:8080/play")!
    }

    private var allowedHost: String { appURL.host?.lowercased() ?? "" }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Palette.ink
        configureWebView()
        configureLoadingOverlay()
        loadApp()
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override var prefersStatusBarHidden: Bool { false }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var shouldAutorotate: Bool { true }

    // MARK: - Setup

    private func configureWebView() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        // The web client checks this flag and suppresses the "add to home
        // screen" education sheet (the native shell already is the app).
        let shellScript = """
        window.__DZ_SHELL__ = 'ios-native';
        window.__DZ_SHELL_VERSION__ = '1.2.0';
        document.addEventListener('DOMContentLoaded', function () {
          document.documentElement.classList.add('ios-native');
        });
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: shellScript, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = Palette.ink
        webView.scrollView.backgroundColor = Palette.ink
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
    }

    private func configureLoadingOverlay() {
        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = Palette.gold
        spinner.hidesWhenStopped = true

        loadingLabel.translatesAutoresizingMaskIntoConstraints = false
        loadingLabel.text = "正在进入牌桌…"
        loadingLabel.font = .systemFont(ofSize: 13, weight: .medium)
        loadingLabel.textColor = Palette.muted
        loadingLabel.textAlignment = .center

        view.addSubview(spinner)
        view.addSubview(loadingLabel)
        NSLayoutConstraint.activate([
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            loadingLabel.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 14),
            loadingLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor)
        ])
        spinner.startAnimating()
    }

    private func loadApp() {
        hideError()
        spinner.startAnimating()
        loadingLabel.isHidden = false
        var request = URLRequest(url: appURL, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 25)
        request.setValue("DZiOS/1.2.0", forHTTPHeaderField: "X-DZ-Client")
        webView.load(request)
    }

    private func showError(_ message: String) {
        spinner.stopAnimating()
        loadingLabel.isHidden = true
        hideError()

        let container = UIView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.backgroundColor = Palette.ink

        let mark = UILabel()
        mark.translatesAutoresizingMaskIntoConstraints = false
        mark.text = "德"
        mark.font = .systemFont(ofSize: 52, weight: .light)
        mark.textColor = Palette.gold
        mark.textAlignment = .center

        let title = UILabel()
        title.translatesAutoresizingMaskIntoConstraints = false
        title.text = "暂时进不去牌桌"
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.textColor = Palette.cream
        title.textAlignment = .center

        let detail = UILabel()
        detail.translatesAutoresizingMaskIntoConstraints = false
        detail.text = message
        detail.numberOfLines = 0
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = Palette.muted
        detail.textAlignment = .center

        let retry = UIButton(type: .system)
        retry.translatesAutoresizingMaskIntoConstraints = false
        retry.setTitle("重新连接", for: .normal)
        retry.setTitleColor(Palette.ink, for: .normal)
        retry.titleLabel?.font = .systemFont(ofSize: 15, weight: .semibold)
        retry.backgroundColor = Palette.gold
        retry.layer.cornerRadius = 12
        retry.contentEdgeInsets = UIEdgeInsets(top: 12, left: 28, bottom: 12, right: 28)
        retry.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        container.addSubview(mark)
        container.addSubview(title)
        container.addSubview(detail)
        container.addSubview(retry)
        view.addSubview(container)
        NSLayoutConstraint.activate([
            container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            container.topAnchor.constraint(equalTo: view.topAnchor),
            container.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            mark.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            mark.centerYAnchor.constraint(equalTo: container.centerYAnchor, constant: -72),
            title.topAnchor.constraint(equalTo: mark.bottomAnchor, constant: 8),
            title.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            detail.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 10),
            detail.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 40),
            detail.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -40),
            retry.topAnchor.constraint(equalTo: detail.bottomAnchor, constant: 22),
            retry.centerXAnchor.constraint(equalTo: container.centerXAnchor)
        ])
        errorView = container
        errorLabel = detail
    }

    private func hideError() {
        errorView?.removeFromSuperview()
        errorView = nil
        errorLabel = nil
    }

    @objc private func retryTapped() {
        loadApp()
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    private func isInternal(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        if scheme == "about" || scheme == "data" || scheme == "blob" { return true }
        guard scheme == "http" || scheme == "https" else { return false }
        return url.host?.lowercased() == allowedHost
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        spinner.startAnimating()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        spinner.stopAnimating()
        loadingLabel.isHidden = true
        hideError()
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showError("网络连接失败（\(nsError.code)）。请确认网络正常后重试。")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        let nsError = error as NSError
        if nsError.code == NSURLErrorCancelled { return }
        showError("页面加载失败（\(nsError.code)）。请重试。")
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        loadApp()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if isInternal(url) {
            decisionHandler(.allow)
            return
        }
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            openExternally(url)
        } else {
            openExternally(url)
        }
        decisionHandler(.cancel)
    }
}

// MARK: - WKUIDelegate

extension WebViewController: WKUIDelegate {
    /// Required for navigator.mediaDevices.getUserMedia inside WKWebView.
    /// Without this delegate method WebKit denies the capture request even
    /// when Info.plist contains NSMicrophoneUsageDescription.
    @available(iOS 15.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        if origin.host.lowercased() == allowedHost {
            decisionHandler(.grant)
        } else {
            decisionHandler(.deny)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            if isInternal(url) {
                webView.load(navigationAction.request)
            } else {
                openExternally(url)
            }
        }
        return nil
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: "德扑之夜", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: "德扑之夜", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: "德扑之夜", message: prompt, preferredStyle: .alert)
        alert.addTextField { field in field.text = defaultText }
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "确定", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}
