package com.dezhounight.poker;

import android.annotation.SuppressLint;
import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.Set;

public class MainActivity extends Activity {
    private static final String TAG = "PokerApp";
    private static final String APP_URL = "https://appassets.androidplatform.net/assets/index.html";
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final int VOICE_PERMISSION_REQUEST = 7001;

    private WebView webView;
    private TextToSpeech tts;
    private boolean ttsReady;
    private String pendingSpeak;
    private String voiceProfile = "female_warm";
    private PermissionRequest pendingVoicePermission;
    private File webUpdateFile;
    private FileOutputStream webUpdateOutput;
    private long webUpdateBytes;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams attrs = getWindow().getAttributes();
            attrs.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            getWindow().setAttributes(attrs);
        }

        setupWebView();
        setupTts();
        setContentView(webView);
        hideSystemUi();
        webView.loadUrl(APP_URL);
    }

    private void setupTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || tts == null) {
                Log.w(TAG, "TTS init failed: " + status);
                return;
            }
            int result = tts.setLanguage(Locale.CHINA);
            if (result == TextToSpeech.LANG_MISSING_DATA
                    || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                Log.w(TAG, "TTS zh-CN unavailable: " + result);
                tts.setLanguage(Locale.getDefault());
            }
            applyVoiceProfile(tts);
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    Log.d(TAG, "TTS start " + utteranceId);
                }

                @Override
                public void onDone(String utteranceId) {
                    Log.d(TAG, "TTS done " + utteranceId);
                }

                @Override
                public void onError(String utteranceId) {
                    Log.e(TAG, "TTS error " + utteranceId);
                }
            });
            ttsReady = true;
            Log.d(TAG, "TTS ready");
            if (pendingSpeak != null) {
                String text = pendingSpeak;
                pendingSpeak = null;
                speakNow(text);
            }
        });
    }

    private int speakNow(String text) {
        if (!ttsReady || tts == null) {
            pendingSpeak = text;
            return TextToSpeech.ERROR;
        }
        // Web bridge may call immediately after setVoiceProfile; apply again
        // before every utterance so the selected profile is really used.
        applyVoiceProfile(tts);
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        String id = "poker-" + System.currentTimeMillis();
        int result = tts.speak(text, TextToSpeech.QUEUE_ADD, params, id);
        Log.d(TAG, "TTS speak rc=" + result + " text=" + text);
        return result;
    }

    private void applyVoiceProfile(TextToSpeech engine) {
        boolean male = voiceProfile != null && voiceProfile.startsWith("male");
        float pitch = 1.1f;
        float rate = 0.94f;
        String profileHint = "xiaoxiao";
        if ("female_bright".equals(voiceProfile)) { pitch = 1.24f; rate = 1.02f; profileHint = "xiaoyi"; }
        else if ("female_sweet".equals(voiceProfile)) { pitch = 1.3f; rate = 1.04f; profileHint = "xiaoyi"; }
        else if ("female_mature".equals(voiceProfile)) { pitch = 0.96f; rate = 0.9f; profileHint = "xiaoxiao"; }
        else if ("male_deep".equals(voiceProfile)) { pitch = 0.8f; rate = 0.92f; profileHint = "yunyang"; }
        else if ("male_warm".equals(voiceProfile)) { pitch = 0.7f; rate = 0.88f; profileHint = "yunxi"; }
        else if ("male_clear".equals(voiceProfile)) { pitch = 0.9f; rate = 0.98f; profileHint = "yunyang"; }
        else if ("male_uncle".equals(voiceProfile)) { pitch = 0.62f; rate = 0.84f; profileHint = "yunjian"; }
        try {
            Set<Voice> voices = engine.getVoices();
            if (voices != null) {
                Voice best = null;
                int bestScore = -999;
                for (Voice voice : voices) {
                    Locale locale = voice.getLocale();
                    if (locale == null || !"zh".equals(locale.getLanguage())) continue;
                    String name = voice.getName().toLowerCase(Locale.ROOT);
                    String features = voice.getFeatures() == null
                            ? ""
                            : voice.getFeatures().toString().toLowerCase(Locale.ROOT);
                    boolean femaleHint = features.contains("female") || name.contains("female")
                            || name.contains("xiaoxiao") || name.contains("huihui")
                            || name.contains("yaoyao") || name.contains("tingting")
                            || name.contains("meijia") || name.contains("xiaoyi");
                    boolean maleHint = (features.contains("male") && !features.contains("female"))
                            || (name.contains("male") && !name.contains("female"))
                            || name.contains("yunxi") || name.contains("yunyang")
                            || name.contains("kangkang") || name.contains("yunjian");
                    int score = 0;
                    if (name.contains(profileHint)) score += 12;
                    if (male ? maleHint : femaleHint) score += 5;
                    if (!male && femaleHint) score += 4;
                    if (male && maleHint) score += 4;
                    if (name.contains("ssa")) score += 2;
                    if (score > bestScore) {
                        bestScore = score;
                        best = voice;
                    }
                }
                if (best != null && bestScore > 0) {
                    engine.setVoice(best);
                    Log.d(TAG, "TTS voice: " + best.getName() + " profile=" + voiceProfile + " score=" + bestScore);
                }
            }
            engine.setSpeechRate(rate);
            engine.setPitch(pitch);
        } catch (Exception error) {
            Log.w(TAG, "TTS voice profile failed", error);
        }
    }

    private void selectFemaleVoice(TextToSpeech engine) {
        try {
            Set<Voice> voices = engine.getVoices();
            if (voices == null) return;
            Voice best = null;
            int bestScore = -999;
            for (Voice voice : voices) {
                Locale locale = voice.getLocale();
                if (locale == null || !"zh".equals(locale.getLanguage())) continue;
                String name = voice.getName().toLowerCase(Locale.ROOT);
                int score = 0;
                boolean femaleHint = (voice.getFeatures() != null
                        && voice.getFeatures().toString().toLowerCase(Locale.ROOT).contains("female"))
                        || name.contains("female")
                        || name.contains("xiaoxiao")
                        || name.contains("huihui")
                        || name.contains("yaoyao")
                        || name.contains("tingting")
                        || name.contains("meijia");
                if (femaleHint) score += 4;
                if (name.contains("ssa")) score += 3;
                if (name.contains("local")) score += 2;
                if (name.contains("network")) score -= 1;
                if (name.contains("language")) score -= 2;
                if (score > bestScore) {
                    bestScore = score;
                    best = voice;
                }
            }
            if (best != null && bestScore > 0) {
                engine.setVoice(best);
                Log.d(TAG, "TTS voice: " + best.getName() + " score=" + bestScore);
            }
        } catch (Exception error) {
            Log.w(TAG, "TTS voice selection failed", error);
        }
    }

    public class NativeBridge {
        @JavascriptInterface
        public boolean isReady() {
            return ttsReady;
        }

        @JavascriptInterface
        public boolean hasMicPermission() {
            return checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED;
        }

        @JavascriptInterface
        public void requestMicPermission() {
            if (hasMicPermission()) return;
            runOnUiThread(() -> requestPermissions(
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    VOICE_PERMISSION_REQUEST));
        }

        @JavascriptInterface
        public int speak(String text) {
            if (text == null || text.isEmpty()) return TextToSpeech.ERROR;
            return speakNow(text);
        }

        @JavascriptInterface
        public void setVoiceProfile(String profile) {
            if (profile == null || profile.isEmpty()) return;
            voiceProfile = profile;
            runOnUiThread(() -> {
                if (tts != null && ttsReady) applyVoiceProfile(tts);
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (vibrator == null || !vibrator.hasVibrator()) return;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
            }
        }

        @JavascriptInterface
        public void exitApp() {
            runOnUiThread(() -> {
                finishAffinity();
                System.exit(0);
            });
        }

        @JavascriptInterface
        public void openUrl(String url) {
            if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
                return;
            }
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception error) {
                Log.w(TAG, "cannot open browser", error);
            }
        }

        @JavascriptInterface
        public synchronized boolean beginWebUpdate(long expectedSize) {
            try {
                if (webUpdateOutput != null) {
                    try { webUpdateOutput.close(); } catch (Exception ignored) { }
                    webUpdateOutput = null;
                }
                File dir = new File(getExternalFilesDir(null), "updates");
                if (!dir.isDirectory() && !dir.mkdirs()) return false;
                webUpdateFile = new File(dir, "update-web.apk");
                if (webUpdateFile.exists() && !webUpdateFile.delete()) return false;
                webUpdateOutput = new FileOutputStream(webUpdateFile);
                webUpdateBytes = 0;
                Log.d(TAG, "web update begin expected=" + expectedSize);
                return true;
            } catch (Exception error) {
                Log.e(TAG, "begin web update failed", error);
                return false;
            }
        }

        @JavascriptInterface
        public synchronized boolean appendWebUpdate(String base64Chunk) {
            if (webUpdateOutput == null || base64Chunk == null || base64Chunk.isEmpty()) return false;
            try {
                byte[] bytes = Base64.decode(base64Chunk, Base64.NO_WRAP);
                webUpdateOutput.write(bytes);
                webUpdateBytes += bytes.length;
                return true;
            } catch (Exception error) {
                Log.e(TAG, "append web update failed", error);
                return false;
            }
        }

        @JavascriptInterface
        public synchronized void finishWebUpdate() {
            try {
                if (webUpdateOutput == null) return;
                webUpdateOutput.flush();
                webUpdateOutput.close();
                webUpdateOutput = null;
                final File apk = webUpdateFile;
                final long size = webUpdateBytes;
                Log.d(TAG, "web update finished bytes=" + size);
                if (apk == null || !apk.isFile() || apk.length() < 10000) {
                    runOnUiThread(() -> notifyUpdateProgress(-1, 0, 0));
                    return;
                }
                runOnUiThread(() -> {
                    notifyUpdateProgress(100, apk.length(), apk.length());
                    Toast.makeText(MainActivity.this, "下载完成，正在安装…", Toast.LENGTH_SHORT).show();
                    installApk(apk);
                });
            } catch (Exception error) {
                Log.e(TAG, "finish web update failed", error);
                runOnUiThread(() -> notifyUpdateProgress(-1, 0, 0));
            }
        }

        @JavascriptInterface
        public synchronized void abortWebUpdate() {
            try {
                if (webUpdateOutput != null) {
                    webUpdateOutput.close();
                    webUpdateOutput = null;
                }
            } catch (Exception ignored) { }
            if (webUpdateFile != null && webUpdateFile.exists()) webUpdateFile.delete();
        }

        @JavascriptInterface
        public void downloadAndInstall(String url) {
            if (url == null || (!url.startsWith("http://") && !url.startsWith("https://"))) {
                return;
            }
            Toast.makeText(MainActivity.this, "开始下载更新…", Toast.LENGTH_SHORT).show();
            notifyUpdateProgress(0, 0, 0);
            if (startDownloadManager(url)) return;
            downloadWithHttp(url);
        }


    }

    private void downloadWithHttp(String url) {
        notifyUpdateProgress(0, 0, 0);
        new Thread(() -> {
            try {
                File dir = new File(getExternalFilesDir(null), "updates");
                if (!dir.isDirectory() && !dir.mkdirs()) {
                    throw new IllegalStateException("cannot create update dir");
                }
                File target = new File(dir, "update.apk");
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int code = connection.getResponseCode();
                if (code != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("HTTP " + code);
                }
                long total = Math.max(0, connection.getContentLength());
                long downloaded = 0;
                int lastPercent = -1;
                long lastNotifyAt = 0;
                try (InputStream input = connection.getInputStream();
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[64 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        downloaded += read;
                        long now = System.currentTimeMillis();
                        if (total > 0) {
                            int percent = (int) Math.min(100, downloaded * 100 / total);
                            if (percent != lastPercent && (now - lastNotifyAt > 120 || percent >= 100)) {
                                lastPercent = percent;
                                lastNotifyAt = now;
                                int shown = percent;
                                long shownBytes = downloaded;
                                runOnUiThread(() -> notifyUpdateProgress(shown, shownBytes, total));
                            }
                        } else if (now - lastNotifyAt > 500) {
                            lastNotifyAt = now;
                            long shownBytes = downloaded;
                            runOnUiThread(() -> notifyUpdateProgress(0, shownBytes, 0));
                        }
                    }
                    output.flush();
                }
                Log.d(TAG, "update downloaded: " + target.length());
                runOnUiThread(() -> {
                    notifyUpdateProgress(100, target.length(), target.length());
                    Toast.makeText(MainActivity.this, "下载完成，正在安装…", Toast.LENGTH_SHORT).show();
                    installApk(target);
                });
            } catch (Exception error) {
                Log.e(TAG, "update download failed", error);
                runOnUiThread(() -> notifyUpdateProgress(-1, 0, 0));
                runOnUiThread(() -> Toast.makeText(
                        MainActivity.this,
                        "更新下载失败，请检查网络",
                        Toast.LENGTH_LONG).show());
            }
        }, "update-downloader").start();
    }

    private boolean startDownloadManager(String url) {
        try {
            DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            if (manager == null) return false;
            File dir = new File(getExternalFilesDir(null), "updates");
            if (!dir.isDirectory() && !dir.mkdirs()) return false;
            File target = new File(dir, "update.apk");
            if (target.exists() && !target.delete()) return false;
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Dezhou Night update");
            request.setDescription("Downloading the latest version");
            request.setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(
                    MainActivity.this, null, "updates/update.apk");
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            long id = manager.enqueue(request);
            if (id <= 0) return false;
            watchDownloadManager(manager, id, target, url);
            Log.d(TAG, "DownloadManager started id=" + id);
            return true;
        } catch (Exception error) {
            Log.w(TAG, "DownloadManager unavailable, fallback to HTTP", error);
            return false;
        }
    }

    private void watchDownloadManager(
            DownloadManager manager, long id, File target, String url) {
        new Thread(() -> {
            long startedAt = System.currentTimeMillis();
            int lastPercent = -1;
            try {
                while (System.currentTimeMillis() - startedAt < 5 * 60 * 1000) {
                    DownloadManager.Query query = new DownloadManager.Query().setFilterById(id);
                    try (Cursor cursor = manager.query(query)) {
                        if (cursor != null && cursor.moveToFirst()) {
                            int status = cursor.getInt(
                                    cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                            long total = cursor.getLong(
                                    cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                            long bytes = cursor.getLong(
                                    cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                                long size = Math.max(target.length(), total);
                                runOnUiThread(() -> {
                                    notifyUpdateProgress(100, size, size);
                                    Toast.makeText(
                                            MainActivity.this,
                                            "下载完成，正在安装…",
                                            Toast.LENGTH_SHORT).show();
                                    installApk(target);
                                });
                                return;
                            }
                            if (status == DownloadManager.STATUS_FAILED) {
                                throw new IllegalStateException("DownloadManager failed");
                            }
                            if (total > 0) {
                                int percent = (int) Math.min(100, bytes * 100 / total);
                                if (percent != lastPercent) {
                                    lastPercent = percent;
                                    long shownBytes = bytes;
                                    long shownTotal = total;
                                    runOnUiThread(() -> notifyUpdateProgress(
                                            percent, shownBytes, shownTotal));
                                }
                            } else {
                                long shownBytes = bytes;
                                runOnUiThread(() -> notifyUpdateProgress(0, shownBytes, 0));
                            }
                        }
                    }
                    Thread.sleep(500);
                }
                throw new IllegalStateException("download timeout");
            } catch (Exception error) {
                Log.e(TAG, "DownloadManager download failed, fallback to HTTP", error);
                downloadWithHttp(url);
            }
        }, "update-download-watch").start();
    }

    private void notifyUpdateProgress(int percent, long bytes, long total) {
        if (webView == null) return;
        String js = String.format(
                Locale.US,
                "window.__updateDownloadProgress&&window.__updateDownloadProgress(%d,%d,%d);",
                percent,
                bytes,
                total);
        webView.evaluateJavascript(js, null);
    }

    private void installApk(File apk) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(this, "请允许安装未知应用后再次点击更新", Toast.LENGTH_LONG).show();
            Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(settings);
            return;
        }
        Uri uri = Uri.parse("content://" + ApkFileProvider.AUTHORITY + "/" + apk.getName());
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.setClipData(ClipData.newRawUri("", uri));
        startActivity(intent);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 6, 8));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        // 页面在 https 自定义源上，接口/SSE 仍是现有 http 服务，需要允许混合内容
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        webView.addJavascriptInterface(new NativeBridge(), "NativeBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                Uri uri = Uri.parse(url);
                if (ASSET_HOST.equals(uri.getHost())) return false;
                return !url.startsWith("file://");
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || !ASSET_HOST.equals(uri.getHost())) {
                    return super.shouldInterceptRequest(view, request);
                }
                String path = uri.getPath() == null ? "" : uri.getPath();
                if (!path.startsWith("/assets/")) {
                    WebResourceResponse missing = new WebResourceResponse("text/plain", "UTF-8",
                            new ByteArrayInputStream(new byte[0]));
                    missing.setStatusCodeAndReasonPhrase(404, "Not Found");
                    return missing;
                }
                try {
                    String assetPath = path.substring("/assets/".length());
                    java.io.InputStream input = getAssets().open(assetPath);
                    String mime = "application/octet-stream";
                    if (assetPath.endsWith(".html")) mime = "text/html";
                    else if (assetPath.endsWith(".js")) mime = "application/javascript";
                    else if (assetPath.endsWith(".css")) mime = "text/css";
                    else if (assetPath.endsWith(".json")) mime = "application/json";
                    else if (assetPath.endsWith(".webmanifest")) mime = "application/manifest+json";
                    else if (assetPath.endsWith(".png")) mime = "image/png";
                    else if (assetPath.endsWith(".svg")) mime = "image/svg+xml";
                    else if (assetPath.endsWith(".mp3")) mime = "audio/mpeg";
                    return new WebResourceResponse(mime, "UTF-8", input);
                } catch (Exception error) {
                    WebResourceResponse missing = new WebResourceResponse("text/plain", "UTF-8",
                            new ByteArrayInputStream(new byte[0]));
                    missing.setStatusCodeAndReasonPhrase(404, "Not Found");
                    return missing;
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage message) {
                Log.d(TAG, message.message() + " @" + message.sourceId() + ":" + message.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsAudio = false;
                    for (String resource : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                            wantsAudio = true;
                            break;
                        }
                    }
                    if (!wantsAudio) {
                        request.deny();
                        return;
                    }
                    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                            == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                        return;
                    }
                    pendingVoicePermission = request;
                    requestPermissions(
                            new String[]{Manifest.permission.RECORD_AUDIO},
                            VOICE_PERMISSION_REQUEST);
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != VOICE_PERMISSION_REQUEST || pendingVoicePermission == null) return;
        PermissionRequest request = pendingVoicePermission;
        pendingVoicePermission = null;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            request.deny();
            Toast.makeText(this, "需要麦克风权限才能语音", Toast.LENGTH_SHORT).show();
        }
    }

    private void hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Window window = getWindow();
            window.setDecorFitsSystemWindows(false);
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            View decor = getWindow().getDecorView();
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemUi();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return !!(window.__nativeBack && window.__nativeBack());}catch(e){return false;}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (!"true".equals(value)) {
                            finish();
                        }
                    }
                });
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
        }
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
