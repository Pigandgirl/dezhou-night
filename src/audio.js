import { clamp } from './util.js';
import { getScene } from './scene-presets.js';

const VOICE_CLIP_KEYS = [
  'allin', 'bet', 'call', 'check', 'demo', 'eight', 'five', 'fold',
  'four', 'hundred', 'nine', 'one', 'pot', 'raise', 'seven', 'showdown',
  'six', 'ten', 'thousand', 'three', 'two', 'wan', 'win', 'zero',
  'en_check', 'en_call', 'en_bet', 'en_raise', 'en_allin', 'en_fold',
  'en_showdown', 'en_win', 'en_pot', 'en_zero', 'en_one', 'en_two',
  'en_three', 'en_four', 'en_five', 'en_six', 'en_seven', 'en_eight',
  'en_nine', 'en_ten', 'en_eleven', 'en_twelve', 'en_thirteen', 'en_fourteen',
  'en_fifteen', 'en_sixteen', 'en_seventeen', 'en_eighteen', 'en_nineteen',
  'en_twenty', 'en_thirty', 'en_forty', 'en_fifty', 'en_sixty', 'en_seventy',
  'en_eighty', 'en_ninety', 'en_hundred', 'en_thousand',
];

const APK_ASSETS = String(location.pathname).startsWith('/assets/');

function voiceClipUrl(profile, key) {
  // APK 资产使用扁平文件名，避免 Windows aapt2 在 ZIP 中写入反斜杠目录。
  if (APK_ASSETS) return `${location.origin}/assets/voice_${profile}_${key}.mp3`;
  // 网页使用服务端 /voice/...；file:// 预览使用相对目录。
  if (location.protocol === 'file:') {
    return new URL(`./voice/${profile}/${key}.mp3`, document.baseURI).href;
  }
  return `${location.origin}/voice/${profile}/${key}.mp3`;
}

const NUM_CLIP_KEYS = {
  '零': 'zero', '一': 'one', '二': 'two', '三': 'three', '四': 'four',
  '五': 'five', '六': 'six', '七': 'seven', '八': 'eight', '九': 'nine',
  '十': 'ten', '百': 'hundred', '千': 'thousand', '万': 'wan',
};

const EN_ACTION_CLIP = {
  check: 'en_check', call: 'en_call', bet: 'en_bet', raise: 'en_raise',
  allin: 'en_allin', fold: 'en_fold', showdown: 'en_showdown',
  win: 'en_win', pot: 'en_pot',
};

const EN_NUM_CLIP = {
  zero: 'en_zero', one: 'en_one', two: 'en_two', three: 'en_three',
  four: 'en_four', five: 'en_five', six: 'en_six', seven: 'en_seven',
  eight: 'en_eight', nine: 'en_nine', ten: 'en_ten',
  eleven: 'en_eleven', twelve: 'en_twelve', thirteen: 'en_thirteen', fourteen: 'en_fourteen',
  fifteen: 'en_fifteen', sixteen: 'en_sixteen', seventeen: 'en_seventeen', eighteen: 'en_eighteen',
  nineteen: 'en_nineteen', twenty: 'en_twenty', thirty: 'en_thirty', forty: 'en_forty',
  fifty: 'en_fifty', sixty: 'en_sixty', seventy: 'en_seventy', eighty: 'en_eighty',
  ninety: 'en_ninety', hundred: 'en_hundred', thousand: 'en_thousand',
};

function amountToEnglishWord(n) {
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const under100 = (x) => x < 20 ? ones[x] : (x % 10 ? `${tens[Math.floor(x / 10)]}-${ones[x % 10]}` : tens[Math.floor(x / 10)]);
  const under1000 = (x) => {
    if (x < 100) return under100(x);
    const head = `${ones[Math.floor(x / 100)]} hundred`;
    return x % 100 ? `${head} ${under100(x % 100)}` : head;
  };
  if (n < 1000) return under1000(n);
  if (n < 1000000) {
    const head = `${under1000(Math.floor(n / 1000))} thousand`;
    return n % 1000 ? `${head} ${under1000(n % 1000)}` : head;
  }
  return String(n);
}

function amountClipKeys(value, english) {
  if (english) {
    return amountToEnglishWord(Math.max(0, Math.floor(Number(value) || 0)))
      .split(/[\s-]+/).map((word) => EN_NUM_CLIP[word]).filter(Boolean);
  }
  return [...amountToChinese(value)].map((ch) => NUM_CLIP_KEYS[ch]).filter(Boolean);
}

function amountToChinese(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (!n) return '零';
  const digits = '零一二三四五六七八九';
  const units = ['', '十', '百', '千'];
  const big = ['', '万', '亿'];
  let left = n;
  let group = 0;
  let output = '';
  while (left > 0) {
    let section = left % 10000;
    let part = '';
    let zero = false;
    for (let unit = 0; section > 0; unit += 1) {
      const digit = section % 10;
      if (digit === 0) {
        if (part && !zero) {
          part = `零${part}`;
          zero = true;
        }
      } else {
        part = `${digits[digit]}${units[unit]}${part}`;
        zero = false;
      }
      section = Math.floor(section / 10);
    }
    if (part) output = `${part}${big[group] || ''}${output}`;
    left = Math.floor(left / 10000);
    group += 1;
  }
  return output.replace(/零+/g, '零').replace(/零$/, '');
}

