import { onlineBase } from './online.js';

// 8k 单声道 + VAD：在保留可懂度的同时显著降低 4 人开麦时的 PCM 带宽。
const TARGET_RATE = 8000;
const VOICE_OUTPUT_LEVELS = { small: 1, medium: 2, large: 3, extraLarge: 3.5, huge: 4 };
const VOICE_OUTPUT_DEFAULT = 'large';

function describeMediaError(error) {
  if (!error) return '无法打开麦克风';
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
    return '麦克风权限被拒绝，请在系统/浏览器设置中允许麦克风';
  }
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
    return '没有检测到可用的麦克风';
  }
  if (String(error.message || '').includes('语音中继')) return error.message;
  return `麦克风打开失败：${error.message || error.name}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 房间语音：麦克风 PCM 经 WebSocket 中继。
 *
 * 不走 WebRTC P2P。Android 运营商 NAT 下 STUN 经常不通，TURN 端口又无法
 * 保证在云安全组开放；走现有 8080 端口的 WebSocket 才能稳定跨网。
 */
export class VoiceChat {
  constructor({ online, hud }) {
    this.online = online;
    this.hud = hud;
    this.enabled = false;
    this.pending = false;
    this.localStream = null;
    this.peers = new Map();
    this.ws = null;
    this.wsActive = false;
    this.wsConnectPromise = null;
    this.relayConnected = false;
    this.audioContext = null;
    this.captureSource = null;
    this.processor = null;
    this.captureSink = null;
    this.reconnectTimer = null;
    this.closing = false;
    this.nextPlayAt = 0;
    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.lastLevel = 0;
    this.lastReceivedLevel = 0;
    this.sendInFlight = false;
    this.pendingPcm = null;
    this.httpQueue = [];
    this.jitterTarget = 0.32;
    this.lastUnderrunAt = 0;
    this.lastJitterDecayAt = 0;
    this.audioErrorShown = false;
    this.silentFrames = 0;
    this.outputVolume = (() => {
      try {
        const saved = localStorage.getItem('pokerVoiceVolume');
        return VOICE_OUTPUT_LEVELS[saved] ? saved : VOICE_OUTPUT_DEFAULT;
      } catch { return VOICE_OUTPUT_DEFAULT; }
    })();
    this.playbackGain = null;
    this.playbackCompressor = null;
    this.remoteTimelines = new Map();
    this.activeVoicePid = 0;
    this.floorHeld = false;
    this.releasedForSilence = false;

    // 听与说是两条独立通道：没开麦也必须能听到别人。
    this.listening = false;
    this.playbackMuted = false;
    this.mutedPids = new Set();
    this.soloPid = null;
    this.remoteLevels = new Map();
    this.localVisualLevel = 0;
    this.levelTimer = null;
    this.micTesting = false;
    this.micTestTimer = null;
    this.micTestStream = null;
    this.micTestSource = null;
    this.micTestAnalyser = null;
    this.micTestSink = null;
    this.micTestPeak = 0;
    this.micTestStartedAt = 0;
    this.lastLevelSentAt = 0;
    this.audioUnlockHinted = false;
    this.talkTimer = null;
    this.playbackUnlock = () => {
      if (this.listening && this.online.room) {
        this.armPlayback().catch(() => {});
      }
    };
    document.addEventListener('pointerdown', this.playbackUnlock, { passive: true });

    this.online.on('left', () => this.reset());
    this.online.on('voicepcm', (data) => this.handleVoicePcm(data));
  }

  get myPid() {
    return Number(this.online.room?.pid) || 0;
  }

  get roomCode() {
    return this.online.room?.code || '';
  }

  get relayUrl() {
    const room = this.online.room;
    if (!room) return '';
    const base = onlineBase() || `${location.protocol}//${location.host}`;
    const wsBase = String(base).replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
    return `${wsBase}/api/voice-relay?code=${encodeURIComponent(room.code)}`
      + `&token=${encodeURIComponent(room.token)}`
      + `&v=${encodeURIComponent(window.__APP_VERSION_CODE__ || 0)}`;
  }

  async armPlayback() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) throw new Error('当前设备不支持音频播放');
    if (!this.audioContext) this.audioContext = new AudioCtor();
    if (!this.playbackGain) {
      this.playbackGain = this.audioContext.createGain();
      this.playbackGain.gain.value = VOICE_OUTPUT_LEVELS[this.outputVolume] || 3;
      this.playbackCompressor = this.audioContext.createDynamicsCompressor();
      this.playbackCompressor.threshold.value = -20;
      this.playbackCompressor.knee.value = 24;
      this.playbackCompressor.ratio.value = 5;
      this.playbackCompressor.attack.value = 0.003;
      this.playbackCompressor.release.value = 0.22;
      this.playbackGain.connect(this.playbackCompressor);
      this.playbackCompressor.connect(this.audioContext.destination);
    } else {
      this.playbackGain.gain.value = VOICE_OUTPUT_LEVELS[this.outputVolume] || 3;
    }
    this.listening = true;
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }
    this.startLevelLoop();
    if (this.online.room && !this.wsActive && !this.wsConnectPromise) {
      this.connectRelay().catch(() => {});
    }
    this.updateHud();
    if (this.audioContext.state === 'suspended') {
      if (!this.audioUnlockHinted) {
        this.audioUnlockHinted = true;
        this.hud?.toast?.('点击屏幕任意位置开启语音播放', { kind: 'info', title: '语音' });
      }
    } else {
      this.audioUnlockHinted = false;
    }
    return this.audioContext;
  }

  startLevelLoop() {
    if (this.levelTimer) return;
    this.levelTimer = setInterval(() => {
      let changed = false;
      for (const [pid, level] of this.remoteLevels) {
        const next = level * 0.78;
        if (next < 0.015) this.remoteLevels.delete(pid);
        else this.remoteLevels.set(pid, next);
        changed = true;
      }
      this.localVisualLevel *= 0.82;
      if (this.localVisualLevel < 0.01) this.localVisualLevel = 0;
      this.hud?.setVoiceInputLevel?.(this.localVisualLevel);
      if (changed) this.hud?.updateVoicePanelLevels?.();
    }, 110);
  }

  setOutputVolume(level) {
    const next = VOICE_OUTPUT_LEVELS[level] ? level : VOICE_OUTPUT_DEFAULT;
    this.outputVolume = next;
    if (this.playbackGain) this.playbackGain.gain.value = VOICE_OUTPUT_LEVELS[next];
    try { localStorage.setItem('pokerVoiceVolume', next); } catch { /* ignore */ }
  }

  isMuted(pid) {
    return this.mutedPids.has(Number(pid));
  }

  isSolo(pid) {
    return this.soloPid != null && this.soloPid === Number(pid);
  }

  isGlobalMuted() {
    return this.playbackMuted;
  }

  shouldHear(pid) {
    const key = Number(pid);
    if (this.playbackMuted) return false;
    if (this.soloPid != null) return key === this.soloPid;
    return !this.mutedPids.has(key);
  }

  toggleMute(pid) {
    const key = Number(pid);
    if (!key) return;
    if (this.mutedPids.has(key)) this.mutedPids.delete(key);
    else this.mutedPids.add(key);
    this.hud?.renderVoicePanel?.();
  }

  toggleSolo(pid) {
    const key = Number(pid);
    if (!key) return;
    this.soloPid = this.soloPid === key ? null : key;
    this.hud?.renderVoicePanel?.();
  }

  setAllMuted(muted) {
    this.playbackMuted = Boolean(muted);
    this.hud?.renderVoicePanel?.();
  }

  async toggleMicTest() {
    if (this.micTesting) {
      this.stopMicTest('测试已停止');
      return;
    }
    return this.startMicTest();
  }

  async startMicTest() {
    if (this.micTesting) return;
    this.micTesting = true;
    this.micTestPeak = 0;
    this.micTestStartedAt = Date.now();
    this.hud?.setMicTestState?.({ running: true, level: 0, status: '正在检测，请说话…' });
    try {
      const secure = window.isSecureContext || window.location.protocol === 'file:';
      if (!secure || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('麦克风测试需要 HTTPS 安全页面，请使用新版 App');
      }
      await this.ensureNativeMic();
      await this.armPlayback();
      let stream = this.localStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        this.micTestStream = stream;
      }
      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.55;
      const sink = this.audioContext.createGain();
      sink.gain.value = 0;
      source.connect(analyser);
      analyser.connect(sink);
      sink.connect(this.audioContext.destination);
      this.micTestSource = source;
      this.micTestAnalyser = analyser;
      this.micTestSink = sink;
      this.micTestTimer = setInterval(() => this.sampleMicTest(), 90);
    } catch (error) {
      this.micTesting = false;
      this.stopMicTest('麦克风测试失败', true);
      this.hud?.setMicTestState?.({
        running: false,
        level: 0,
        status: describeMediaError(error),
        error: true,
      });
    }
  }

  sampleMicTest() {
    if (!this.micTestAnalyser) return;
    const data = new Uint8Array(this.micTestAnalyser.fftSize);
    this.micTestAnalyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = (data[i] - 128) / 128;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / data.length);
    const level = Math.min(1, rms * 8);
    this.micTestPeak = Math.max(this.micTestPeak, level);
    this.localVisualLevel = Math.max(this.localVisualLevel * 0.5, level);
    this.hud?.setVoiceInputLevel?.(this.localVisualLevel);
    const elapsed = Date.now() - this.micTestStartedAt;
    let status = '请对着麦克风说话…';
    if (this.micTestPeak >= 0.16) status = '麦克风正常，正在收音';
    else if (elapsed > 2400) status = '没有检测到清晰人声，请靠近麦克风或检查系统权限';
    else if (this.micTestPeak >= 0.06) status = '检测到轻微声音，请再靠近一点';
    this.hud?.setMicTestState?.({ running: true, level, status });
    if (elapsed > 30000) this.stopMicTest('测试完成');
  }

  stopMicTest(message = '未测试', fromError = false) {
    if (this.micTestTimer) {
      clearInterval(this.micTestTimer);
      this.micTestTimer = null;
    }
    try {
      this.micTestSource?.disconnect();
      this.micTestAnalyser?.disconnect();
      this.micTestSink?.disconnect();
    } catch { /* 忽略 */ }
    this.micTestSource = null;
    this.micTestAnalyser = null;
    this.micTestSink = null;
    if (this.micTestStream) {
      for (const track of this.micTestStream.getTracks()) track.stop();
      this.micTestStream = null;
    }
    this.micTesting = false;
    if (!this.enabled) this.hud?.setVoiceInputLevel?.(0);
    if (!fromError) {
      this.hud?.setMicTestState?.({ running: false, level: 0, status: message });
    }
  }

  async toggle() {
    if (this.pending) return;
    if (this.enabled) return this.disable();
    return this.enable();
  }

  async ensureNativeMic() {
    if (!window.NativeBridge || typeof window.NativeBridge.hasMicPermission !== 'function') return;
    if (window.NativeBridge.hasMicPermission()) return;
    if (typeof window.NativeBridge.requestMicPermission === 'function') {
      window.NativeBridge.requestMicPermission();
    }
    for (let i = 0; i < 24; i += 1) {
      await sleep(500);
      if (window.NativeBridge.hasMicPermission()) return;
    }
    throw new Error('未获得麦克风权限，请在系统设置中允许麦克风');
  }

  async enable() {
    if (this.pending || this.enabled) return;
    this.pending = true;
    this.closing = false;
    this.hud.setVoiceState({ pending: true, enabled: false });
    try {
      const secure = window.isSecureContext || window.location.protocol === 'file:';
      if (!secure || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('麦克风需要 HTTPS 安全页面；请使用新版 App 或 HTTPS 访问');
      }
      await this.ensureNativeMic();

      // 听与说是两条独立通道：先确保播放上下文可用，再打开麦克风。
      await this.armPlayback();

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        });
      } catch (firstError) {
        if (firstError?.name === 'NotAllowedError' || firstError?.name === 'SecurityError') throw firstError;
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      }
      if (!stream.getAudioTracks().length) throw new Error('麦克风没有返回音频轨道');
      this.localStream = stream;
      this.enabled = true;
      await this.connectRelay().catch(() => {
        // WebSocket 被混合内容/网络策略拦截时，继续使用 HTTP+SSE 通道。
        this.httpQueue = this.httpQueue || [];
      });
      this.startCapture();
      if (!this.processor) throw new Error('设备不支持实时麦克风采集');
      this.updateHud();
    } catch (error) {
      this.stopEverything(true);
      this.enabled = false;
      this.hud.toast(describeMediaError(error));
    } finally {
      this.pending = false;
      this.updateHud();
    }
  }

  async connectRelay() {
    if (!this.online.room) throw new Error('不在房间内，无法开启语音');
    if (typeof WebSocket === 'undefined') throw new Error('当前环境不支持语音长连接');
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.wsActive = true;
      this.relayConnected = true;
      this.updateHud();
      return;
    }
    if (this.wsConnectPromise) return this.wsConnectPromise;
    this.closing = false;
    this.wsConnectPromise = new Promise((resolve, reject) => {
      let settled = false;
      let socket;
      try {
        socket = new WebSocket(this.relayUrl);
      } catch (error) {
        this.wsConnectPromise = null;
        reject(error);
        return;
      }
      socket.binaryType = 'arraybuffer';
      this.ws = socket;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.wsConnectPromise = null;
        this.wsActive = false;
        this.relayConnected = false;
        try { socket.close(); } catch { /* 忽略 */ }
        this.updateHud();
        reject(new Error('语音长连接超时'));
      }, 2400);
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.wsConnectPromise = null;
        this.wsActive = true;
        this.relayConnected = true;
        this.updateHud();
        resolve();
      };
      socket.onmessage = (event) => this.handleWsPacket(event.data);
      socket.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.wsConnectPromise = null;
          this.wsActive = false;
          this.relayConnected = false;
          this.updateHud();
          reject(new Error('语音长连接失败'));
        }
      };
      socket.onclose = () => {
        clearTimeout(timer);
        this.wsActive = false;
        this.relayConnected = false;
        this.wsConnectPromise = null;
        this.updateHud();
        if (!settled) {
          settled = true;
          reject(new Error('语音长连接关闭'));
        }
        if (!this.closing && (this.listening || this.enabled)) this.scheduleReconnect();
      };
    });
    return this.wsConnectPromise;
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.closing || (!this.enabled && !this.listening)) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.closing || (!this.enabled && !this.listening)) return;
      try {
        await this.connectRelay();
        this.hud.toast('语音连接已恢复', { kind: 'success', title: '语音' });
      } catch {
        this.scheduleReconnect();
      }
    }, 2500);
  }

  startCapture() {
    if (!this.localStream || !this.audioContext || this.processor) return;
    try {
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      const sink = this.audioContext.createGain();
      sink.gain.value = 0;
      processor.onaudioprocess = (event) => this.sendPcm(event.inputBuffer.getChannelData(0));
      source.connect(processor);
      processor.connect(sink);
      sink.connect(this.audioContext.destination);
      this.captureSource = source;
      this.processor = processor;
      this.captureSink = sink;
    } catch (error) {
      console.warn('[voice] capture failed', error);
    }
  }

  sendPcm(samples) {
    if (!this.enabled) return;
    const ratio = this.audioContext.sampleRate / TARGET_RATE;
    const length = Math.max(1, Math.floor(samples.length / ratio));
    const pcm = new Int16Array(length);
    let peak = 0;
    for (let i = 0; i < length; i += 1) {
      const start = Math.floor(i * ratio);
      const end = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = start; j < end; j += 1) sum += samples[j];
      const value = Math.max(-1, Math.min(1, end > start ? sum / (end - start) : 0));
      peak = Math.max(peak, Math.abs(value));
      pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
    }
    this.lastLevel = peak;
    this.localVisualLevel = Math.max(
      this.localVisualLevel * 0.55,
      Math.min(1, Math.pow(peak, 0.55) * 2.8),
    );
    this.hud?.setVoiceInputLevel?.(this.localVisualLevel);
    // VAD：静音不上传，避免所有开麦的人持续抢服务器。
    // 连续静音约1秒主动释放说话权，下一个人马上能说。
    if (peak < 0.008) {
      this.silentFrames += 1;
      if (this.silentFrames > 8) return;
    } else {
      this.silentFrames = 0;
      this.releasedForSilence = false;
    }
    this.queueAudio(pcm.buffer);
  }

  releaseFloor() {
    if (!this.enabled) return;
    if (this.activeVoicePid && this.activeVoicePid !== this.myPid) return;
    this.floorHeld = false;
    this.activeVoicePid = 0;
    this.online.voiceSignal?.('release')?.catch?.(() => {});
  }

  queueAudio(buffer) {
    if (this.wsActive && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWsPcm(buffer);
      return;
    }
    this.httpQueue.push(buffer);
    // 网络紧张时限制积压，避免延迟无限增长；优先保留最新语音。
    while (this.httpQueue.length > 24) this.httpQueue.shift();
    this.pumpHttp();
  }

  sendWsPcm(buffer) {
    const samples = new Int16Array(buffer);
    const frameSamples = TARGET_RATE / 50; // 20ms，降低突发与抖动
    for (let offset = 0; offset < samples.length; offset += frameSamples) {
      if (this.ws.bufferedAmount > 256 * 1024) break;
      const part = samples.slice(offset, Math.min(samples.length, offset + frameSamples));
      try {
        this.ws.send(part.buffer);
        this.packetsSent += 1;
      } catch {
        return;
      }
    }
  }

  pumpHttp() {
    if (this.sendInFlight || !this.httpQueue.length || !this.enabled) return;
    const room = this.online.room;
    if (!room) return;
    const base = onlineBase() || `${location.protocol}//${location.host}`;
    const buffer = this.httpQueue.shift();
    this.sendInFlight = true;
    this.packetsSent += 1;
    fetch(`${base}/api/rooms/${room.code}/voice-audio?token=${encodeURIComponent(room.token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Client-Version': String(window.__APP_VERSION_CODE__ || 0),
      },
      body: buffer,
      cache: 'no-store',
    }).then((response) => {
      if (!response.ok) throw new Error(`语音中继 HTTP ${response.status}`);
      this.relayConnected = true;
      this.audioErrorShown = false;
      this.updateHud();
    }).catch((error) => {
      if (!this.audioErrorShown) {
        this.audioErrorShown = true;
        this.hud.toast(error.message || '语音发送失败，请重试', { kind: 'warn', title: '语音' });
      }
    }).finally(() => {
      this.sendInFlight = false;
      this.pumpHttp();
    });
  }

  handleVoicePcm(data) {
    if (!data || this.wsActive) return;
    const from = Number(data.from);
    if (!from || from === this.myPid) return;
    if (typeof data.data !== 'string' || !data.data) return;
    // 关键：没有开自己的麦克风，也必须能听到别人的 PCM。
    this.armPlayback().catch(() => {});
    try {
      const binary = atob(data.data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      this.playPcm(bytes.buffer, from);
    } catch { /* 忽略坏包 */ }
  }

  handleWsPacket(data) {
    if (!(data instanceof ArrayBuffer) || data.byteLength < 9) return;
    const view = new DataView(data);
    if (view.getUint32(0) !== 0x50435631) return;
    const from = view.getUint16(4);
    if (!from || from === this.myPid) return;
    this.wsActive = true;
    this.armPlayback().catch(() => {});
    this.playPcm(data.slice(8), from);
  }

  playPcm(raw, from = 0) {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
    const pcm = new Int16Array(raw);
    if (!pcm.length) return;
    const buffer = this.audioContext.createBuffer(1, pcm.length, TARGET_RATE);
    const data = buffer.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      const value = pcm[i] / 0x8000;
      data[i] = value;
      peak = Math.max(peak, Math.abs(value));
    }
    this.lastLevel = Math.max(this.lastLevel * 0.8, peak);
    this.lastReceivedLevel = Math.max(this.lastReceivedLevel * 0.92, peak);
    this.packetsReceived += 1;
    if (from) {
      const visual = Math.min(1, Math.pow(peak, 0.55) * 3.2);
      this.remoteLevels.set(from, Math.max(this.remoteLevels.get(from) || 0, visual));
    }
    if (!this.shouldHear(from)) return;
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackGain || this.audioContext.destination);
    // 每个说话人独立时间线，才能让最多8路 PCM 真正叠加混音；
    // 以前共用一个 nextPlayAt 会把多人声音串行化，听起来卡顿/断续。
    const now = this.audioContext.currentTime;
    let timeline = this.remoteTimelines.get(from);
    if (!timeline) {
      timeline = { nextAt: 0 };
      this.remoteTimelines.set(from, timeline);
    }
    if (!timeline.nextAt || timeline.nextAt < now - 0.18 || timeline.nextAt > now + 1.0) {
      timeline.nextAt = now + 0.12;
    }
    const when = Math.max(now + 0.03, timeline.nextAt);
    timeline.nextAt = when + buffer.duration;
    try {
      source.start(when);
    } catch { /* 忽略 */ }
  }

  async disable() {
    if (this.talkTimer) { clearTimeout(this.talkTimer); this.talkTimer = null; }
    if (this.pending) return;
    this.pending = true;
    this.closing = true;
    const wasEnabled = this.enabled;
    this.enabled = false;
    if (wasEnabled && this.online?.room) this.online.voiceSignal?.('leave')?.catch?.(() => {});
    this.stopMicTest('未测试');
    this.updateHud();
    this.stopEverything(true);
    this.pending = false;
    this.updateHud();
    if (wasEnabled) this.hud.toast('语音已关闭', { kind: 'info', title: '语音' });
  }

  reset() {
    if (this.talkTimer) { clearTimeout(this.talkTimer); this.talkTimer = null; }
    const wasEnabled = this.enabled;
    this.enabled = false;
    this.pending = false;
    this.closing = true;
    this.listening = false;
    this.playbackMuted = false;
    this.mutedPids.clear();
    this.soloPid = null;
    this.remoteLevels.clear();
    this.remoteTimelines.clear();
    this.localVisualLevel = 0;
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    this.stopEverything(false);
    this.updateHud();
    if (wasEnabled) this.hud.toast('语音已关闭');
  }

  stopEverything(keepPlayback = false) {
    this.stopMicTest('未测试');
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (!keepPlayback && this.ws) {
      try { this.ws.close(); } catch { /* 忽略 */ }
      this.ws = null;
      this.wsActive = false;
    }
    if (!keepPlayback) this.relayConnected = false;
    if (this.processor) {
      try {
        this.processor.disconnect();
        this.captureSource?.disconnect();
        this.captureSink?.disconnect();
      } catch { /* 忽略 */ }
      this.processor.onaudioprocess = null;
      this.processor = null;
      this.captureSource = null;
      this.captureSink = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    if (this.audioContext && !keepPlayback) {
      this.audioContext.suspend().catch(() => {});
      this.nextPlayAt = 0;
    }
  }

  updateHud() {
    if (!this.hud) return;
    const connected = this.relayConnected ? 1 : 0;
    this.hud.setVoiceState({
      enabled: this.enabled,
      pending: this.pending,
      peers: connected,
      connected,
      listening: this.listening,
    });
  }
}