function dataUrlToBuffer(url) {
  const comma = String(url).indexOf(',');
  if (comma < 0) return null;
  const binary = atob(String(url).slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

const MIDI_BASE = 440;

function midiToFreq(midi) {
  return MIDI_BASE * Math.pow(2, (midi - 69) / 12);
}

export const VOICE_PROFILES = {
  female_warm: {
    voiceHints: ['xiaoxiao'],
    label: '女声 · 温柔', gender: 'female', pitch: 1.1, rate: 0.94,
  },
  female_bright: {
    voiceHints: ['xiaoyi'],
    label: '女声 · 清亮', gender: 'female', pitch: 1.24, rate: 1.02,
  },
  male_deep: {
    voiceHints: ['yunyang'],
    label: '男声 · 沉稳', gender: 'male', pitch: 0.8, rate: 0.92,
  },
  male_warm: {
    voiceHints: ['yunxi'],
    label: '男声 · 磁性', gender: 'male', pitch: 0.7, rate: 0.88,
  },
  female_sweet: {
    voiceHints: ['xiaoyi'],
    label: '女声 · 甜系', gender: 'female', pitch: 1.3, rate: 1.04,
  },
  female_mature: {
    voiceHints: ['xiaoxiao','huihui','yaoyao'],
    label: '女声 · 御姐', gender: 'female', pitch: 0.96, rate: 0.9,
  },
  male_clear: {
    voiceHints: ['yunyang'],
    label: '男声 · 清朗', gender: 'male', pitch: 0.9, rate: 0.98,
  },
  male_uncle: {
    voiceHints: ['yunjian','kangkang'],
    label: '男声 · 大叔', gender: 'male', pitch: 0.62, rate: 0.84,
  },
};
const VOICE_PROFILE_KEY = 'pokerVoiceProfile';

const EN_PHRASES = {
  check: 'check',
  call: 'call',
  bet: 'bet',
  raise: 'raise',
  allin: 'all in',
  fold: 'fold',
  showdown: 'showdown',
};

const PHRASES = {
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注到',
  allin: '全下',
  fold: '弃牌',
  showdown: '摊牌',
  win: '赢得',
};

export class PokerAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.reverb = null;
    this.reverbSend = null;
    this.noiseBuffer = null;
    this.musicTimer = null;
    this.crackleSource = null;
    this.crackleGain = null;
    this.ambienceSource = null;
    this.ambienceGain = null;
    this.ambienceTimer = null;
    this.nextBarTime = 0;
    this.barIndex = 0;
    this.settings = { music: true, sfx: true, voice: true };
    this.voices = [];
    this.voice = null;
    this.lastSpeak = 0;
    this.voiceProfiles = VOICE_PROFILES;
    this.voiceProfile = localStorage.getItem(VOICE_PROFILE_KEY) || 'female_mature';
    if (!VOICE_PROFILES[this.voiceProfile]) this.voiceProfile = 'female_mature';
    this.onVoiceProfileChange = null;
    this.onFallback = null;
    this.voiceBuffers = new Map();
    this.voicePackProfile = '';
    this.voicePackPromise = null;
    this.voiceSources = [];
    this.voiceBus = null;
    this.nameAudioCache = new Map();
    this.phraseAudioCache = new Map();
    this.speechQueue = [];
    this.speechBusy = false;
    this.speechSources = [];
    this.currentSpeechRate = 1;
    this.currentSpeechItem = null;
    this.cancelledSpeechItems = new WeakSet();
    this.volume = { master: 0.9, music: 0.7, sfx: 0.8 };
    this.beat = 60 / 66;
    this.bar = this.beat * 4;
    this.sceneId = 'private';
    this.chords = [
      [50, 54, 57, 60, 64], // Dm9
      [43, 50, 53, 57, 59], // G13
      [48, 52, 55, 59, 62], // Cmaj9
      [45, 52, 55, 59, 60], // Am7
      [41, 48, 52, 55, 59], // Fmaj7
      [43, 50, 53, 57, 60], // G7
    ];
    this.loadVoices();
  }

  init() {
    this.applyNativeProfile();
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.master.connect(ctx.destination);

    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 0.95;
    this.voiceBus.connect(this.master);
    this.loadVoicePack().catch(() => {});

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.settings.sfx ? this.volume.sfx : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.settings.music ? this.volume.music : 0;
    this.musicBus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.6, 2.4);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.reverb.connect(wet);
    wet.connect(this.master);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.6;
    this.reverbSend.connect(this.reverb);

    this.noiseBuffer = this.makeNoise(3);

    if (this.settings.music) this.startMusic();
  }

  makeImpulse(duration, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  makeNoise(duration) {
    const ctx = this.ctx;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /* ---------------------------- 音量与开关 ---------------------------- */

  setMusic(on) {
    this.settings.music = on;
    if (!this.ctx) return;
    const target = on ? this.volume.music : 0;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 0.5);
    if (on) this.startMusic();
    else this.stopMusic();
  }

  setScene(sceneId = 'private') {
    const preset = getScene(sceneId);
    this.sceneId = sceneId;
    const music = preset.music || {};
    if (Array.isArray(music.chords) && music.chords.length) this.chords = music.chords;
    if (music.beat) {
      this.beat = 60 / music.beat;
      this.bar = this.beat * 4;
    }
    this.barIndex = 0;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      if (this.ambienceFilter) {
        this.ambienceFilter.frequency.setTargetAtTime(this.sceneAmbienceFrequency(), now, 0.5);
        this.ambienceFilter.Q.setTargetAtTime(sceneId === 'ocean' || sceneId === 'yacht' ? 0.3 : 0.7, now, 0.5);
      }
      if (this.ambienceGain) this.ambienceGain.gain.setTargetAtTime(this.sceneAmbienceLevel(), now, 0.7);
      if (this.musicBus && this.settings.music) {
        this.musicBus.gain.cancelScheduledValues(now);
        const level = this.volume.music;
        this.musicBus.gain.setTargetAtTime(level * 0.3, now, 0.25);
        this.musicBus.gain.setTargetAtTime(level, now + 0.4, 0.8);
      }
    }
  }

  sceneAmbienceFrequency() {
    return { yacht: 700, bus: 180, grassland: 900, airplane: 240, night_market: 520, private: 420 }[this.sceneId] || 420;
  }

  sceneAmbienceLevel() {
    return { yacht: 0.022, bus: 0.014, grassland: 0.018, airplane: 0.012, night_market: 0.024, private: 0.016 }[this.sceneId] || 0.016;
  }

  sceneAmbientTick() {
    if (!this.ctx || !this.settings.music) return;
    if (this.sceneId === 'yacht') {
      if (Math.random() < 0.8) this.waveBurst();
      if (Math.random() < 0.35) this.gullCry();
    } else if (this.sceneId === 'bus') {
      if (Math.random() < 0.65) this.engineHum(82, 0.018);
      if (Math.random() < 0.2) this.chime(660);
    } else if (this.sceneId === 'grassland') {
      if (Math.random() < 0.7) this.waveBurst(0.012, 0.55);
      if (Math.random() < 0.3) this.sheepBleat();
    } else if (this.sceneId === 'airplane') {
      if (Math.random() < 0.8) this.engineHum(120, 0.013);
      if (Math.random() < 0.18) this.chime(880);
    } else if (this.sceneId === 'night_market') {
      if (Math.random() < 0.7) this.chatterBurst();
      if (Math.random() < 0.35) this.glassClink();
    } else {
      if (Math.random() < 0.65) this.chatterBurst();
      if (Math.random() < 0.35) this.glassClink();
    }
  }

  waveBurst(level = 0.016, duration = 1.8) {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = this.makeNoise(duration);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(lp).connect(gain).connect(this.musicBus);
    gain.connect(this.reverbSend);
    source.start(now); source.stop(now + duration + 0.1);
  }

  gullCry() {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx; const now = ctx.currentTime + 0.1;
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.linearRampToValueAtTime(1380, now + 0.16);
    osc.frequency.linearRampToValueAtTime(720, now + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    osc.connect(gain).connect(this.musicBus); osc.start(now); osc.stop(now + 0.45);
  }

  engineHum(freq = 120, level = 0.014) {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx; const now = ctx.currentTime;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
    osc.connect(lp).connect(gain).connect(this.musicBus); osc.start(now); osc.stop(now + 1.6);
  }

  sheepBleat() {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx; const now = ctx.currentTime + 0.1;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(230, now);
    osc.frequency.linearRampToValueAtTime(170, now + 0.32);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.008, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(this.musicBus); osc.start(now); osc.stop(now + 0.45);
  }

  chime(freq = 880) {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx; const now = ctx.currentTime + 0.05;
    for (const [i, f] of [freq, freq * 1.5].entries()) {
      const osc = ctx.createOscillator(); osc.type = 'sine'; osc.frequency.value = f;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.008 / (i + 1), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc.connect(gain).connect(this.musicBus); osc.start(now); osc.stop(now + 0.65);
    }
  }

  setSfx(on) {
    this.settings.sfx = on;
    if (!this.ctx) return;
    this.sfxBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.sfxBus.gain.linearRampToValueAtTime(on ? this.volume.sfx : 0, this.ctx.currentTime + 0.2);
  }

  setVoice(on) {
    this.settings.voice = on;
    if (!on) {
      this.stopVoiceClips();
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    }
  }

  voicePreset() {
    return VOICE_PROFILES[this.voiceProfile] || VOICE_PROFILES.female_warm;
  }

  setVoiceProfile(key) {
    if (!VOICE_PROFILES[key]) return;
    this.voiceProfile = key;
    try { localStorage.setItem(VOICE_PROFILE_KEY, key); } catch { /* ignore */ }
    this.selectVoice();
    this.applyNativeProfile();
    this.voiceBuffers = new Map();
    this.voicePackProfile = '';
    this.loadVoicePack(key).catch(() => {});
    if (this.onVoiceProfileChange) this.onVoiceProfileChange(key);
  }

  applyNativeProfile() {
    if (!window.NativeBridge || typeof window.NativeBridge.setVoiceProfile !== 'function') return;
    try { window.NativeBridge.setVoiceProfile(this.voiceProfile); } catch { /* ignore */ }
  }

  setMaster(value) {
    this.volume.master = clamp(value, 0, 1);
    if (this.master) this.master.gain.value = this.volume.master;
  }

  /* ------------------------------ 轻音乐 ------------------------------ */

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBarTime = this.ctx.currentTime + 0.25;
    // 背景环境噪声（底噪/沙沙声）默认关闭；只保留音乐和牌桌音效。
    this.musicTimer = setInterval(() => this.scheduleMusic(), 260);
    this.scheduleMusic();
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.ambienceTimer) {
      clearInterval(this.ambienceTimer);
      this.ambienceTimer = null;
    }
    if (this.crackleGain && this.ctx) {
      this.crackleGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
    }
    if (this.ambienceGain && this.ctx) {
      this.ambienceGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.5);
    }
    if (this.ambienceSource) {
      try { this.ambienceSource.stop(this.ctx.currentTime + 0.6); } catch { /* */ }
      this.ambienceSource = null;
    }
  }

  startCrackle() {
    if (!this.ctx) return;
    if (this.crackleSource && this.crackleGain) {
      this.crackleGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.crackleGain.gain.linearRampToValueAtTime(0.012, this.ctx.currentTime + 0.4);
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.makeNoise(4);
    source.loop = true;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1500;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.012;
    source.connect(hp).connect(lp).connect(gain).connect(this.musicBus);
    source.start();
    this.crackleSource = source;
    this.crackleGain = gain;
  }

  startAmbience() {
    if (!this.ctx || this.ambienceSource) return;
    const source = this.ctx.createBufferSource();
    source.buffer = this.makeNoise(6);
    source.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.55;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.016;
    source.connect(bp).connect(lp).connect(gain).connect(this.musicBus);
    source.start();
    this.ambienceSource = source;
    this.ambienceGain = gain;
    this.ambienceFilter = bp;
    bp.frequency.value = this.sceneAmbienceFrequency();
    gain.gain.value = this.sceneAmbienceLevel();
    this.ambienceTimer = setInterval(() => this.sceneAmbientTick(), 6500);
  }

  chatterBurst() {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const duration = 1.3 + Math.random() * 1.5;
    const source = ctx.createBufferSource();
    source.buffer = this.makeNoise(duration);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 340 + Math.random() * 520;
    bp.Q.value = 1.05;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.018, now + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(bp).connect(gain).connect(this.musicBus);
    gain.connect(this.reverbSend);
    source.start(now);
    source.stop(now + duration + 0.1);
  }

  glassClink() {
    if (!this.ctx || !this.settings.music) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + Math.random() * 0.4;
    for (const [i, freq] of [1760, 2380].entries()) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const level = 0.010 / (i + 1);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(level, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain).connect(this.musicBus);
      gain.connect(this.reverbSend);
      osc.start(now);
      osc.stop(now + 0.55);
    }
  }

  stringNote(time, midi, duration, level = 0.016) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(midi);
    osc.detune.value = (Math.random() - 0.5) * 5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1500, time);
    filter.frequency.linearRampToValueAtTime(2100, time + duration * 0.4);
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.32);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 4.6;
    const vibratoGain = ctx.createGain();
    vibratoGain.gain.value = 2.8;
    vibrato.connect(vibratoGain).connect(osc.detune);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    gain.connect(this.reverbSend);
    osc.start(time);
    vibrato.start(time);
    osc.stop(time + duration + 0.1);
    vibrato.stop(time + duration + 0.1);
  }

  scheduleMusic() {
    if (!this.ctx) return;
    const horizon = this.ctx.currentTime + 1.1;
    while (this.nextBarTime < horizon) {
      this.scheduleBar(this.nextBarTime, this.barIndex);
      this.nextBarTime += this.bar;
      this.barIndex += 1;
    }
  }

  scheduleBar(time, index) {
    const chord = this.chords[index % this.chords.length];
    const padGain = 0.048;
    chord.forEach((midi, i) => {
      this.padNote(time, midi, this.bar * 0.94, padGain, (i - 2) * 0.18);
    });
    this.bassNote(time, chord[0] - 12, this.bar * 0.82, 0.058);

    const arpSteps = 6;
    for (let step = 0; step < arpSteps; step += 1) {
      const t = time + step * (this.bar / arpSteps) + 0.12;
      const note = chord[(step * 2 + index) % chord.length] + (step % 3 === 2 ? 12 : 0);
      this.pluck(t, note, step % 2 === 0 ? 0.038 : 0.029);
    }

    this.brush(time + this.beat * 1, 0.014);
    this.brush(time + this.beat * 3, 0.019);
    if (index % 4 === 2) {
      for (let i = 0; i < 3; i += 1) {
        this.pluck(time + this.bar - 0.3 + i * 0.11, chord[chord.length - 1 - i] + 12, 0.019);
      }
    }

    // 低音量弦乐短句：每三小节一次，酒吧里的古典底色，不抢牌桌音效
    if (index % 3 === 0) {
      const motif = index % 6 === 0 ? [62, 65, 69, 67] : [57, 60, 64, 62];
      motif.forEach((midi, i) => {
        this.stringNote(time + i * this.beat * 1.25, midi, this.beat * 1.3, 0.040);
      });
    }
  }

  padNote(time, midi, duration, level, pan = 0) {
    const ctx = this.ctx;
    const freq = midiToFreq(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, time);
    filter.frequency.linearRampToValueAtTime(1300, time + duration * 0.5);
    filter.Q.value = 0.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 1.4);
    gain.gain.setValueAtTime(level, time + duration * 0.72);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.5);

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = clamp(pan, -1, 1);

    const oscillators = [];
    const types = ['triangle', 'sine'];
    types.forEach((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = i === 0 ? -4 : 5;
      osc.connect(filter);
      osc.start(time);
      osc.stop(time + duration + 0.6);
      oscillators.push(osc);
    });
    filter.connect(gain);
    if (panner) gain.connect(panner);
    const out = panner || gain;
    out.connect(this.musicBus);
    out.connect(this.reverbSend);
  }

  pluck(time, midi, level) {
    const ctx = this.ctx;
    const freq = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const overtone = ctx.createOscillator();
    overtone.type = 'triangle';
    overtone.frequency.value = freq * 2.01;
    const overtoneGain = ctx.createGain();
    overtoneGain.gain.value = 0.25;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;

    osc.connect(filter);
    overtone.connect(overtoneGain).connect(filter);
    filter.connect(gain);
    gain.connect(this.musicBus);
    gain.connect(this.reverbSend);
    osc.start(time);
    overtone.start(time);
    osc.stop(time + 1);
    overtone.stop(time + 1);
  }

  bassNote(time, midi, duration, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(midi);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.12);
    gain.gain.setValueAtTime(level, time + duration * 0.55);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.25);
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start(time);
    osc.stop(time + duration + 0.3);
  }

  brush(time, level) {
    const ctx = this.ctx;
    if (!this.noiseBuffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3600;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    src.connect(filter).connect(gain).connect(this.musicBus);
    gain.connect(this.reverbSend);
    src.start(time, Math.random() * 1.5, 0.3);
  }

  /* ------------------------------ 牌桌音效 ------------------------------ */

  deal(pan = 0, strength = 1) {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) panner.pan.value = clamp(pan, -1, 1);
    const out = panner || ctx.createGain();
    if (panner) panner.connect(this.sfxBus);

    // 纸张滑过
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.85 + Math.random() * 0.35;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1700 + Math.random() * 900, now);
    filter.frequency.exponentialRampToValueAtTime(900, now + 0.12);
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.22 * strength, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    src.connect(filter).connect(gain).connect(out);
    src.start(now, Math.random() * 1.2, 0.25);

    // 落桌轻响
    const click = ctx.createOscillator();
    click.type = 'sine';
    click.frequency.setValueAtTime(1300 + Math.random() * 500, now + 0.07);
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, now + 0.07);
    clickGain.gain.linearRampToValueAtTime(0.035 * strength, now + 0.075);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    click.connect(clickGain).connect(out);
    click.start(now + 0.07);
    click.stop(now + 0.16);
  }

  flip(pan = 0) {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.004;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.sfxBus);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 1.1 + Math.random() * 0.3;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3200;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    src.connect(filter).connect(gain).connect(panner || this.sfxBus);
    src.start(now, Math.random(), 0.12);
  }

  chip(pan = 0, count = 3, level = 1) {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = clamp(pan, -1, 1);
      panner.connect(this.sfxBus);
    }
    for (let i = 0; i < count; i += 1) {
      const t = now + i * (0.028 + Math.random() * 0.035);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.playbackRate.value = 0.9 + Math.random() * 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 2600 + Math.random() * 1800;
      filter.Q.value = 3.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.13 * level, t + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(filter).connect(gain).connect(panner || this.sfxBus);
      src.start(t, Math.random() * 2, 0.06);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800 + Math.random() * 1200, t);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(0.022 * level, t + 0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      osc.connect(og).connect(panner || this.sfxBus);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  bet(pan = 0, amount = 0) {
    if (!this.ctx || !this.settings.sfx) return;
    this.chip(pan, 4 + Math.min(3, Math.floor(amount / 300)), 1.1);
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.035;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.075, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  check() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    for (let i = 0; i < 2; i += 1) {
      const now = ctx.currentTime + 0.01 + i * 0.1;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start(now, Math.random(), 0.1);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, now);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, now);
      og.gain.linearRampToValueAtTime(0.07, now + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(og).connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + 0.1);
    }
  }

  fold() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.005;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.4;
    filter.frequency.setValueAtTime(1300, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.28);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(now, Math.random(), 0.35);
  }

  allIn() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.01;
    const riser = ctx.createOscillator();
    riser.type = 'sine';
    riser.frequency.setValueAtTime(160, now);
    riser.frequency.exponentialRampToValueAtTime(760, now + 0.5);
    const rg = ctx.createGain();
    rg.gain.setValueAtTime(0.0001, now);
    rg.gain.linearRampToValueAtTime(0.05, now + 0.42);
    rg.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    riser.connect(rg).connect(this.sfxBus);
    riser.start(now);
    riser.stop(now + 0.56);

    this.chip(0, 10, 1.6);
    const impact = ctx.createOscillator();
    impact.type = 'sine';
    impact.frequency.setValueAtTime(95, now + 0.5);
    impact.frequency.exponentialRampToValueAtTime(48, now + 0.9);
    const ig = ctx.createGain();
    ig.gain.setValueAtTime(0.0001, now + 0.5);
    ig.gain.linearRampToValueAtTime(0.2, now + 0.51);
    ig.gain.exponentialRampToValueAtTime(0.0001, now + 1);
    impact.connect(ig).connect(this.sfxBus);
    impact.start(now + 0.5);
    impact.stop(now + 1.05);

    const shimmerFilter = ctx.createBiquadFilter();
    shimmerFilter.type = 'highpass';
    shimmerFilter.frequency.value = 2200;
    [1046, 1318, 1568].forEach((freq, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq;
      const g = ctx.createGain();
      const t = now + 0.52 + i * 0.05;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(shimmerFilter).connect(g).connect(this.sfxBus);
      g.connect(this.reverbSend);
      o.start(t);
      o.stop(t + 1);
    });
  }

  win() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.03;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const over = ctx.createOscillator();
      over.type = 'triangle';
      over.frequency.value = freq * 2;
      const og = ctx.createGain();
      og.gain.value = 0.18;
      const gain = ctx.createGain();
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.055, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain);
      over.connect(og).connect(gain);
      gain.connect(this.sfxBus);
      gain.connect(this.reverbSend);
      osc.start(t);
      over.start(t);
      osc.stop(t + 1.5);
      over.stop(t + 1.5);
    });
  }

  lose() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    [392, 349.23, 293.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.035, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      osc.connect(gain).connect(this.sfxBus);
      gain.connect(this.reverbSend);
      osc.start(t);
      osc.stop(t + 0.85);
    });
  }

  turn() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    [880, 1174.66].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      const t = now + i * 0.13;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.04, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      osc.connect(gain).connect(this.sfxBus);
      gain.connect(this.reverbSend);
      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  street() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 659.25;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.028, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(this.sfxBus);
    gain.connect(this.reverbSend);
    osc.start(now);
    osc.stop(now + 0.65);
  }

  click() {
    if (!this.ctx || !this.settings.sfx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.003;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1150, now);
    osc.frequency.exponentialRampToValueAtTime(760, now + 0.04);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.035, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  buttonSlide() {
    if (!this.ctx || !this.settings.sfx) return;
    this.chip(0, 1, 0.8);
  }

  /* ------------------------------ 术语播报 ------------------------------ */

  loadVoices() {
    if (!window.speechSynthesis) return;
    const collect = () => {
      this.voices = window.speechSynthesis.getVoices() || [];
      this.selectVoice();
    };
    collect();
    if (window.speechSynthesis.addEventListener) {
      window.speechSynthesis.addEventListener('voiceschanged', collect);
    }
  }

  selectVoice() {
    if (!window.speechSynthesis) return;
    const chinese = (this.voices || []).filter((voice) => /^zh/i.test(voice.lang));
    const profile = this.voicePreset();
    const femalePattern = /female|xiaoxiao|huihui|yaoyao|tingting|meijia|xiaoyi|女/i;
    const malePattern = /\bmale\b|yunxi|yunyang|kangkang|yunjian|男/i;
    const pattern = profile.gender === 'male' ? malePattern : femalePattern;
    const hints = Array.isArray(profile.voiceHints) ? profile.voiceHints : [];
    this.voice = chinese.find((voice) => hints.some((hint) => voice.name.toLowerCase().includes(hint)))
      || chinese.find((voice) => pattern.test(voice.name))
      || chinese[0]
      || null;
  }

  nameVoiceBase() {
    const raw = window.__ONLINE_BASE__ || window.__UPDATE_BASE__ || '';
    const base = String(raw).replace(/\/+$/, '');
    if (base) return base;
    return /^https?:/.test(location.protocol) ? location.origin : '';
  }

  async loadServerVoice(kind, text) {
    const clean = String(text || '').trim();
    if (!clean) return null;
    if (!this.ctx) this.init();
    if (!this.ctx) return null;
    const cache = kind === 'name' ? this.nameAudioCache : this.phraseAudioCache;
    const key = `${this.voiceProfile}|${clean}`;
    if (cache.has(key)) return cache.get(key);
    const base = this.nameVoiceBase();
    if (!base) return null;
    const param = kind === 'name' ? 'name' : 'text';
    const url = `${base}/api/voice/${kind}?profile=${encodeURIComponent(this.voiceProfile)}&${param}=${encodeURIComponent(clean)}`;
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`voice ${kind} HTTP ${response.status}`);
    const data = await response.arrayBuffer();
    if (!data.byteLength) throw new Error(`voice ${kind} empty`);
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    cache.set(key, buffer);
    return buffer;
  }

  async loadNameAudio(name) {
    return this.loadServerVoice('name', String(name || '').trim().slice(0, 12));
  }

  async loadPhraseAudio(text) {
    return this.loadServerVoice('phrase', String(text || '').trim().slice(0, 80));
  }

  preloadName(name) {
    this.loadNameAudio(name).catch(() => {});
  }

  speechRateForQueue() {
    const pending = this.speechQueue.length;
    return 1;
  }

  refreshSpeechRate() {
    // 保持原始语速：不做队列加速，也不修改正在播放音频的 playbackRate。
    this.currentSpeechRate = 1;
  }

  enqueueSpeech(item) {
    if (!item) return;
    this.speechQueue.push(item);
    this.refreshSpeechRate();
    this.processSpeechQueue();
  }

  trimSpeechBuffer(buffer) {
    if (!buffer || !buffer.length) return { start: 0, duration: 0 };
    const data = buffer.getChannelData(0);
    const threshold = 0.006;
    let first = 0;
    while (first < data.length && Math.abs(data[first]) < threshold) first += 1;
    let last = data.length - 1;
    while (last > first && Math.abs(data[last]) < threshold) last -= 1;
    if (first >= last) return { start: 0, duration: buffer.duration };
    const rate = buffer.sampleRate || 48000;
    const start = Math.max(0, first / rate - 0.015);
    const duration = Math.min(buffer.duration - start, (last - first) / rate + 0.045);
    return { start, duration: Math.max(0.08, duration) };
  }

  playBuffer(buffer, rate = 1) {
    return new Promise((resolve) => {
      if (!buffer || !this.ctx) { resolve(false); return; }
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      // 保持原音色：始终原速播放，不做任何倍率/音高变化。
      try { source.playbackRate.value = 1; } catch { /* ignore */ }
      source.connect(this.voiceBus || this.master);
      this.speechSources.push(source);
      const range = this.trimSpeechBuffer(buffer);
      const wall = range.duration;
      let finished = false;
      let timer = null;
      const finish = () => {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        const index = this.speechSources.indexOf(source);
        if (index >= 0) this.speechSources.splice(index, 1);
        resolve(true);
      };
      source.onended = finish;
      source.start(0, range.start);
      // stop 控制音频；setTimeout 控制队列。部分移动 WebView 的
      // onended 会晚于 stop 触发，不能只靠 onended 推进下一条。
      try { source.stop(this.ctx.currentTime + wall + 0.02); } catch { /* ignore */ }
      timer = setTimeout(finish, Math.max(60, wall * 1000 + 35));
    });
  }

  waitSpeech(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(120, ms)));
  }

  async playActionKeys(keys) {
    if (!keys.length) return false;
    const buffers = await this.loadVoicePack();
    if (!buffers) return false;
    let played = false;
    for (const key of keys) {
      const buffer = buffers.get(key);
      if (!buffer) continue;
      played = true;
      await this.playBuffer(buffer, this.currentSpeechRate);
    }
    return played;
  }

  speechBufferDuration(buffer) {
    return this.trimSpeechBuffer(buffer).duration;
  }

  async playBuffersInOrder(buffers, rate = 1, item = null) {
    let played = false;
    for (const buffer of buffers) {
      if (item && this.cancelledSpeechItems.has(item)) return played;
      if (!buffer) continue;
      played = true;
      await this.playBuffer(buffer, rate);
    }
    return played;
  }

  async performSpeech(item) {
    if (this.cancelledSpeechItems.has(item)) return;
    if (item.type === 'text') {
      const text = String(item.text || '').trim().slice(0, 80);
      if (!text) return;
      try {
        const buffer = await this.loadPhraseAudio(text);
        if (this.cancelledSpeechItems.has(item)) return;
        if (buffer) {
          if (item.onStart) { const fn = item.onStart; item.onStart = null; try { fn(); } catch { /* ignore */ } }
          await this.playBuffer(buffer, 1);
          return;
        }
      } catch { /* fall through */ }
      if (item.onStart) { const fn = item.onStart; item.onStart = null; try { fn(); } catch { /* ignore */ } }
      this.speakSystemText(text);
      await this.waitSpeech(520 + text.length * 150);
      return;
    }
    if (item.type !== 'action') return;
    const action = item.action;
    const actionText = PHRASES[action] || '';
    if (!actionText) return;
    const useEnglish = Boolean(EN_PHRASES[action]) && Math.random() < 0.5;
    const actionKey = useEnglish ? EN_ACTION_CLIP[action] : action;
    const keys = [];
    if (actionKey) keys.push(actionKey);
    // 只播称呼+操作，数字不再进入语音队列。
    const cleanName = String(item.name || '').trim().slice(0, 12);
    let nameBuffer = null;
    if (cleanName) {
      try { nameBuffer = await this.loadNameAudio(cleanName); } catch { nameBuffer = null; }
    }
    let actionBuffers = [];
    if (keys.length) {
      try {
        const pack = await this.loadVoicePack();
        if (pack) actionBuffers = keys.map((key) => pack.get(key)).filter(Boolean);
      } catch { actionBuffers = []; }
    }
    if (!actionBuffers.length) {
      const phrase = useEnglish ? EN_PHRASES[action] : actionText;
      if (nameBuffer) {
        await this.playBuffer(nameBuffer, 1);
        this.speakSystemText(phrase);
        await this.waitSpeech((420 + phrase.length * 140) / 1);
      } else {
        const fallbackText = `${cleanName ? `${cleanName} ` : ''}${phrase}`.trim();
        this.speakSystemText(fallbackText);
        await this.waitSpeech(520 + fallbackText.length * 150);
      }
      return;
    }

    // 硬预算：带数字 1.3s，不带数字 1.2s。先算裁剪后的音频长度，
    // 只有超出预算时才用统一的最小倍率收紧；未超预算完全保持原速。
    const totalDuration = (nameBuffer ? this.trimSpeechBuffer(nameBuffer).duration : 0)
      + actionBuffers.reduce((sum, buffer) => sum + this.trimSpeechBuffer(buffer).duration, 0);
    // 原音色：名称、操作、数字全部按 1.0 倍速播放。
    if (nameBuffer) {
      await this.playBuffer(nameBuffer, 1);
    } else if (cleanName) {
      this.speakSystemText(cleanName);
      await this.waitSpeech(360 + cleanName.length * 180);
    }
    if (this.cancelledSpeechItems.has(item)) return;
    await this.playBuffersInOrder(actionBuffers, 1, item);
  }

  async processSpeechQueue() {
    if (this.speechBusy) return;
    this.speechBusy = true;
    while (this.speechQueue.length) {
      const item = this.speechQueue[0];
      this.currentSpeechItem = item;
      this.refreshSpeechRate();
      try { await this.performSpeech(item); } catch (error) { console.warn('[voice] speech failed', error?.message || error); }
      if (this.speechQueue[0] === item) this.speechQueue.shift();
      this.currentSpeechItem = null;
      this.refreshSpeechRate();
    }
    this.speechBusy = false;
    this.currentSpeechRate = 1;
  }

  speakSettlementNow(text, onStart = null) {
    const clean = String(text || '').trim().slice(0, 80);
    if (!clean) return;
    // 结算拥有最高优先级：立即停掉正在播报的操作，并清空所有未播内容。
    for (const item of this.speechQueue) this.cancelledSpeechItems.add(item);
    if (this.currentSpeechItem) this.cancelledSpeechItems.add(this.currentSpeechItem);
    for (const source of [...this.speechSources]) {
      try { source.stop(); } catch { /* ignore */ }
    }
    this.speechQueue = [{ type: 'text', text: clean, kind: 'settlement', onStart }];
    this.refreshSpeechRate();
    if (!this.speechBusy) this.processSpeechQueue();
  }

  cancelSettlement() {
    const active = this.currentSpeechItem?.kind === 'settlement';
    for (const item of this.speechQueue) {
      if (item.kind === 'settlement') this.cancelledSpeechItems.add(item);
    }
    if (active) {
      this.speechQueue = [this.currentSpeechItem, ...this.speechQueue.slice(1).filter((item) => item.kind !== 'settlement')];
      for (const source of [...this.speechSources]) {
        try { source.stop(); } catch { /* ignore */ }
      }
    } else {
      this.speechQueue = this.speechQueue.filter((item) => item.kind !== 'settlement');
    }
    this.refreshSpeechRate();
  }

  speak(action, amount = 0, name = '') {
    if (!this.settings.voice) return;
    if (!PHRASES[action]) return;
    // Queue every action. Never cancel a previous player's name/action just
    // because the next player acted quickly.
    this.enqueueSpeech({ type: 'action', action, amount: Number(amount) || 0, name: String(name || '') });
  }

  async loadVoicePack(profile = this.voiceProfile) {
    if (!profile) return null;
    if (this.voicePackProfile === profile && this.voiceBuffers.size) return this.voiceBuffers;
    if (this.voicePackPromise && this.voicePackProfile === profile) return this.voicePackPromise;
    if (!this.ctx) this.init();
    if (!this.ctx) return null;
    const token = profile;
    this.voicePackProfile = profile;
    this.voicePackPromise = (async () => {
      const entries = VOICE_CLIP_KEYS.map((key) => [key, voiceClipUrl(profile, key)]);
      const buffers = new Map();
      await Promise.all(entries.map(async ([key, url]) => {
        try {
          const response = await fetch(url, { cache: 'force-cache' });
          if (!response.ok) return;
          const arrayBuffer = await response.arrayBuffer();
          if (!arrayBuffer) return;
          const buffer = await this.ctx.decodeAudioData(arrayBuffer);
          buffers.set(key, buffer);
        } catch (error) {
          console.warn('[voice] clip load failed', profile, key, error?.message || error);
        }
      }));
      if (token !== this.voiceProfile) return buffers;
      this.voiceBuffers = buffers;
      this.voicePackPromise = null;
      return buffers;
    })();
    return this.voicePackPromise;
  }

  stopVoiceClips() {
    for (const source of this.voiceSources) {
      try { source.stop(); } catch { /* 忽略 */ }
    }
    this.voiceSources = [];
  }

  async playVoiceKeys(keys = []) {
    if (!this.settings.voice) return;
    if (!this.ctx) this.init();
    if (!this.ctx) throw new Error('audio unavailable');
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    const buffers = await this.loadVoicePack();
    if (!buffers) throw new Error('voice pack unavailable');
    this.stopVoiceClips();
    const now = this.ctx.currentTime + 0.02;
    let at = now;
    for (const key of keys) {
      const buffer = buffers.get(key);
      if (!buffer) continue;
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.voiceBus || this.master);
      source.start(at);
      at += buffer.duration + 0.008;
      this.voiceSources.push(source);
    }
    if (!this.voiceSources.length) throw new Error('voice clip missing');
  }

  async speakVoiceDemo() {
    if (!this.settings.voice) return;
    try {
      await this.playVoiceKeys(['demo']);
    } catch {
      this.speakSystemText('试听播报，阿凯加注到一百五十');
    }
  }

  achievementUnlock() {
    if (!this.settings.sfx) return;
    if (!this.ctx) this.init();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.02;
    const bus = this.sfxBus || this.master;
    if (!bus) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = index === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.09);
      gain.gain.setValueAtTime(0.0001, now + index * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.09 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.09 + 0.62);
      osc.connect(gain);
      gain.connect(bus);
      osc.start(now + index * 0.09);
      osc.stop(now + index * 0.09 + 0.7);
    });
    const low = ctx.createOscillator();
    const lowGain = ctx.createGain();
    low.type = 'sine';
    low.frequency.setValueAtTime(130.81, now);
    low.frequency.exponentialRampToValueAtTime(65.41, now + 0.5);
    lowGain.gain.setValueAtTime(0.11, now);
    lowGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    low.connect(lowGain);
    lowGain.connect(bus);
    low.start(now);
    low.stop(now + 0.85);
  }

  speakText(text, options = {}) {
    if (!this.settings.voice || !text) return;
    if (String(text).includes('试听播报')) {
      this.speakVoiceDemo();
      return;
    }
    // Settlement/achievement messages also go through the same queue and
    // the same selected voice, so they are not dropped by action chatter.
    this.enqueueSpeech({ type: 'text', text: String(text).slice(0, 80), kind: options.kind || 'system' });
  }

  speakSystemText(text) {
    if (!this.settings.voice || !text) return;
    console.info('[voice]', text);
    if (window.NativeBridge && typeof window.NativeBridge.speak === 'function') {
      try {
        this.applyNativeProfile();
        const ready = typeof window.NativeBridge.isReady === 'function'
          ? window.NativeBridge.isReady()
          : true;
        if (ready) {
          const result = window.NativeBridge.speak(text);
          if (result === 0 || result === undefined) return;
          console.warn('[voice] native speak failed', result);
        } else {
          console.warn('[voice] native tts not ready');
        }
      } catch (error) {
        console.warn('[voice] native bridge error', error);
      }
    }
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        const preset = this.voicePreset();
        // 保持用户选中的同一个音色；英文也交给该音色朗读。
        utter.lang = this.voice?.lang || 'zh-CN';
        utter.rate = preset.rate;
        utter.pitch = preset.pitch;
        utter.volume = 0.9;
        if (this.voice) utter.voice = this.voice;
        window.speechSynthesis.speak(utter);
        return;
      } catch (error) {
        console.warn('[voice] web speech failed', error);
      }
    }
    if (this.onFallback) this.onFallback(text);
  }
}

export const audio = new PokerAudio();
