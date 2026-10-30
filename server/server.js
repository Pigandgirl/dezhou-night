'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { GameEngine } = require('./lib/game-engine');
const rateLimit = require('./lib/rate-limit');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const APK_DIR = path.join(PUBLIC_DIR, 'apk');
const APP_DIR = path.join(PUBLIC_DIR, 'app');
const DATA_DIR = path.join(ROOT, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const execFileAsync = promisify(execFile);
const NAME_TTS_SCRIPT = path.join(ROOT, 'tts-name.cjs');
const NAME_TTS_PROFILES = new Set(['female_warm','female_bright','female_sweet','female_mature','male_deep','male_warm','male_clear','male_uncle']);
const nameTtsJobs = new Map();

const rooms = new Map();
const MATCH_CODES = ['801', '802', '803', '804'];
const MATCH_SEATS = 8;
const MATCH_MIN_PLAYERS = 2;
const MATCH_MIN_POINTS = 100;
const MATCH_COUNTDOWN_MS = 60 * 1000;
const DAILY_POINTS = 100;
const DAILY_PLAYS = 5;
const REGISTER_PLAYS = 10;
const PLAYS_PER_YUAN = 10;
const POINTS_PER_YUAN = 100;
const RECHARGE_ENABLED = process.env.RECHARGE_ENABLED === '1';
const CHIPS_DEFAULT = 100;
const CHIP_REFILL_DEFAULT_MINUTES = 60;
const CHIP_GRANT_DEFAULT = 100;
const CHIP_GRANT_MAX = 100;
const CHIP_REFILL_MIN_MINUTES = 1;
const CHIP_REFILL_MAX_MINUTES = 24 * 60;
const CHIPS_MAX = 100000;
const FEATURE_DEFAULTS = { matchEnabled: true, lanEnabled: true };
const ADMIN_USER = String(process.env.ADMIN_USER || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || '').replace(/\/+$/, '');
const MAX_ROOMS = Math.max(32, Number(process.env.MAX_ROOMS || 600));
const MAX_ROOMS_PER_USER = 3;
const MAX_SSE = Math.max(64, Number(process.env.MAX_SSE || 2000));
const MAX_SSE_PER_ROOM = Math.max(16, Number(process.env.MAX_SSE_PER_ROOM || 64));
const MAX_SPECTATORS = 32;
const MAX_SSE_BUFFER = 1024 * 1024;
const RL_REGISTER = Math.max(1, Number(process.env.RL_REGISTER || 20));
const RL_LOGIN_IP = Math.max(1, Number(process.env.RL_LOGIN_IP || 40));
const RL_ROOM_CREATE = Math.max(1, Number(process.env.RL_ROOM_CREATE || 10));
const RL_ROOM_JOIN = Math.max(1, Number(process.env.RL_ROOM_JOIN || 120));
const RL_MATCH_JOIN = Math.max(1, Number(process.env.RL_MATCH_JOIN || 120));
const OFFLINE_SEAT_MS = 90 * 1000;
const EMPTY_ROOM_MS = 60 * 1000;

const store = {
  users: new Map(),
  history: [],
  meta: { currentDay: '', lastHonor: null, features: { ...FEATURE_DEFAULTS } },
};
const tokenIndex = new Map();
const adminTokens = new Map();
const userRooms = new Map();
const presence = new Map();
const PRESENCE_TTL = 45 * 1000;
const SSE_OFFLINE_GRACE_MS = 90 * 1000;
const loginFailures = new Map();
let sseCount = 0;

/* ---------------- 持久化 ---------------- */

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validUsername(value) {
  const name = String(value || '').trim();
  return /^[\w\u4e00-\u9fa5]{3,16}$/.test(name) ? name : '';
}

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    for (const user of raw.users || []) {
      if (!user) continue;
      if (!user.username && user.phone) {
        user.username = String(user.phone);
        delete user.phone;
      }
      const key = normalizeUsername(user.username);
      if (!key) continue;
      if (!Number.isFinite(user.chips)) user.chips = CHIPS_DEFAULT;
      if (!Number.isFinite(user.chipsAt)) user.chipsAt = Date.now();
      if (!Number.isFinite(user.plays)) user.plays = DAILY_PLAYS;
      if (!Number.isFinite(user.points)) user.points = 0;
      if (!Array.isArray(user.tokens)) user.tokens = [];
      store.users.set(key, user);
    }
    store.history = Array.isArray(raw.history) ? raw.history.slice(0, 500) : [];
    Object.assign(store.meta, raw.meta || {});
    store.meta.features = {
      matchEnabled: store.meta.features?.matchEnabled !== false,
      lanEnabled: store.meta.features?.lanEnabled !== false,
    };
    const refillMinutes = Number(store.meta.chipRefillMinutes);
    store.meta.chipRefillMinutes = Number.isFinite(refillMinutes)
      ? Math.max(CHIP_REFILL_MIN_MINUTES, Math.min(CHIP_REFILL_MAX_MINUTES, Math.floor(refillMinutes)))
      : CHIP_REFILL_DEFAULT_MINUTES;
    const refillGrant = Number(store.meta.chipGrant);
    store.meta.chipGrant = Number.isFinite(refillGrant)
      ? Math.max(1, Math.min(CHIPS_MAX, Math.floor(refillGrant)))
      : CHIP_GRANT_DEFAULT;
    for (const user of store.users.values()) {
      for (const entry of user.tokens) {
        if (entry && entry.token) tokenIndex.set(entry.token, normalizeUsername(user.username));
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[store] load failed', error.message);
  }
}

let saveTimer = null;
let storeDirty = false;

function saveStore() {
  storeDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!storeDirty) return;
    storeDirty = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({
        users: [...store.users.values()],
        history: store.history,
        meta: store.meta,
      }));
      fs.renameSync(tmp, STORE_FILE);
    } catch (error) {
      console.error('[store] save failed', error.message);
    }
  }, 500);
  if (saveTimer.unref) saveTimer.unref();
}

/* ---------------- 账户 ---------------- */

const DAY_FORMATTER = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function dayKey() {
  return DAY_FORMATTER.format(new Date());
}

const scryptAsync = (password, salt, keylen) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, keylen, (error, derived) => {
    if (error) reject(error);
    else resolve(derived);
  });
});

async function makeHash(password) {
  const salt = crypto.randomBytes(8).toString('hex');
  const hash = (await scryptAsync(password, salt, 32)).toString('hex');
  return `${salt}:${hash}`;
}

async function checkHash(password, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    if (!salt || !hash) return false;
    const other = (await scryptAsync(password, salt, 32)).toString('hex');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(other, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function issueToken(user) {
  const value = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const all = (user.tokens || []).filter((entry) => entry && entry.token);
  const valid = all.filter((entry) => now - entry.at < 30 * 24 * 60 * 60 * 1000);
  const kept = valid.slice(-4);
  for (const entry of all) {
    if (!kept.includes(entry)) tokenIndex.delete(entry.token);
  }
  kept.push({ token: value, at: now });
  user.tokens = kept;
  tokenIndex.set(value, normalizeUsername(user.username));
  saveStore();
  return value;
}

function revokeToken(token) {
  const key = tokenIndex.get(token);
  if (!key) return;
  tokenIndex.delete(token);
  const user = store.users.get(key);
  if (user) {
    user.tokens = (user.tokens || []).filter((entry) => entry.token !== token);
    saveStore();
  }
}

function revokeAllTokens(user) {
  const key = normalizeUsername(user.username);
  for (const [token, indexKey] of [...tokenIndex.entries()]) {
    if (indexKey === key) tokenIndex.delete(token);
  }
  user.tokens = [];
  saveStore();
}

function userByToken(token) {
  if (!token) return null;
  const key = tokenIndex.get(token);
  return key ? store.users.get(key) || null : null;
}

function tokenFrom(req, body, url) {
  const header = req.headers.authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  if (bearer) return bearer[1].trim();
  if (body && body.token) return String(body.token);
  if (url) return url.searchParams.get('token') || '';
  return '';
}

function chipRefillConfig() {
  const rawMinutes = Number(store.meta.chipRefillMinutes);
  const rawGrant = Number(store.meta.chipGrant);
  const minutes = Number.isFinite(rawMinutes)
    ? Math.max(CHIP_REFILL_MIN_MINUTES, Math.min(CHIP_REFILL_MAX_MINUTES, Math.floor(rawMinutes)))
    : CHIP_REFILL_DEFAULT_MINUTES;
  const grant = Number.isFinite(rawGrant)
    ? Math.max(1, Math.min(CHIP_GRANT_MAX, Math.floor(rawGrant)))
    : CHIP_GRANT_DEFAULT;
  return { minutes, grant, ms: minutes * 60 * 1000 };
}

function chipIntervalLabel(minutes) {
  return minutes % 60 === 0 ? `${minutes / 60} 小时` : `${minutes} 分钟`;
}

function ensureChips(user) {
  const now = Date.now();
  const config = chipRefillConfig();
  if (!Number.isFinite(user.chips)) user.chips = CHIPS_DEFAULT;
  if (!Number.isFinite(user.chipsAt)) user.chipsAt = now;
  if (now - user.chipsAt < config.ms) return false;
  // 每小时检测一次：只有低于目标值时补足到目标值，绝不叠加多份。
  const periods = Math.max(1, Math.floor((now - user.chipsAt) / config.ms));
  user.chipsAt += periods * config.ms;
  if ((user.chips || 0) < config.grant) {
    user.chips = Math.min(CHIPS_MAX, config.grant);
  }
  saveStore();
  return true;
}

function features() {
  const matchEnabled = store.meta.features?.matchEnabled !== false;
  const lanEnabled = store.meta.features?.lanEnabled !== false;
  const chipConfig = chipRefillConfig();
  return {
    matchEnabled,
    lanEnabled,
    onlineEnabled: matchEnabled && lanEnabled,
    chipRefillMinutes: chipConfig.minutes,
    chipGrant: chipConfig.grant,
  };
}

function isAdminUser(user) {
  return Boolean(ADMIN_USER && user
    && normalizeUsername(user.username) === ADMIN_USER);
}

function accountView(user) {
  const career = ensureCareer(user);
  return {
    username: user.username,
    isAdmin: isAdminUser(user),
    name: user.name,
    activeTitle: career.activeTitle || '',
    career: {
      hands: career.hands || 0,
      wins: career.wins || 0,
      currentStreak: career.currentStreak || 0,
      bestStreak: career.bestStreak || 0,
      titleCount: (career.titles || []).length,
    },
    plays: user.plays || 0,
    chips: Number.isFinite(user.chips) ? user.chips : CHIPS_DEFAULT,
    chipsRefillAt: (user.chipsAt || Date.now()) + chipRefillConfig().ms,
    chipRefillMinutes: chipRefillConfig().minutes,
    chipGrant: chipRefillConfig().grant,
    rounds: user.rounds || 0,
    totalRecharge: user.totalRecharge || 0,
    honors: user.honors || [],
    createdAt: user.createdAt || 0,
  };
}


/* -------------------------------------------------------------------------- */
/* Career, achievements, daily progress and friend-room chip rewards          */
/* -------------------------------------------------------------------------- */

const FRIEND_CHIP_REWARD = 5;
const FRIEND_CHIP_DAILY_CAP = 100;
const SINGLE_POINTS_PER_MIN = 2;
const SINGLE_POINTS_DAILY_CAP = 120;
const LOBBY_POINTS_PER_MIN = 1;
const LOBBY_POINTS_DAILY_CAP = 60;
const CAREER_HAND_KEYS = [
  'royalFlush', 'straightFlush', 'fourOfKind', 'fullHouse', 'flush',
  'straight', 'threeOfKind', 'twoPair', 'onePair', 'highCard',
];
const HAND_NAME_TO_KEY = {
  royalFlush: 'royalFlush',
  straightFlush: 'straightFlush',
  fourOfKind: 'fourOfKind',
  fullHouse: 'fullHouse',
  flush: 'flush',
  straight: 'straight',
  threeOfKind: 'threeOfKind',
  twoPair: 'twoPair',
  onePair: 'onePair',
  highCard: 'highCard',
};
const progressSessions = new Map();
const MATCH_SCENES = ['yacht', 'bus', 'grassland', 'airplane', 'night_market'];
const MAX_ACHIEVEMENTS_PER_HAND = 1;
const MAX_ACHIEVEMENTS_PER_MATCH = 2;
const MIN_HANDS_BETWEEN_ACHIEVEMENTS = 3;

const ACHIEVEMENTS = require('./shared/achievements.json').entries;
const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((item) => [item.id, item]));


function ensureCareer(user) {
  if (!user.career || typeof user.career !== 'object') user.career = {};
  const c = user.career;
  for (const key of ['hands','wins','ties','losses','friendWins','onlineWins','onlineHands','friendHands','allInWins','foldWins','showdownWins','comebackWins','biggestPot','highestChips','currentStreak','bestStreak','totalChipsEarned','daysPlayed','folds']) {
    if (!Number.isFinite(c[key])) c[key] = 0;
  }
  c.highestChips = Math.max(c.highestChips || 0, Number(user.chips) || 0);
  if (!c.handTypeWins || typeof c.handTypeWins !== 'object') c.handTypeWins = {};
  for (const key of CAREER_HAND_KEYS) if (!Number.isFinite(c.handTypeWins[key])) c.handTypeWins[key] = 0;
  if (!c.companions || typeof c.companions !== 'object') c.companions = {};
  if (!c.winsByOpponent || typeof c.winsByOpponent !== 'object') c.winsByOpponent = {};
  if (!c.sceneWins || typeof c.sceneWins !== 'object') c.sceneWins = {};
  if (!c.scenesPlayed || typeof c.scenesPlayed !== 'object') c.scenesPlayed = {};
  if (!Array.isArray(c.days)) c.days = [];
  if (!Array.isArray(c.achievements)) c.achievements = [];
  if (!c.achievementAt || typeof c.achievementAt !== 'object') c.achievementAt = {};
  if (!Array.isArray(c.titles)) c.titles = [];
  if (!c.activeTitle) c.activeTitle = '';
  if (!Array.isArray(c.chipLedger)) c.chipLedger = [];
  if (!Number.isFinite(c.lastChips)) c.lastChips = Number.isFinite(user.chips) ? user.chips : CHIPS_DEFAULT;
  if (!c.lastHandKey) c.lastHandKey = '';
  if (!Number.isFinite(c.lowestStackSeen)) c.lowestStackSeen = 0;
  if (!Number.isFinite(c.lastAchievementHand)) c.lastAchievementHand = 0;
  return c;
}

function ensureDailyProgress(user) {
  const today = dayKey();
  if (!user.dailyProgress || user.dailyProgress.date !== today) {
    user.dailyProgress = { date: today, friendChips: 0, singleChips: 0, lobbyChips: 0 };
  }
  const d = user.dailyProgress;
  // Compatibility with the previous points-based daily counters.
  if (!Number.isFinite(d.singleChips)) d.singleChips = Number(d.singlePoints) || 0;
  if (!Number.isFinite(d.lobbyChips)) d.lobbyChips = Number(d.lobbyPoints) || 0;
  d.friendChips = Number.isFinite(d.friendChips) ? d.friendChips : 0;
  return d;
}

function recordChipLedger(user, delta, source, meta = {}) {
  const c = ensureCareer(user);
  if (!delta) return;
  c.chipLedger.unshift({
    at: Date.now(),
    delta: Math.round(delta),
    balance: Math.round(Number(user.chips) || 0),
    source: String(source || 'unknown'),
    roomCode: meta.roomCode ? String(meta.roomCode) : '',
    handNo: Number(meta.handNo) || 0,
  });
  c.chipLedger = c.chipLedger.slice(0, 80);
  c.highestChips = Math.max(c.highestChips || 0, Number(user.chips) || 0);
  if (delta > 0) c.totalChipsEarned = (c.totalChipsEarned || 0) + Math.round(delta);
  c.lastChips = Number(user.chips) || 0;
}

function addLobbyPoints(user, amount, source) {
  const points = Math.max(0, Math.floor(Number(amount) || 0));
  if (!points) return 0;
  user.points = (user.points || 0) + points;
  user.todayPoints = (user.todayPoints || 0) + points;
  const c = ensureCareer(user);
  c.pointsEarned = (c.pointsEarned || 0) + points;
  c.lastPointsAt = Date.now();
  return points;
}

function addFriendChips(user, amount, room, handNo) {
  const daily = ensureDailyProgress(user);
  const remain = Math.max(0, FRIEND_CHIP_DAILY_CAP - daily.friendChips);
  const award = Math.min(Math.max(0, Math.floor(amount)), remain);
  if (!award) return 0;
  user.chips = Math.min(CHIPS_MAX, (Number(user.chips) || 0) + award);
  daily.friendChips += award;
  recordChipLedger(user, award, 'friend_win', { roomCode: room?.code, handNo });
  return award;
}

function addActivityChips(user, amount, source) {
  const daily = ensureDailyProgress(user);
  const cap = source === 'single' ? SINGLE_POINTS_DAILY_CAP : LOBBY_POINTS_DAILY_CAP;
  const used = source === 'single' ? daily.singleChips : daily.lobbyChips;
  const remain = Math.max(0, cap - used);
  const award = Math.min(Math.max(0, Math.floor(Number(amount) || 0)), remain);
  if (!award) return 0;
  user.chips = Math.min(CHIPS_MAX, (Number(user.chips) || 0) + award);
  if (source === 'single') daily.singleChips += award;
  else daily.lobbyChips += award;
  const career = ensureCareer(user);
  career.highestChips = Math.max(career.highestChips || 0, user.chips || 0);
  recordChipLedger(user, award, source === 'single' ? 'single_play' : 'lobby_stay', {});
  return award;
}

function awardFriendHand(room) {
  if (!room || room.match !== false || !room.game) return new Map();
  const game = room.game;
  const humans = game.players.filter((p) => p.userKey && store.users.has(p.userKey));
  const distinct = new Set(humans.map((p) => p.userKey));
  if (distinct.size < 2) return new Map();
  const winners = humans.filter((p) => Number(p.won) > 0);
  const rewards = new Map();
  const rewardKey = `${room.code}:${game.handNo}`;
  for (const player of winners) {
    if (rewards.has(player.userKey)) continue;
    const user = store.users.get(player.userKey);
    if (!user) continue;
    const career = ensureCareer(user);
    if (career.lastFriendRewardKey === rewardKey) continue;
    career.lastFriendRewardKey = rewardKey;
    if (!career.lastFriendRewardAt) career.lastFriendRewardAt = 0;
    const award = addFriendChips(user, FRIEND_CHIP_REWARD, room, game.handNo);
    rewards.set(player.userKey, award);
  }
  return rewards;
}

function companionshipKey(user) {
  return normalizeUsername(user.username);
}

function updateCompanions(user, c, game, players, won) {
  for (const other of players) {
    if (!other.userKey || other.userKey === user.username) continue;
    const key = normalizeUsername(other.userKey);
    if (!c.companions[key]) {
      c.companions[key] = {
        username: key,
        name: other.name || key,
        hands: 0,
        winsTogether: 0,
        days: [],
        lastPlayedAt: 0,
      };
    }
    const entry = c.companions[key];
    entry.name = other.name || entry.name;
    entry.hands += 1;
    if (won) entry.winsTogether += 1;
    const day = dayKey();
    if (!entry.days.includes(day)) entry.days = [...entry.days.slice(-60), day];
    entry.lastPlayedAt = Date.now();
  }
}

function recordCareerHand(room) {
  const game = room?.game;
  if (!game) return new Map();
  const humans = game.players.filter((p) => p.userKey && store.users.has(p.userKey));
  if (!humans.length) return new Map();
  const handKey = `${room.code}:${game.handNo}`;
  const winners = humans.filter((p) => Number(p.won) > 0);
  const split = winners.length > 1;
  const updates = new Map();
  for (const player of humans) {
    const user = store.users.get(player.userKey);
    if (!user) continue;
    const c = ensureCareer(user);
    if (c.lastHandKey === handKey) continue;
    c.lastHandKey = handKey;
    const won = Number(player.won) > 0;
    c.hands += 1;
    if (room.match) c.onlineHands = (c.onlineHands || 0) + 1;
    else c.friendHands = (c.friendHands || 0) + 1;
    const todayKey = dayKey();
    if (!Array.isArray(c.days)) c.days = [];
    if (!c.days.includes(todayKey)) {
      c.days = [...c.days.slice(-400), todayKey];
      c.daysPlayed = c.days.length;
    }
    const sceneKey = room.scene || 'private';
    c.scenesPlayed[sceneKey] = (c.scenesPlayed[sceneKey] || 0) + 1;
    if (player.folded) c.folds = (c.folds || 0) + 1;
    if (won) {
      c.sceneWins[sceneKey] = (c.sceneWins[sceneKey] || 0) + 1;
      if (player.allIn) c.allInWins = (c.allInWins || 0) + 1;
      c.wins += 1;
      c.currentStreak += 1;
      c.bestStreak = Math.max(c.bestStreak, c.currentStreak);
      if (split) c.ties += 1;
      if (room.match) c.onlineWins += 1;
      else c.friendWins += 1;
      if (!game.showdown) c.foldWins += 1;
      else c.showdownWins += 1;
      if (Number(player.startStack) <= 10) c.comebackWins += 1;
      if (game.showdown) {
        const category = Number(player.handCategory);
        const typeKey = ['highCard','onePair','twoPair','threeOfKind','straight','flush','fullHouse','fourOfKind','straightFlush'][category] || '';
        if (typeKey) c.handTypeWins[typeKey] = (c.handTypeWins[typeKey] || 0) + 1;
        if (category === 8 && Number(player.score && player.score[1]) === 14) {
          c.handTypeWins.royalFlush = (c.handTypeWins.royalFlush || 0) + 1;
          c.handTypeWins.straightFlush = Math.max(0, (c.handTypeWins.straightFlush || 0) - 1);
        }
      }
      for (const other of humans) {
        if (other.userKey === player.userKey) continue;
        const key = normalizeUsername(other.userKey);
        c.winsByOpponent[key] = (c.winsByOpponent[key] || 0) + 1;
      }
    } else {
      c.currentStreak = 0;
      c.losses += 1;
    }
    c.biggestPot = Math.max(c.biggestPot || 0, Number(game.settlement?.pot) || 0);
    updateCompanions(user, c, game, humans, won);
    const currentChips = Number(user.chips) || 0;
    const previous = Number.isFinite(c.lastChips) ? c.lastChips : currentChips;
    if (currentChips !== previous) {
      recordChipLedger(user, currentChips - previous, room.match ? 'match_result' : 'table_result', {
        roomCode: room.code, handNo: game.handNo,
      });
    }
    c.highestChips = Math.max(c.highestChips || 0, currentChips);
    c.lastChips = currentChips;
    updates.set(player.userKey, { user, newAchievements: [] });
  }
  return updates;
}

function careerMetricValue(user, career, metric, context = {}) {
  if (metric === 'titlesUnlocked') return career.achievements.length;
  if (metric === 'handTypesCount') return Object.values(career.handTypeWins || {}).filter((n) => Number(n) > 0).length;
  if (metric === 'companions') return Object.keys(career.companions || {}).length;
  if (metric === 'maxCompanionHands') {
    return Math.max(0, ...Object.values(career.companions || {}).map((e) => Number(e.hands) || 0));
  }
  if (metric === 'maxRivalWins') {
    return Math.max(0, ...Object.values(career.winsByOpponent || {}).map((n) => Number(n) || 0));
  }
  if (metric === 'chips') return Number(user.chips) || 0;
  if (metric === 'sceneWins') return Number(career.sceneWins?.[context.scene] || 0);
  if (metric.startsWith('sceneWins.')) return Number(career.sceneWins?.[metric.slice(10)] || 0);
  if (metric.startsWith('handTypeWins.')) return Number(career.handTypeWins?.[metric.slice(13)] || 0);
  return Number(career[metric]) || 0;
}

function evaluateAchievements(user, context = {}) {
  const c = ensureCareer(user);
  const unlocked = [];
  for (const item of ACHIEVEMENTS) {
    if (c.achievements.includes(item.id)) continue;
    if (item.scope === 'online' && !context.match) continue;
    if (item.scope === 'friend' && context.match) continue;
    let value = 0;
    try { value = careerMetricValue(user, c, item.condition?.metric || '', context); } catch { value = 0; }
    const target = Number(item.condition?.value) || 0;
    const op = item.condition?.op || '>=';
    const ok = op === '>=' ? value >= target : op === '>' ? value > target : value === target;
    if (!ok) continue;
    unlocked.push(item);
  }
  // 同一手只允许一个候选；5★优先，其余按星级/条件值排序。
  unlocked.sort((a, b) => (Number(b.star) - Number(a.star))
    || (Number(b.condition?.value) - Number(a.condition?.value))
    || String(a.id).localeCompare(String(b.id)));
  return unlocked.slice(0, MAX_ACHIEVEMENTS_PER_HAND);
}

function addTitleChips(user, amount, source) {
  const award = Math.max(0, Math.floor(Number(amount) || 0));
  if (!award) return 0;
  user.chips = Math.min(CHIPS_MAX, (Number(user.chips) || 0) + award);
  const c = ensureCareer(user);
  c.highestChips = Math.max(c.highestChips || 0, user.chips || 0);
  recordChipLedger(user, award, source, {});
  return award;
}

function careerView(user) {
  const c = ensureCareer(user);
  const daily = ensureDailyProgress(user);
  const companions = Object.values(c.companions || {})
    .map((entry) => ({
      username: entry.username,
      name: entry.name,
      hands: entry.hands || 0,
      winsTogether: entry.winsTogether || 0,
      days: (entry.days || []).length,
      intimacy: Math.min(100, (entry.hands || 0) + (entry.winsTogether || 0) * 2 + (entry.days || []).length * 3),
      lastPlayedAt: entry.lastPlayedAt || 0,
    }))
    .sort((a, b) => b.intimacy - a.intimacy || b.hands - a.hands)
    .slice(0, 3);
  return {
    username: user.username,
    name: user.name,
    chips: Number(user.chips) || 0,
    highestChips: c.highestChips || 0,
    activeTitle: c.activeTitle || '',
    stats: {
      hands: c.hands || 0,
      wins: c.wins || 0,
      ties: c.ties || 0,
      losses: c.losses || 0,
      winRate: c.hands ? Math.round(((c.wins || 0) / c.hands) * 1000) / 10 : 0,
      currentStreak: c.currentStreak || 0,
      bestStreak: c.bestStreak || 0,
      biggestPot: c.biggestPot || 0,
      friendWins: c.friendWins || 0,
      onlineWins: c.onlineWins || 0,
      onlineHands: c.onlineHands || 0,
      friendHands: c.friendHands || 0,
      allInWins: c.allInWins || 0,
      totalChipsEarned: c.totalChipsEarned || 0,
      daysPlayed: c.daysPlayed || 0,
      handTypesCount: Object.values(c.handTypeWins || {}).filter((n) => Number(n) > 0).length,
      folds: c.folds || 0,
      foldWins: c.foldWins || 0,
      comebackWins: c.comebackWins || 0,
    },
    handTypes: { ...c.handTypeWins },
    sceneWins: { ...c.sceneWins },
    scenesPlayed: { ...c.scenesPlayed },
    achievements: [...c.achievements],
    achievementAt: { ...c.achievementAt },
    titles: [...c.titles],
    companions,
    chipLedger: c.chipLedger.slice(0, 50),
    daily: {
      ...daily,
      friendChipCap: FRIEND_CHIP_DAILY_CAP,
      singleChipCap: SINGLE_POINTS_DAILY_CAP,
      lobbyChipCap: LOBBY_POINTS_DAILY_CAP,
      friendChips: daily.friendChips,
      singleChips: daily.singleChips,
      lobbyChips: daily.lobbyChips,
    },
  };
}

function ensureDaily(user) {
  ensureChips(user);
  const today = dayKey();
  if (user.todayDate === today) return false;
  user.todayDate = today;
  user.todayPoints = DAILY_POINTS;
  user.points = (user.points || 0) + DAILY_POINTS;
  user.plays = (user.plays || 0) + DAILY_PLAYS;
  saveStore();
  return true;
}

function rollDay() {
  const today = dayKey();
  if (store.meta.currentDay === today) return;
  if (store.meta.currentDay) {
    let top = null;
    for (const user of store.users.values()) {
      const score = user.todayPoints || 0;
      if (score > 0 && (!top || score > (top.todayPoints || 0))) top = user;
    }
    if (top) {
      top.honors = [
        { date: store.meta.currentDay, title: '今日积分之最', points: top.todayPoints || 0 },
        ...(top.honors || []),
      ].slice(0, 20);
      store.meta.lastHonor = {
        username: top.username,
        name: top.name,
        points: top.todayPoints || 0,
        date: store.meta.currentDay,
      };
    }
  }
  store.meta.currentDay = today;
  for (const user of store.users.values()) {
    user.todayDate = today;
    user.todayPoints = DAILY_POINTS;
    user.points = (user.points || 0) + DAILY_POINTS;
    user.plays = (user.plays || 0) + DAILY_PLAYS;
  }
  saveStore();
}

function grantPlays(user, plays, points, yuan) {
  user.plays = (user.plays || 0) + plays;
  user.points = (user.points || 0) + points;
  user.todayPoints = (user.todayPoints || 0) + points;
  user.totalRecharge = (user.totalRecharge || 0) + yuan;
  saveStore();
}

/* ---------------- 通用响应 ---------------- */

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(self), geolocation=()',
};

function json(res, status, payload, extra = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Client-Version,X-Client-Version-Name',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extra,
  });
  res.end(body);
}

function text(res, status, body, type = 'text/plain; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    ...extra,
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let done = false;
    const chunks = [];
    const fail = (message) => {
      if (done) return;
      done = true;
      reject(new Error(message));
      req.destroy();
    };
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        fail('body too large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

function token() {
  return crypto.randomBytes(16).toString('hex');
}

function roomCode() {
  for (let i = 0; i < 300; i += 1) {
    const code = String(crypto.randomInt(100, 1000));
    if (!rooms.has(code) && !MATCH_CODES.includes(code)) return code;
  }
  const error = new Error('no room code available');
  error.code = 'NO_ROOM_CODE';
  throw error;
}

function sanitizeName(value) {
  const name = String(value || '')
    .replace(/[\u0000-\u001f<>&"']/g, '')
    .trim()
    .slice(0, 12);
  return name || '玩家';
}

function roomSummary(room) {
  const players = [...room.players.values()].filter((p) => !p.spectator);
  return {
    code: room.code,
    name: room.name,
    seats: room.seats,
    players: players.length,
    spectators: room.players.size - players.length,
    started: room.started,
    match: Boolean(room.match),
    startingChips: room.startingChips || 100,
    sb: room.sb || 1,
    bb: room.bb || 2,
    loserSpectate: Boolean(room.loserSpectate),
    minPlayers: room.match ? MATCH_MIN_PLAYERS : 2,
  };
}

function frameFor(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function writeToClient(record, frame) {
  if (!record || !record.res || record.res.destroyed || record.res.writableEnded) return false;
  try {
    if (record.res.writableLength > MAX_SSE_BUFFER) {
      record.res.destroy();
      return false;
    }
    record.res.write(frame);
    return true;
  } catch {
    try { record.res.destroy(); } catch { /* 忽略 */ }
    return false;
  }
}

function broadcast(room, event, payload) {
  const frame = frameFor(event, payload);
  for (const record of room.clients.values()) writeToClient(record, frame);
}

function spectatorState(state) {
  return {
    ...state,
    spectator: true,
    // 观战/被淘汰的玩家也必须看到本手结算，不能只让赢家看。
    // 仍然隐藏其底牌与最佳牌，只保留公开结算信息。
    settlement: state.phase === 'settle' ? state.settlement : null,
    seats: (state.seats || []).map((seat) => ({
      ...seat,
      hole: undefined,
      bestCards: [],
      score: [],
      handDetail: '',
      revealed: false,
    })),
  };
}

function broadcastState(room, state) {
  const normalFrame = frameFor('state', state);
  let hiddenFrame = null;
  let waitingFrame = null;
  for (const [token, record] of room.clients) {
    const player = room.players.get(token);
    if (player && player.spectator) {
      if (!hiddenFrame) hiddenFrame = frameFor('state', spectatorState(state));
      writeToClient(record, hiddenFrame);
    } else if (player && player.waitingNext) {
      if (!waitingFrame) waitingFrame = frameFor('state', { ...spectatorState(state), waitingNext: true });
      writeToClient(record, waitingFrame);
    } else {
      writeToClient(record, normalFrame);
    }
  }
}

function broadcastPlayers(room) {
  broadcast(room, 'players', {
    code: room.code,
    started: room.started,
    match: Boolean(room.match),
    name: room.name,
    seats: room.seats,
    startingChips: room.startingChips || 100,
    sb: room.sb || 1,
    bb: room.bb || 2,
    loserSpectate: Boolean(room.loserSpectate),
    minPlayers: room.match ? MATCH_MIN_PLAYERS : 2,
    countdownEnd: room.countdownEnd || 0,
    countdownMs: MATCH_COUNTDOWN_MS,
    players: [...room.players.values()].map((p) => ({
      pid: p.pid,
      name: p.name,
      spectator: p.spectator,
      waitingNext: Boolean(p.waitingNext),
      ready: p.ready,
      online: Boolean(p.online),
      host: p.token === room.hostToken,
      chips: p.userKey ? (store.users.get(p.userKey) || {}).chips || 0 : null,
    })),
  });
}


function directTo(room, playerOrToken, event, data) {
  const playerToken = typeof playerOrToken === 'string' ? playerOrToken : playerOrToken.token;
  const record = room.clients.get(playerToken);
  if (!record) return false;
  return writeToClient(record, frameFor(event, data));
}

/* ---------------- 房间 ---------------- */

function createMatchRoom(code, index) {
  const room = {
    code,
    name: `匹配 ${index} 号房`,
    password: '000',
    seats: MATCH_SEATS,
    hostToken: '',
    started: false,
    match: true,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    nextPid: 1,
    players: new Map(),
    clients: new Map(),
    game: null,
    historyId: '',
    countdownEnd: 0,
    countdownTimer: null,
    voice: new Set(),
  };
  rooms.set(code, room);
  return room;
}

function ensureMatchRooms() {
  MATCH_CODES.forEach((code, index) => {
    if (!rooms.has(code)) createMatchRoom(code, index + 1);
  });
}

function matchPlayers(room) {
  return [...room.players.values()].filter((p) => !p.spectator);
}

function clearMatchCountdown(room) {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
  }
  room.countdownEnd = 0;
}

function checkMatchCountdown(room) {
  if (!room.match || room.started) {
    clearMatchCountdown(room);
    return;
  }
  const count = matchPlayers(room).filter((p) => p.online).length;
  if (count < MATCH_MIN_PLAYERS) {
    if (room.countdownEnd) {
      clearMatchCountdown(room);
      broadcastPlayers(room);
    }
    return;
  }
  if (room.countdownEnd) return;
  room.countdownEnd = Date.now() + MATCH_COUNTDOWN_MS;
  room.countdownTimer = setTimeout(() => autoStartMatch(room), MATCH_COUNTDOWN_MS);
  if (typeof room.countdownTimer.unref === 'function') room.countdownTimer.unref();
  broadcastPlayers(room);
}

function autoStartMatch(room) {
  if (!room.match || room.started) return;
  const result = startRoomGame(room, true);
  if (!result.ok) {
    clearMatchCountdown(room);
    broadcast(room, 'notice', { message: result.error || '开局失败' });
    broadcastPlayers(room);
  }
}

// 匹配房：所有已准备玩家都在线时立即开局。
// 关键：SSE 短暂掉线会让 p.online=false，恢复连接后必须再检查一次，否则会永久卡在“双方已准备”。
function startIfAllReady(room) {
  if (!room.match || room.started || room.game) return { ok: false, skipped: true };
  // 只要求仍在线且已准备的玩家；离线/已退出的人不能再阻塞开局。
  const readyPlayers = [...room.players.values()]
    .filter((p) => !p.spectator && p.ready && p.online);
  if (readyPlayers.length < MATCH_MIN_PLAYERS) return { ok: false, skipped: true };
  if (readyPlayers.length < [...room.players.values()].filter((p) => !p.spectator && p.online).length) {
    // 还有在线玩家没准备：走正常等待/倒计时，不立即开局。
    return { ok: false, skipped: true };
  }
  const latest = currentAppVersion();
  const mismatch = latest.versionCode
    ? readyPlayers.find((p) => p.versionCode && p.versionCode !== latest.versionCode)
    : null;
  if (mismatch) {
    return {
      ok: false,
      error: `版本不一致：${mismatch.name} 是 v${mismatch.versionCode}，当前最新 v${latest.versionCode}，请更新后再开局`,
    };
  }
  return startRoomGame(room, false);
}

function gameDeps(room) {
  return {
    getUser: (key) => store.users.get(key),
    save: saveStore,
    broadcast: (event, data) => (event === 'state' ? broadcastState(room, data) : broadcast(room, event, data)),
    direct: (player, data) => directTo(room, player, 'direct', data),
    playersChanged: () => broadcastPlayers(room),
    onSettle: ({ players }) => {
      bumpHistory(room);
      const careerUpdates = recordCareerHand(room);
      const rewards = awardFriendHand(room);
      for (const [userKey, update] of careerUpdates) {
        const user = update.user;
        const player = [...room.players.values()].find((p) => p.userKey === userKey);
        const careerState = ensureCareer(user);
        const roomAwards = room.achievementAwards || new Map();
        room.achievementAwards = roomAwards;
        const awardedThisMatch = roomAwards.get(userKey) || 0;
        const sinceLast = (careerState.hands || 0) - (careerState.lastAchievementHand || 0);
        let unlocked = [];
        if (awardedThisMatch < MAX_ACHIEVEMENTS_PER_MATCH && sinceLast >= MIN_HANDS_BETWEEN_ACHIEVEMENTS) {
          unlocked = evaluateAchievements(user, { match: Boolean(room.match), scene: room.scene || 'private' });
        }
        const granted = [];
        for (const item of unlocked) {
          if (!careerState.achievements.includes(item.id)) careerState.achievements.push(item.id);
          careerState.achievementAt[item.id] = Date.now();
          if (!careerState.titles.includes(item.id)) careerState.titles.push(item.id);
          careerState.lastAchievementHand = careerState.hands || 0;
          roomAwards.set(userKey, awardedThisMatch + 1);
          const reward = addTitleChips(user, item.rewardChips, 'title_reward');
          granted.push({ ...item, reward });
          if (Number(item.star) === 5 && player) {
            const playerName = user.name || user.username;
            broadcast(room, 'achievement_broadcast', {
              id: item.id,
              title: item.title,
              star: item.star,
              playerName,
              share: 100,
              at: Date.now(),
            });
            for (const member of room.players.values()) {
              if (!member.userKey || !member.online) continue;
              const memberUser = store.users.get(member.userKey);
              if (!memberUser) continue;
              addTitleChips(memberUser, 100, 'five_star_share');
              directTo(room, member, 'reward', { chips: 100, source: 'five_star_share', title: item.title });
              directTo(room, member, 'account', accountView(memberUser));
              directTo(room, member, 'career', careerView(memberUser));
            }
          }
        }
        const career = careerView(user);
        if (player) {
          directTo(room, player, 'career', career);
          for (const item of granted) {
            // 5-star is announced through the room-wide broadcast below.
            if (Number(item.star) === 5) continue;
            directTo(room, player, 'achievement', {
              id: item.id,
              title: item.title,
              star: item.star,
              reward: item.reward,
              playerName: user.name || user.username,
              at: Date.now(),
            });
          }
        }
        update.newAchievements = granted;
      }
      for (const [rewardKey, amount] of rewards) {
        if (!amount) continue;
        const rewardPlayer = [...room.players.values()].find((p) => p.userKey === rewardKey);
        if (rewardPlayer) directTo(room, rewardPlayer, 'reward', { chips: amount, source: 'friend_win' });
      }
      for (const entry of players) {
        const player = room.players.get(entry.token);
        if (!player) continue;
        directTo(room, player, 'account', accountView(entry.user));
      }
      saveStore();
      broadcastPlayers(room);
      room.lastActivity = Date.now();
    },
    onGameOver: (reason) => handleGameOver(room, reason),
    log: (...args) => console.log('[game]', room.code, ...args),
  };
}

function startRoomGame(room, auto) {
  if (room.game) return { ok: true };
  room.achievementAwards = new Map();
  if (room.match) {
    const previous = room.scene;
    const choices = MATCH_SCENES.filter((id) => id !== previous);
    room.scene = choices[Math.floor(Math.random() * choices.length)] || 'yacht';
  } else {
    room.scene = 'private';
  }
  for (const p of room.players.values()) {
    if (!p.userKey) continue;
    const user = store.users.get(p.userKey);
    if (!user) continue;
    const career = ensureCareer(user);
    career.lastChips = Number(user.chips) || 0;
  }
  const online = [...room.players.values()].filter((p) => !p.spectator && p.online);
  if (online.length < MATCH_MIN_PLAYERS) {
    return { ok: false, error: `至少需要 ${MATCH_MIN_PLAYERS} 位在线玩家` };
  }
  clearMatchCountdown(room);
  room.started = true;
  room.startedAt = Date.now();
  room.lastActivity = Date.now();
  startHistory(room);
  const game = new GameEngine(room, gameDeps(room));
  const result = game.start();
  if (!result.ok) {
    game.dispose();
    room.started = false;
    endHistory(room, 'start failed');
    room.historyId = '';
    return result;
  }
  room.game = game;
  broadcastPlayers(room);
  broadcast(room, 'started', { code: room.code, match: Boolean(room.match), auto: Boolean(auto) });
  return { ok: true };
}

function restartFriendRoom(room) {
  if (!room || room.match) return { ok: false, error: '在线匹配房间不能重新分配筹码' };
  const oldPlayers = room.game && Array.isArray(room.game.players) ? room.game.players : [];
  const tokens = new Set(oldPlayers.map((player) => player.token).filter(Boolean));
  if (room.game) {
    room.game.dispose();
    room.game = null;
  }
  room.started = false;
  room.startedAt = 0;
  room.countdownEnd = 0;
  for (const [token, player] of room.players) {
    if (tokens.size && !tokens.has(token) && player.spectator) continue;
    if (!tokens.size && player.spectator) continue;
    player.spectator = false;
    player.playChips = Math.max(20, Number(room.startingChips) || 100);
    player.ready = false;
  }
  const result = startRoomGame(room, false);
  if (!result.ok) {
    room.started = false;
    return result;
  }
  return { ok: true };
}

function handleGameOver(room, reason) {
  if (room.game) {
    room.game.dispose();
    room.game = null;
  }
  room.started = false;
  endHistory(room, reason);
  if (room.match) {
    resetMatchRoom(room, reason || '对局结束');
    return;
  }
  broadcast(room, 'gameover', { reason: reason || '对局结束' });
  broadcastPlayers(room);
}

/* ---------------- 对局历史 ---------------- */

function startHistory(room) {
  const players = [...room.players.values()].filter((p) => !p.spectator);
  const entry = {
    id: `${room.code}-${Date.now().toString(36)}`,
    code: room.code,
    name: room.name,
    match: Boolean(room.match),
    startedAt: Date.now(),
    endedAt: 0,
    hands: 0,
    reason: '',
    players: players.map((p) => ({
      pid: p.pid,
      name: p.name,
      username: p.userKey || '',
      chips: p.userKey ? (store.users.get(p.userKey) || {}).chips || 0 : 0,
    })),
  };
  store.history.unshift(entry);
  store.history = store.history.slice(0, 500);
  room.historyId = entry.id;
  saveStore();
  return entry;
}

function historyByRoom(room) {
  return store.history.find((entry) => entry.id === room.historyId) || null;
}

function bumpHistory(room) {
  const entry = historyByRoom(room);
  if (entry) {
    entry.hands += 1;
    saveStore();
  }
}

function endHistory(room, reason, players) {
  const entry = historyByRoom(room);
  if (!entry || entry.endedAt) return;
  entry.endedAt = Date.now();
  entry.reason = reason || '';
  if (players) entry.playersEnd = players.map((p) => ({ pid: p.pid, name: p.name, username: p.userKey || '', chips: p.chips || 0 }));
  saveStore();
}

function resetMatchRoom(room, reason) {
  if (room.game) {
    room.game.dispose();
    room.game = null;
  }
  endHistory(room, reason || 'room reset');
  clearMatchCountdown(room);
  broadcast(room, 'closed', { reason: reason || 'room reset', match: true });
  for (const record of room.clients.values()) {
    record.closed = true;
    if (record.heartbeat) clearInterval(record.heartbeat);
    try { record.res.end(); } catch { /* 忽略 */ }
  }
  sseCount = Math.max(0, sseCount - room.clients.size);
  room.clients.clear();
  for (const player of room.players.values()) removeUserRoom(player);
  room.players.clear();
  room.hostToken = '';
  room.started = false;
  room.nextPid = 1;
  room.createdAt = Date.now();
  room.lastActivity = Date.now();
  room.historyId = '';
  if (room.voice) room.voice.clear();
  if (room.voiceRelays) {
    for (const relay of [...room.voiceRelays.values()]) closeVoiceRelay(relay);
    room.voiceRelays.clear();
  }
}

function closeRoom(room, reason) {
  if (room.game) {
    room.game.dispose();
    room.game = null;
  }
  endHistory(room, reason || 'room closed');
  broadcast(room, 'closed', { reason: reason || 'room closed' });
  if (room.voice) room.voice.clear();
  if (room.voiceRelays) {
    for (const relay of [...room.voiceRelays.values()]) closeVoiceRelay(relay);
    room.voiceRelays.clear();
  }
  for (const record of room.clients.values()) {
    record.closed = true;
    if (record.heartbeat) clearInterval(record.heartbeat);
    try { record.res.end(); } catch { /* 忽略 */ }
  }
  sseCount = Math.max(0, sseCount - room.clients.size);
  room.clients.clear();
  for (const player of room.players.values()) removeUserRoom(player);
  room.players.clear();
  rooms.delete(room.code);
}

function transferHost(room) {
  const current = room.hostToken ? room.players.get(room.hostToken) : null;
  if (current && current.online) return;
  const next = [...room.players.values()].find((p) => p.online && !p.spectator)
    || [...room.players.values()].find((p) => !p.spectator);
  if (!next) {
    room.hostToken = '';
    return;
  }
  room.hostToken = next.token;
  broadcast(room, 'host', { pid: next.pid, name: next.name });
}

const VOICE_WS_MAGIC = 0x50435631;

function broadcastVoicePcm(room, senderToken, pid, seq, pcm) {
  if (pcm && pcm.length) {
    const header = Buffer.allocUnsafe(8);
    header.writeUInt32BE(VOICE_WS_MAGIC, 0);
    header.writeUInt16BE(pid & 0xffff, 4);
    header.writeUInt16BE(seq & 0xffff, 6);
    const packet = Buffer.concat([header, pcm]);
    if (room.voiceRelays) {
      for (const [token, peer] of room.voiceRelays) {
        if (token === senderToken) continue;
        wsSend(peer, packet, 0x2);
      }
    }
  }
  broadcast(room, 'voicepcm', {
    from: pid,
    data: pcm ? pcm.toString('base64') : '',
  });
}

function voicePeerView(room, pid) {
  const player = [...room.players.values()].find((p) => p.pid === pid);
  return player ? { pid: player.pid, name: player.name } : null;
}

const MAX_VOICE_SPEAKERS = 8;

function broadcastVoiceSpeakers(room) {
  const speakers = [...(room.voiceSpeakers || new Map()).entries()]
    .map(([pid, item]) => ({ pid: Number(pid), name: item.name || '' }))
    .filter((item) => item.name);
  const signature = speakers.map((item) => `${item.pid}:${item.name}`).join('|');
  if (room.voiceSpeakerSignature === signature) return;
  room.voiceSpeakerSignature = signature;
  broadcast(room, 'voice-active', {
    speakers,
    pid: speakers.length === 1 ? speakers[0].pid : 0,
    name: speakers.map((item) => item.name).join('、'),
  });
}

function touchVoiceSpeaker(room, player) {
  if (!room || !player) return;
  if (!room.voiceSpeakers) room.voiceSpeakers = new Map();
  room.voiceSpeakers.set(player.pid, { name: player.name, lastAt: Date.now() });
  broadcastVoiceSpeakers(room);
  if (room.voiceSpeakerTimer) return;
  room.voiceSpeakerTimer = setInterval(() => {
    const cutoff = Date.now() - 1000;
    let changed = false;
    for (const [pid, item] of room.voiceSpeakers) {
      if (Number(item.lastAt) < cutoff) {
        room.voiceSpeakers.delete(pid);
        changed = true;
      }
    }
    if (changed) broadcastVoiceSpeakers(room);
    if (!room.voiceSpeakers.size) {
      clearInterval(room.voiceSpeakerTimer);
      room.voiceSpeakerTimer = null;
      room.voiceSpeakerSignature = '';
      broadcast(room, 'voice-active', { speakers: [], pid: 0, name: '' });
    }
  }, 400);
  if (room.voiceSpeakerTimer.unref) room.voiceSpeakerTimer.unref();
}

function voiceClaim(room, player) {
  // 多路语音：不再抢麦，所有已加入语音频道的玩家都能同时发送。
  touchVoiceSpeaker(room, player);
  return true;
}

function voiceRelease(room, player) {
  if (!room || !player) return;
  if (room.voiceSpeakers) {
    room.voiceSpeakers.delete(player.pid);
    broadcastVoiceSpeakers(room);
  }
}

function voiceLeave(room, player) {
  if (!player || !room.voice || !room.voice.has(player.pid)) return;
  room.voice.delete(player.pid);
  player.voice = false;
  voiceRelease(room, player);
  broadcast(room, 'voice', { kind: 'leave', from: player.pid, name: player.name });
}

function leaveRoom(room, playerToken) {
  const player = room.players.get(playerToken);
  if (!player) return false;
  voiceLeave(room, player);
  if (room.voiceRelays?.has(playerToken)) {
    closeVoiceRelay(room.voiceRelays.get(playerToken));
    room.voiceRelays.delete(playerToken);
  }
  const record = room.clients.get(playerToken);
  if (record) {
    record.closed = true;
    if (record.heartbeat) clearInterval(record.heartbeat);
    try { record.res.end(); } catch { /* 忽略 */ }
    room.clients.delete(playerToken);
    sseCount = Math.max(0, sseCount - 1);
  }
  room.players.delete(playerToken);
  removeUserRoom(player);
  if (room.game) room.game.removePlayer(playerToken);

  if (playerToken === room.hostToken) {
    room.hostToken = '';
    const remaining = [...room.players.values()].filter((p) => !p.spectator);
    if (remaining.length) {
      transferHost(room);
      broadcastPlayers(room);
      if (room.match) checkMatchCountdown(room);
      return false;
    }
    if (room.match) {
      broadcastPlayers(room);
      if (!room.players.size) resetMatchRoom(room, 'room empty');
      return true;
    }
    closeRoom(room, 'host left');
    return true;
  }

  broadcastPlayers(room);
  if (room.match) checkMatchCountdown(room);
  if (!room.match && room.players.size === 0) closeRoom(room, 'room empty');
  return false;
}

function addPlayer(room, { name, userKey, spectator }) {
  const playerToken = token();
  const pid = room.nextPid++;
  const player = {
    token: playerToken,
    pid,
    name: sanitizeName(name),
    userKey: userKey || '',
    spectator: Boolean(spectator),
    seatNo: -1,
    ready: false,
    voice: false,
    online: false,
    joinedAt: Date.now(),
  };
  if (!spectator) {
    const preferred = [0, 4, 1, 2, 3, 5, 6, 7];
    const used = new Set([...room.players.values()].filter((p) => p.seatNo >= 0).map((p) => p.seatNo));
    player.seatNo = preferred.find((seat) => !used.has(seat));
    if (player.seatNo === undefined) player.seatNo = -1;
  }
  room.players.set(playerToken, player);
  if (!room.hostToken) room.hostToken = playerToken;
  if (userKey && !spectator) userRooms.set(userKey, { code: room.code, token: playerToken });
  return player;
}

function markWaitingForNext(room, player) {
  if (!room || !player || !room.started || player.spectator) return;
  player.waitingNext = true;
  if (room.game && room.game.phase === 'settle') {
    room.game.checkNextReady();
  }
}

function removeUserRoom(player) {
  if (!player || !player.userKey) return;
  const entry = userRooms.get(player.userKey);
  if (entry && entry.token === player.token) userRooms.delete(player.userKey);
}

function otherRoomFor(userKey, code) {
  const entry = userRooms.get(userKey);
  if (!entry) return null;
  if (entry.code === code) return null;
  const room = rooms.get(entry.code);
  if (!room || !room.players.has(entry.token)) {
    userRooms.delete(userKey);
    return null;
  }
  return room;
}

/* ---------------- 文件服务 ---------------- */

const STATIC_COMPRESS_CACHE = new Map();
const COMPRESSIBLE_TYPE = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/i;

function compressedAsset(filePath, stat) {
  const key = `${filePath}|${stat.size}|${stat.mtimeMs}`;
  const cached = STATIC_COMPRESS_CACHE.get(key);
  if (cached) return cached;
  const buffer = fs.readFileSync(filePath);
  const gzip = zlib.gzipSync(buffer, { level: 6 });
  let brotli = null;
  try {
    brotli = zlib.brotliCompressSync(buffer, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 5,
        [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
      },
    });
  } catch { /* 某些文件格式不支持时保留 gzip */ }
  const entry = {
    buffer,
    gzip,
    brotli,
    etag: `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`,
  };
  // 只保留当前文件的最近版本，避免构建迭代导致内存增长。
  for (const oldKey of STATIC_COMPRESS_CACHE.keys()) {
    if (oldKey.startsWith(`${filePath}|`)) STATIC_COMPRESS_CACHE.delete(oldKey);
  }
  STATIC_COMPRESS_CACHE.set(key, entry);
  return entry;
}

function cleanVoiceText(value, max = 80) {
  return String(value || '')
    .replace(/[<>&"']/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function handleVoiceTts(req, res, url, { param = 'name', max = 12, subdir = 'names' } = {}) {
  if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return; }
  const profile = String(url.searchParams.get('profile') || '');
  const name = cleanVoiceText(url.searchParams.get(param), max);
  if (!NAME_TTS_PROFILES.has(profile) || !name) {
    json(res, 400, { error: 'bad voice text request' });
    return;
  }
  const cacheDir = path.join(PUBLIC_DIR, 'web', 'voice', subdir, profile);
  const hash = crypto.createHash('sha256').update(`${profile}|${name}`).digest('hex').slice(0, 32);
  const filePath = path.join(cacheDir, `${hash}.mp3`);
  if (fs.existsSync(filePath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    serveFile(req, res, filePath, 'audio/mpeg');
    return;
  }
  const key = `${profile}|${name}`;
  let job = nameTtsJobs.get(key);
  if (!job) {
    job = (async () => {
      await fs.promises.mkdir(cacheDir, { recursive: true });
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'poker-name-'));
      try {
        await execFileAsync(process.execPath, [NAME_TTS_SCRIPT, profile, name, tempDir], {
          timeout: 25000,
          maxBuffer: 4 * 1024 * 1024,
        });
        const generated = path.join(tempDir, 'audio.mp3');
        const stat = await fs.promises.stat(generated);
        if (!stat.isFile() || stat.size < 200) throw new Error('empty tts audio');
        const tmpTarget = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.promises.copyFile(generated, tmpTarget);
        await fs.promises.rename(tmpTarget, filePath);
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        nameTtsJobs.delete(key);
      }
    })();
    nameTtsJobs.set(key, job);
  }
  try {
    await job;
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    serveFile(req, res, filePath, 'audio/mpeg');
  } catch (error) {
    console.warn('[name-tts]', profile, name, error.message || error);
    json(res, 503, { error: 'name voice unavailable' });
  }
}

function serveFile(req, res, filePath, contentType) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      json(res, 404, { error: 'not found' });
      return;
    }
    const isHtml = contentType.startsWith('text/html');
    const headers = {
      ...SECURITY_HEADERS,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': (isHtml || /javascript|manifest/i.test(contentType))
        ? 'no-cache, must-revalidate'
        : (/audio\/|image\//i.test(contentType) ? 'public, max-age=86400' : 'public, max-age=3600'),
      'Last-Modified': stat.mtime.toUTCString(),
      'Access-Control-Allow-Origin': '*',
    };
    if (isHtml) {
      headers['Content-Security-Policy'] = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' data: blob:",
        "connect-src 'self' data: blob:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
      ].join('; ');
    }

    let compressed = null;
    try {
      if (stat.size > 1024 && COMPRESSIBLE_TYPE.test(contentType) && !req.headers.range) {
        compressed = compressedAsset(filePath, stat);
      }
    } catch (error) {
      console.warn('[static] compression failed', filePath, error.message);
    }

    const accept = String(req.headers['accept-encoding'] || '');
    let body = null;
    let encoding = '';
    if (compressed) {
      if (accept.includes('br') && compressed.brotli) {
        body = compressed.brotli;
        encoding = 'br';
      } else if (accept.includes('gzip')) {
        body = compressed.gzip;
        encoding = 'gzip';
      }
    }
    const etag = compressed
      ? `${compressed.etag.slice(0, -1)}-${encoding || 'raw'}"`
      : `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    headers.ETag = etag;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }

    if (body) {
      headers['Content-Encoding'] = encoding;
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = body.length;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') res.end();
      else res.end(body);
      return;
    }

    const range = req.headers.range;
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      if (match) {
        const startByte = match[1] ? Number(match[1]) : 0;
        const endByte = match[2] ? Number(match[2]) : stat.size - 1;
        if (startByte >= stat.size || endByte >= stat.size || startByte > endByte) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          'Content-Range': `bytes ${startByte}-${endByte}/${stat.size}`,
          'Content-Length': endByte - startByte + 1,
        });
        if (req.method === 'HEAD') res.end();
        else fs.createReadStream(filePath, { start: startByte, end: endByte }).pipe(res);
        return;
      }
    }

    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filePath).pipe(res);
  });
}

function warmStaticCompression() {
  const files = [
    [path.join(PUBLIC_DIR, 'web', 'index.html'), 'text/html; charset=utf-8'],
    [path.join(PUBLIC_DIR, 'admin', 'index.html'), 'text/html; charset=utf-8'],
  ];
  for (const [filePath, type] of files) {
    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) return;
      try {
        compressedAsset(filePath, stat);
        console.log(`[static] compressed warm ${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`);
      } catch (error) {
        console.warn('[static] warm compression failed', error.message);
      }
    });
  }
}

function publicOrigin(req) {
  if (PUBLIC_ORIGIN) return PUBLIC_ORIGIN;
  const host = String(req.headers.host || '').trim();
  if (/^[a-z0-9.\-]+(:\d{1,5})?$/i.test(host)) return `http://${host}`;
  return `http://127.0.0.1:${PORT}`;
}

let latestManifestCache = null;

function readLatestManifest() {
  const file = path.join(APP_DIR, 'latest.json');
  const stat = fs.statSync(file);
  if (latestManifestCache && latestManifestCache.mtimeMs === stat.mtimeMs) {
    return latestManifestCache.data;
  }
  const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  latestManifestCache = { mtimeMs: stat.mtimeMs, data };
  return data;
}

function currentAppVersion() {
  try {
    const data = readLatestManifest();
    return {
      versionCode: Number(data.versionCode || 0),
      versionName: String(data.versionName || ''),
    };
  } catch {
    return { versionCode: 0, versionName: '' };
  }
}

function clientVersion(req, url) {
  const header = Number(req.headers?.['x-client-version'] || 0);
  if (Number.isFinite(header) && header > 0) return Math.floor(header);
  const query = Number(url?.searchParams?.get('v') || 0);
  return Number.isFinite(query) && query > 0 ? Math.floor(query) : 0;
}

function requireCurrentVersion(req, res, url) {
  const latest = currentAppVersion();
  if (!latest.versionCode) return true;
  const version = clientVersion(req, url);
  if (version >= latest.versionCode) return true;
  json(res, 426, {
    error: `版本不一致：当前客户端 v${version || '未知'}，最新版本 v${latest.versionCode}（${latest.versionName}）。请更新后再联机。`,
    code: 'VERSION_MISMATCH',
    latestVersionCode: latest.versionCode,
    latestVersionName: latest.versionName,
  });
  return false;
}

function appManifest(req) {
  const data = readLatestManifest();
  return {
    versionCode: Number(data.versionCode || 0),
    versionName: String(data.versionName || ''),
    notes: String(data.notes || ''),
    sha256: String(data.sha256 || ''),
    size: Number(data.size || 0),
    url: `${publicOrigin(req)}/download/${encodeURIComponent(data.file)}`,
  };
}

/* ---------------- 限流 ---------------- */

function limited(req, res, scope, max, windowMs) {
  const result = rateLimit.take(`${scope}:${rateLimit.clientIp(req)}`, max, windowMs);
  if (result.ok) return false;
  json(res, 429, { error: '操作过于频繁，请稍后再试', retryAfter: result.retryAfter }, {
    'Retry-After': String(result.retryAfter),
  });
  return true;
}

function loginBlocked(key) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  if (!entry.until) return 0;
  if (entry.until <= Date.now()) {
    loginFailures.delete(key);
    return 0;
  }
  return entry.until;
}

function noteLoginFailure(key) {
  const now = Date.now();
  const entry = loginFailures.get(key) || { count: 0, until: 0 };
  entry.count += 1;
  if (entry.count >= 5) {
    entry.until = now + 10 * 60 * 1000;
    entry.count = 0;
  }
  loginFailures.set(key, entry);
}

/* ---------------- 认证 / 账户 ---------------- */

async function handleAuth(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/auth/register' && req.method === 'POST') {
    if (limited(req, res, 'register', RL_REGISTER, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const username = validUsername(body.username || body.phone);
      const password = String(body.password || '');
      const rawName = String(body.name || '').trim();
      const name = sanitizeName(rawName || '玩家');
      if (!username) {
        json(res, 400, { error: '用户名需为 3-16 位字母、数字、下划线或中文' });
        return true;
      }
      if (password.length < 6 || password.length > 32) {
        json(res, 400, { error: '密码需 6-32 位' });
        return true;
      }
      if (rawName && rawName === password) {
        json(res, 400, { error: '昵称不能与密码相同' });
        return true;
      }
      if (rawName && rawName.toLowerCase() === username.toLowerCase()) {
        json(res, 400, { error: '昵称不能与用户名相同' });
        return true;
      }
      if (/^\d{7,}$/.test(rawName)) {
        json(res, 400, { error: '昵称不要使用手机号' });
        return true;
      }
      const key = normalizeUsername(username);
      if (store.users.has(key)) {
        json(res, 409, { error: '该用户名已被注册' });
        return true;
      }
      const now = Date.now();
      const user = {
        username,
        name,
        pwdHash: await makeHash(password),
        points: DAILY_POINTS,
        todayPoints: DAILY_POINTS,
        todayDate: dayKey(),
        plays: REGISTER_PLAYS,
        chips: CHIPS_DEFAULT,
        chipsAt: now,
        totalRecharge: 0,
        rounds: 0,
        honors: [],
        tokens: [],
        createdAt: now,
      };
      store.users.set(key, user);
      store.meta.currentDay = store.meta.currentDay || dayKey();
      const authToken = issueToken(user);
      saveStore();
      json(res, 201, { token: authToken, account: accountView(user) });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    if (limited(req, res, 'login-ip', RL_LOGIN_IP, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const key = normalizeUsername(body.username || body.phone);
      const password = String(body.password || '');
      if (limited(req, res, `login-user-${key}`, 10, 60 * 1000)) return true;
      const blockedUntil = loginBlocked(key);
      if (blockedUntil) {
        json(res, 429, { error: '失败次数过多，请 10 分钟后再试', retryAfter: Math.ceil((blockedUntil - Date.now()) / 1000) });
        return true;
      }
      const user = store.users.get(key);
      if (!user || !(await checkHash(password, user.pwdHash))) {
        noteLoginFailure(key);
        json(res, 401, { error: '用户名或密码不正确' });
        return true;
      }
      loginFailures.delete(key);
      ensureDaily(user);
      const authToken = issueToken(user);
      json(res, 200, { token: authToken, account: accountView(user) });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (limited(req, res, 'me', 120, 60 * 1000)) return true;
    const user = userByToken(tokenFrom(req, null, url));
    if (!user) {
      json(res, 401, { error: '登录已失效，请重新登录' });
      return true;
    }
    ensureDaily(user);
    json(res, 200, { account: accountView(user) });
    return true;
  }

  if (pathname === '/api/career' && req.method === 'GET') {
    if (limited(req, res, 'career', 120, 60 * 1000)) return true;
    const user = userByToken(tokenFrom(req, null, url));
    if (!user) {
      json(res, 401, { error: 'Login required' });
      return true;
    }
    ensureDaily(user);
    json(res, 200, { career: careerView(user), account: accountView(user) });
    return true;
  }

  if (pathname === '/api/career/title' && req.method === 'POST') {
    if (limited(req, res, 'career-title', 30, 60 * 1000)) return true;
    try {
      const body = await readBody(req, 4096);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: 'Login required' });
        return true;
      }
      const career = ensureCareer(user);
      const title = String(body.title || '').trim();
      if (title && !career.achievements.includes(title)) {
        json(res, 403, { error: 'Title not unlocked' });
        return true;
      }
      career.activeTitle = title;
      user.activeTitle = title;
      saveStore();
      json(res, 200, { ok: true, career: careerView(user), account: accountView(user) });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/progress/tick' && req.method === 'POST') {
    try {
      const body = await readBody(req, 4096);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: 'Login required' });
        return true;
      }
      const mode = body.mode === 'single' ? 'single' : (body.mode === 'lobby' ? 'lobby' : '');
      const sessionId = String(body.sessionId || '').slice(0, 80);
      if (!mode || !/^[A-Za-z0-9_-]{6,80}$/.test(sessionId)) {
        json(res, 400, { error: 'Invalid progress session' });
        return true;
      }
      ensureDaily(user);
      const daily = ensureDailyProgress(user);
      const userKey = normalizeUsername(user.username);
      const now = Date.now();
      let session = progressSessions.get(userKey);
      if (!session || session.mode !== mode || session.sessionId !== sessionId) {
        session = {
          mode,
          sessionId,
          startedAt: now,
          at: now,
          seconds: 0,
          totalSeconds: 0,
          earnedPoints: 0,
          noticeAt: 0,
        };
        progressSessions.set(userKey, session);
      }
      const elapsed = session.at ? Math.min(30, Math.max(0, (now - session.at) / 1000)) : 0;
      session.at = now;
      session.seconds += elapsed;
      session.totalSeconds += elapsed;
      const units = Math.floor(session.seconds / 60);
      let earned = 0;
      let notice = null;
      if (units > 0) {
        session.seconds -= units * 60;
        const rate = mode === 'single' ? SINGLE_POINTS_PER_MIN : LOBBY_POINTS_PER_MIN;
        const award = addActivityChips(user, units * rate, mode);
        if (award > 0) {
          session.earnedPoints += award;
          earned = award;
          saveStore();
        }
      }
      if (mode === 'single') {
        const bucket = Math.floor(session.totalSeconds / 600);
        if (bucket > 0 && bucket > session.noticeAt) {
          session.noticeAt = bucket;
          notice = {
            minutes: bucket * 10,
            earnedPoints: session.earnedPoints,
            message: `单机练习已累计 ${session.earnedPoints} 筹码`,
          };
        }
      }
      json(res, 200, {
        ok: true,
        mode,
        earnedChips: earned,
        chips: Number(user.chips) || 0,
        daily: {
          friendChips: daily.friendChips,
          singleChips: daily.singleChips,
          lobbyChips: daily.lobbyChips,
          friendChipCap: FRIEND_CHIP_DAILY_CAP,
          singleChipCap: SINGLE_POINTS_DAILY_CAP,
          lobbyChipCap: LOBBY_POINTS_DAILY_CAP,
        },
        sessionSeconds: Math.floor(session.totalSeconds),
        notice,
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      revokeToken(tokenFrom(req, body, url));
      json(res, 200, { ok: true });
    } catch {
      json(res, 400, { error: 'invalid request' });
    }
    return true;
  }

  if (pathname === '/api/auth/password' && req.method === 'POST') {
    if (limited(req, res, 'password', 10, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '登录已失效，请重新登录' });
        return true;
      }
      const oldPassword = String(body.oldPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!(await checkHash(oldPassword, user.pwdHash))) {
        json(res, 403, { error: '原密码不正确' });
        return true;
      }
      if (newPassword.length < 6 || newPassword.length > 32) {
        json(res, 400, { error: '新密码需 6-32 位' });
        return true;
      }
      user.pwdHash = await makeHash(newPassword);
      revokeAllTokens(user);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  return false;
}

async function handleAccount(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/account/nickname' && req.method === 'POST') {
    if (limited(req, res, 'nickname', 10, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '登录已失效，请重新登录' });
        return true;
      }
      const rawName = String(body.name || '').trim();
      if (rawName.length < 1 || rawName.length > 12) {
        json(res, 400, { error: '昵称需为 1-12 个字符' });
        return true;
      }
      if (/^\d{7,}$/.test(rawName)) {
        json(res, 400, { error: '昵称不要使用手机号' });
        return true;
      }
      if (rawName.toLowerCase() === String(user.username).toLowerCase()) {
        json(res, 400, { error: '昵称不能与用户名相同' });
        return true;
      }
      const name = sanitizeName(rawName);
      if (!name || name.length > 12) {
        json(res, 400, { error: '昵称格式不正确' });
        return true;
      }
      user.name = name;
      const key = normalizeUsername(user.username);
      for (const room of rooms.values()) {
        for (const player of room.players.values()) {
          if (player.userKey === key) player.name = name;
        }
        if (room.game && Array.isArray(room.game.players)) {
          for (const player of room.game.players) {
            if (player.userKey === key) player.name = name;
          }
        }
      }
      saveStore();
      json(res, 200, { account: accountView(user) });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/recharge' && req.method === 'POST') {
    if (!RECHARGE_ENABLED) {
      json(res, 403, { error: '充值功能暂未开放，请使用兑换码获取次数' });
      return true;
    }
    if (limited(req, res, 'recharge', 10, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '登录已失效，请重新登录' });
        return true;
      }
      const yuan = Math.floor(Number(body.yuan) || 0);
      if (!Number.isFinite(yuan) || yuan < 1 || yuan > 1000) {
        json(res, 400, { error: '充值金额需为 1-1000 元' });
        return true;
      }
      grantPlays(user, yuan * PLAYS_PER_YUAN, yuan * POINTS_PER_YUAN, yuan);
      json(res, 200, {
        ok: true,
        account: accountView(user),
        granted: { yuan, plays: yuan * PLAYS_PER_YUAN, points: yuan * POINTS_PER_YUAN },
        mock: true,
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    rollDay();
    const list = [...store.users.values()];
    const mask = (name) => (name.length <= 2 ? `${name[0] || ''}*` : `${name.slice(0, 1)}***${name.slice(-1)}`);
    const rank = (key, limit = 10) => list
      .filter((u) => (u[key] || 0) > 0)
      .sort((a, b) => (b[key] || 0) - (a[key] || 0))
      .slice(0, limit)
      .map((u, index) => ({
        rank: index + 1,
        name: mask(String(u.name || u.username || '')),
        username: mask(String(u.username || '')),
        value: u[key] || 0,
      }));
    let todayTop = null;
    for (const u of list) {
      const score = u.todayPoints || 0;
      if (score > 0 && (!todayTop || score > todayTop.value)) {
        todayTop = { name: mask(String(u.name || u.username || '')), value: score };
      }
    }
    const lastHonor = store.meta.lastHonor
      ? { ...store.meta.lastHonor, name: mask(String(store.meta.lastHonor.name || store.meta.lastHonor.username || '')) }
      : null;
    json(res, 200, {
      date: dayKey(),
      chips: rank('chips'),
    });
    return true;
  }

  return false;
}

/* ---------------- 匹配 ---------------- */

async function handleMatch(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/rooms/open' && req.method === 'GET') {
    if (!features().lanEnabled) {
      json(res, 200, { features: features(), rooms: [] });
      return true;
    }
    const list = [...rooms.values()]
      .filter((room) => !room.match)
      .map((room) => {
        const players = [...room.players.values()].filter((p) => !p.spectator);
        const host = room.players.get(room.hostToken);
        return {
          code: room.code,
          name: room.name,
          creator: host ? host.name : '房主',
          seats: room.seats,
          players: players.length,
          online: players.filter((p) => p.online).length,
          started: Boolean(room.started),
          joinable: players.length < room.seats,
          hasPassword: Boolean(room.password),
        };
      })
      .sort((a, b) => Number(b.joinable) - Number(a.joinable) || b.players - a.players);
    json(res, 200, { features: features(), rooms: list });
    return true;
  }

  if (pathname === '/api/match/rooms' && req.method === 'GET') {
    rollDay();
    ensureMatchRooms();
    const list = MATCH_CODES.map((code) => rooms.get(code))
      .filter(Boolean)
      .map((room) => {
        const players = [...room.players.values()].filter((p) => !p.spectator);
        return {
          code: room.code,
          name: room.name,
          seats: room.seats,
          players: players.length,
          online: players.filter((p) => p.online).length,
          started: room.started,
          joinable: players.length < room.seats,
          waiting: Boolean(room.started && players.length < room.seats),
          minPlayers: MATCH_MIN_PLAYERS,
          countdownEnd: room.countdownEnd || 0,
        };
      });
    json(res, 200, { features: features(), rooms: list });
    return true;
  }

  if ((pathname === '/api/match/quick' || pathname === '/api/match/join') && req.method === 'POST') {
    if (!requireCurrentVersion(req, res, url)) return true;
    if (!features().matchEnabled) {
      json(res, 403, { error: '在线匹配已关闭，请联系管理员' });
      return true;
    }
    if (limited(req, res, 'match-join', RL_MATCH_JOIN, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '请先登录账户' });
        return true;
      }
      ensureChips(user);
      const userKey = normalizeUsername(user.username);
      if ((user.chips || 0) < 1) {
        const chipConfig = chipRefillConfig();
        json(res, 403, {
          error: `筹码不足，每 ${chipIntervalLabel(chipConfig.minutes)} 检测一次，低于 ${chipConfig.grant} 会补足到 ${chipConfig.grant}`,
          refillAt: (user.chipsAt || Date.now()) + chipConfig.ms,
          chipRefillMinutes: chipConfig.minutes,
          chipGrant: chipConfig.grant,
        });
        return true;
      }
      ensureMatchRooms();

      if (pathname === '/api/match/quick') {
        const current = userRooms.get(userKey);
        const currentRoom = current ? rooms.get(current.code) : null;
        const currentPlayer = currentRoom ? currentRoom.players.get(current.token) : null;
        if (currentRoom && currentPlayer && currentRoom.match && !currentPlayer.spectator) {
          json(res, 200, {
            code: currentRoom.code,
            token: currentPlayer.token,
            pid: currentPlayer.pid,
            host: currentPlayer.token === currentRoom.hostToken,
            match: true,
            seats: currentRoom.seats,
            minPlayers: MATCH_MIN_PLAYERS,
            started: Boolean(currentRoom.started),
            waiting: Boolean(currentRoom.started),
            account: accountView(user),
          });
          return true;
        }
      }

      let room = null;
      if (pathname === '/api/match/join') {
        room = rooms.get(String(body.code || ''));
        if (!room || !room.match) {
          json(res, 404, { error: '匹配房间不存在' });
          return true;
        }
      }

      const existing = room
        ? [...room.players.values()].find((p) => p.userKey === userKey)
        : null;
      if (existing) {
        json(res, 200, {
          code: room.code,
          token: existing.token,
          pid: existing.pid,
          host: existing.token === room.hostToken,
          match: true,
          seats: room.seats,
          minPlayers: MATCH_MIN_PLAYERS,
          started: Boolean(room.started),
          waiting: Boolean(room.started
            && [...room.players.values()].filter((p) => !p.spectator).length < room.seats),
          account: accountView(user),
        });
        return true;
      }

      if (!room) {
        const countOf = (item) => [...item.players.values()].filter((p) => !p.spectator).length;
        room = MATCH_CODES
          .map((code) => rooms.get(code))
          .find((item) => item && countOf(item) < item.seats) || null;
        if (!room) {
          json(res, 409, { error: '4 个匹配房都已满，请稍后再试' });
          return true;
        }
      }

      const players = [...room.players.values()].filter((p) => !p.spectator);
      if (players.length >= room.seats) {
        json(res, 409, { error: '该房间已满' });
        return true;
      }

      const waiting = Boolean(room.started);
      const previous = otherRoomFor(userKey, room.code);
      if (previous) leaveRoom(previous, userRooms.get(userKey).token);

      const player = addPlayer(room, { name: user.name, userKey, spectator: false });
      player.versionCode = clientVersion(req, url);
      player.versionName = String(req.headers['x-client-version-name'] || '');
      markWaitingForNext(room, player);
      broadcastPlayers(room);
      checkMatchCountdown(room);
      json(res, 200, {
        code: room.code,
        token: player.token,
        pid: player.pid,
        host: player.token === room.hostToken,
        match: true,
        seats: room.seats,
        minPlayers: MATCH_MIN_PLAYERS,
        started: Boolean(room.started),
        waiting,
        countdownEnd: room.countdownEnd,
        countdownMs: MATCH_COUNTDOWN_MS,
        account: accountView(user),
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  return false;
}

/* ---------------- 后台管理 ---------------- */

const ADMIN_TOKEN_MS = 12 * 60 * 60 * 1000;

function adminConfigured() {
  return Boolean(ADMIN_USER && ADMIN_PASSWORD);
}

function issueAdminToken() {
  const value = crypto.randomBytes(24).toString('hex');
  adminTokens.set(value, Date.now() + ADMIN_TOKEN_MS);
  return value;
}

function adminAuthed(tokenValue) {
  const value = String(tokenValue || '');
  const expire = adminTokens.get(value);
  if (expire) {
    if (Date.now() > expire) {
      adminTokens.delete(value);
    } else {
      return true;
    }
  }
  // 游戏主账号 admin 登录后的 token 也可直接进入后台，无需二次管理员登录。
  const userKey = tokenIndex.get(value);
  return Boolean(userKey && isAdminUser(store.users.get(userKey)));
}

function onlineAccounts() {
  const now = Date.now();
  const accounts = new Map();
  for (const [id, entry] of presence) {
    if (now - Number(entry.at || 0) > PRESENCE_TTL) {
      presence.delete(id);
      continue;
    }
    if (!entry.user) continue;
    const key = normalizeUsername(entry.user);
    const user = store.users.get(key);
    const current = accounts.get(key) || {
      username: key,
      name: user?.name || key,
      lastSeen: Number(entry.at) || 0,
      inRoom: false,
      roomCode: '',
      roomName: '',
      seatNo: -1,
      spectator: false,
      phase: '',
      hand: 0,
    };
    current.lastSeen = Math.max(current.lastSeen, Number(entry.at) || 0);
    accounts.set(key, current);
  }
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (!player.online || !player.userKey) continue;
      const key = normalizeUsername(player.userKey);
      if (!key) continue;
      const user = store.users.get(key);
      const current = accounts.get(key) || {
        username: key,
        name: user?.name || player.name,
        lastSeen: Date.now(),
        inRoom: false,
        roomCode: '',
        roomName: '',
        seatNo: -1,
        spectator: false,
        phase: '',
        hand: 0,
      };
      current.name = user?.name || player.name || current.name;
      current.lastSeen = Math.max(current.lastSeen, Date.now());
      current.inRoom = true;
      current.roomCode = room.code;
      current.roomName = room.name;
      current.seatNo = Number.isInteger(player.seatNo) ? player.seatNo : -1;
      current.spectator = Boolean(player.spectator);
      current.phase = room.game?.phase || '';
      current.hand = Number(room.game?.hand) || 0;
      accounts.set(key, current);
    }
  }
  return accounts;
}

function userSummary(user, online) {
  const key = normalizeUsername(user.username);
  const live = online instanceof Map ? online.get(key) : null;
  return {
    username: user.username,
    name: user.name,
    points: user.points || 0,
    todayPoints: user.todayPoints || 0,
    plays: user.plays || 0,
    chips: user.chips || 0,
    rounds: user.rounds || 0,
    totalRecharge: user.totalRecharge || 0,
    honors: (user.honors || []).length,
    createdAt: user.createdAt || 0,
    online: Boolean(live) || (online instanceof Set && online.has(key)),
    lastSeen: live?.lastSeen || 0,
    inRoom: Boolean(live?.inRoom),
    roomCode: live?.roomCode || '',
    roomName: live?.roomName || '',
    seatNo: Number.isInteger(live?.seatNo) ? live.seatNo : -1,
    spectator: Boolean(live?.spectator),
    phase: live?.phase || '',
    hand: Number(live?.hand) || 0,
  };
}

function onlineUserKeys() {
  return new Set(onlineAccounts().keys());
}

function onlineStats() {
  const now = Date.now();
  for (const [id, entry] of presence) {
    if (now - entry.at > PRESENCE_TTL) presence.delete(id);
  }
  const keys = new Set(onlineAccounts().keys());
  let players = 0;
  let spectators = 0;
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (!player.online) continue;
      if (player.spectator) spectators += 1;
      else players += 1;
    }
  }
  return {
    online: keys.size,
    players,
    spectators,
    rooms: rooms.size,
    games: [...rooms.values()].filter((room) => room.game && room.started).length,
  };
}

async function handleAdmin(req, res, url) {
  const pathname = url.pathname.replace(/^\/api\/admin/, '') || '/';

  if (pathname === '/login' && req.method === 'POST') {
    if (limited(req, res, 'admin-login', 10, 10 * 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      if (!adminConfigured()) {
        json(res, 503, { error: '未配置管理员账号，请设置环境变量 ADMIN_USER / ADMIN_PASSWORD' });
        return true;
      }
      const name = String(body.username || '').trim().toLowerCase();
      const pass = String(body.password || '');
      if (!safeEqual(name, ADMIN_USER) || !safeEqual(pass, ADMIN_PASSWORD)) {
        json(res, 401, { error: '管理员账号或密码不正确' });
        return true;
      }
      json(res, 200, { token: issueAdminToken(), username: ADMIN_USER, expiresIn: ADMIN_TOKEN_MS });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  let body = null;
  if (req.method !== 'GET') {
    try {
      body = await readBody(req);
    } catch (error) {
      json(res, 400, { error: error.message });
      return true;
    }
  }
  const tokenValue = req.headers.authorization
    ? tokenFrom(req, body, url)
    : url.searchParams.get('token') || (body && body.token) || '';
  if (!adminAuthed(tokenValue)) {
    json(res, 401, { error: '管理员登录已失效，请重新登录' });
    return true;
  }

  if (pathname === '/overview' && req.method === 'GET') {
    rollDay();
    const users = [...store.users.values()];
    const accounts = onlineAccounts();
    const onlineList = [...accounts.values()].sort((a, b) => b.lastSeen - a.lastSeen);
    const live = onlineStats();
    const activeGames = [...rooms.values()].filter((room) => room.game && room.started);
    const roomView = (room) => ({
      code: room.code,
      name: room.name,
      match: Boolean(room.match),
      started: room.started,
      phase: room.game?.phase || '',
      hand: Number(room.game?.hand) || 0,
      players: [...room.players.values()].filter((p) => !p.spectator).length,
      online: [...room.players.values()].filter((p) => p.online).length,
      seats: room.seats,
      playerNames: [...room.players.values()]
        .filter((p) => p.online && !p.spectator)
        .map((p) => p.name)
        .slice(0, 12),
    });
    json(res, 200, {
      users: users.length,
      onlineUsers: accounts.size,
      onlinePlayers: accounts.size,
      onlineRoomPlayers: live.players,
      onlineLobby: Math.max(0, accounts.size - live.players - live.spectators),
      spectators: live.spectators,
      activeGames: activeGames.length,
      onlineList: onlineList.map((item) => ({
        username: item.username,
        name: item.name,
        lastSeen: item.lastSeen,
        inRoom: item.inRoom,
        roomCode: item.roomCode,
        roomName: item.roomName,
        seatNo: item.seatNo,
        spectator: item.spectator,
        phase: item.phase,
        hand: item.hand,
      })),
      games: activeGames.map((room) => ({
        code: room.code,
        name: room.name,
        match: Boolean(room.match),
        phase: room.game?.phase || '',
        hand: Number(room.game?.hand) || 0,
        online: [...room.players.values()].filter((p) => p.online).length,
        players: [...room.players.values()]
          .filter((p) => p.online && !p.spectator)
          .map((p) => p.name),
      })),
      uptime: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      serverTime: new Date().toISOString(),
      rooms: [...rooms.values()].map(roomView),
      history: store.history.length,
      openHistory: store.history.filter((h) => !h.endedAt).length,
      todayRounds: users.reduce((sum, u) => sum + (u.rounds || 0), 0),
      adminConfigured: adminConfigured(),
      connections: sseCount,
    });
    return true;
  }

  if (pathname === '/features' && req.method === 'GET') {
    json(res, 200, { features: features() });
    return true;
  }

  if (pathname === '/features' && req.method === 'POST') {
    if (typeof body.onlineEnabled === 'boolean') {
      store.meta.features.matchEnabled = body.onlineEnabled;
      store.meta.features.lanEnabled = body.onlineEnabled;
    }
    if (typeof body.matchEnabled === 'boolean') store.meta.features.matchEnabled = body.matchEnabled;
    if (typeof body.lanEnabled === 'boolean') store.meta.features.lanEnabled = body.lanEnabled;
    if (body.chipRefillMinutes != null) {
      const minutes = Number(body.chipRefillMinutes);
      if (!Number.isFinite(minutes) || minutes < CHIP_REFILL_MIN_MINUTES || minutes > CHIP_REFILL_MAX_MINUTES) {
        json(res, 400, { error: '筹码补充间隔必须是 1 到 1440 分钟' });
        return true;
      }
      store.meta.chipRefillMinutes = Math.floor(minutes);
    }
    if (body.chipGrant != null) {
      const grant = Number(body.chipGrant);
      if (!Number.isFinite(grant) || grant < 1 || grant > CHIP_GRANT_MAX) {
        json(res, 400, { error: '补足目标必须是 1 到 100' });
        return true;
      }
      store.meta.chipGrant = Math.floor(grant);
    }
    saveStore();
    json(res, 200, { ok: true, features: features() });
    return true;
  }

  if (pathname === '/users' && req.method === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const size = Math.max(10, Math.min(100, Number(url.searchParams.get('size')) || 20));
    const status = String(url.searchParams.get('status') || '').toLowerCase();
    const sort = String(url.searchParams.get('sort') || 'createdAt');
    const order = String(url.searchParams.get('order') || 'desc').toLowerCase() === 'asc' ? 1 : -1;
    const online = onlineAccounts();
    let list = [...store.users.values()];
    if (q) list = list.filter((u) => String(u.username).toLowerCase().includes(q) || String(u.name || '').toLowerCase().includes(q));
    if (status === 'online') list = list.filter((u) => online.has(normalizeUsername(u.username)));
    if (status === 'offline') list = list.filter((u) => !online.has(normalizeUsername(u.username)));
    const sorters = {
      username: (u) => String(u.username || '').toLowerCase(),
      name: (u) => String(u.name || '').toLowerCase(),
      chips: (u) => Number(u.chips) || 0,
      points: (u) => Number(u.points) || 0,
      plays: (u) => Number(u.plays) || 0,
      rounds: (u) => Number(u.rounds) || 0,
      lastSeen: (u) => online.get(normalizeUsername(u.username))?.lastSeen || 0,
      createdAt: (u) => Number(u.createdAt) || 0,
    };
    const valueOf = sorters[sort] || sorters.createdAt;
    list.sort((a, b) => {
      const av = valueOf(a); const bv = valueOf(b);
      if (typeof av === 'string' || typeof bv === 'string') return String(av).localeCompare(String(bv), 'zh-CN') * order;
      if (av === bv) return (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0);
      return (av - bv) * order;
    });
    json(res, 200, {
      total: list.length,
      page,
      size,
      onlineCount: online.size,
      offlineCount: Math.max(0, store.users.size - online.size),
      status,
      sort,
      order: order === 1 ? 'asc' : 'desc',
      users: list.slice((page - 1) * size, page * size).map((u) => userSummary(u, online)),
    });
    return true;
  }

  if (pathname === '/users/update' && req.method === 'POST') {
    const key = normalizeUsername(body.username);
    const user = store.users.get(key);
    if (!user) {
      json(res, 404, { error: '用户不存在' });
      return true;
    }
    if (body.plays !== undefined) user.plays = Math.max(0, Math.floor(Number(body.plays) || 0));
    if (body.points !== undefined) user.points = Math.max(0, Math.floor(Number(body.points) || 0));
    if (body.chips !== undefined) user.chips = Math.max(0, Math.min(CHIPS_MAX, Math.floor(Number(body.chips) || 0)));
    if (body.name) user.name = sanitizeName(body.name);
    if (body.password) {
      const password = String(body.password);
      if (password.length < 6 || password.length > 32) {
        json(res, 400, { error: '密码需 6-32 位' });
        return true;
      }
      user.pwdHash = await makeHash(password);
      revokeAllTokens(user);
    }
    saveStore();
    json(res, 200, { ok: true, user: userSummary(user, onlineAccounts()) });
    return true;
  }

  if (pathname === '/users/delete' && req.method === 'POST') {
    const key = normalizeUsername(body.username);
    const user = store.users.get(key);
    if (!user) {
      json(res, 404, { error: '用户不存在' });
      return true;
    }
    revokeAllTokens(user);
    for (const room of [...rooms.values()]) {
      for (const [playerToken, player] of [...room.players.entries()]) {
        if (player.userKey === key) leaveRoom(room, playerToken);
      }
    }
    store.users.delete(key);
    userRooms.delete(key);
    saveStore();
    json(res, 200, { ok: true });
    return true;
  }

  if (pathname === '/history' && req.method === 'GET') {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const size = 20;
    json(res, 200, {
      total: store.history.length,
      page,
      size,
      history: store.history.slice((page - 1) * size, page * size),
    });
    return true;
  }

  if (pathname === '/rooms/close' && req.method === 'POST') {
    const room = rooms.get(String(body.code || ''));
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return true;
    }
    if (room.match) resetMatchRoom(room, 'admin closed');
    else closeRoom(room, 'admin closed');
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: 'not found' });
  return true;
}

/* ---------------- 房间 API ---------------- */

async function handleRooms(req, res, url) {
  const pathname = url.pathname;

  if (pathname === '/api/rooms' && req.method === 'GET') {
    const list = [...rooms.values()]
      .filter((room) => !room.match)
      .map(roomSummary)
      .sort((a, b) => a.code.localeCompare(b.code));
    json(res, 200, { rooms: list });
    return true;
  }

  if (pathname === '/api/rooms' && req.method === 'POST') {
    if (!requireCurrentVersion(req, res, url)) return true;
    if (!features().lanEnabled) {
      json(res, 403, { error: '好友房已关闭，请联系管理员' });
      return true;
    }
    if (limited(req, res, 'room-create', RL_ROOM_CREATE, 60 * 1000)) return true;
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '请先登录账户' });
        return true;
      }
      ensureChips(user);
      const userKey = normalizeUsername(user.username);
      const hosted = [...rooms.values()].filter((room) => !room.match && room.hostUserKey === userKey).length;
      if (hosted >= MAX_ROOMS_PER_USER) {
        json(res, 429, { error: `每个账号最多同时创建 ${MAX_ROOMS_PER_USER} 个房间` });
        return true;
      }
      if (rooms.size >= MAX_ROOMS) {
        json(res, 503, { error: '房间数量已达上限，请稍后再试' });
        return true;
      }
      const password = String(body.password || '');
      if (!/^\d{3}$/.test(password)) {
        json(res, 400, { error: '口令需为 3 位数字' });
        return true;
      }
      const seats = Math.min(8, Math.max(2, Math.floor(Number(body.seats) || 8)));
      const startingChips = Math.max(20, Math.min(100000, Math.floor(Number(body.startingChips) || 100)));
      const sb = Math.max(1, Math.min(100, Math.floor(Number(body.sb) || 1)));
      const bb = Math.max(sb * 2, Math.min(200, Math.floor(Number(body.bb) || sb * 2)));
      const loserSpectate = body.loserSpectate === true || body.loserSpectate === '1';
      let code;
      try {
        code = roomCode();
      } catch {
        json(res, 503, { error: '房间号已用尽，请稍后再试' });
        return true;
      }
      const room = {
        code,
        name: sanitizeName(body.name),
        password,
        seats,
        startingChips,
        sb,
        bb,
        loserSpectate,
        hostToken: '',
        hostUserKey: userKey,
        started: false,
        match: false,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        nextPid: 1,
        players: new Map(),
        clients: new Map(),
        game: null,
        historyId: '',
        voice: new Set(),
      };
      const player = addPlayer(room, { name: user.name, userKey, spectator: false });
      player.ready = true;
      player.versionCode = clientVersion(req, url);
      player.versionName = String(req.headers['x-client-version-name'] || '');
      rooms.set(code, room);
      broadcastPlayers(room);
      json(res, 201, {
        code,
        token: player.token,
        pid: player.pid,
        host: true,
        seats,
        startingChips,
        sb,
        bb,
        loserSpectate,
        match: false,
        account: accountView(user),
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  const joinMatch = /^\/api\/rooms\/(\d{3})\/join$/.exec(pathname);
  if (joinMatch && req.method === 'POST') {
    if (!requireCurrentVersion(req, res, url)) return true;
    if (limited(req, res, 'room-join', RL_ROOM_JOIN, 60 * 1000)) return true;
    const room = rooms.get(joinMatch[1]);
    if (!room) {
      json(res, 404, { error: '房间不存在' });
      return true;
    }
    if (!room.match && !features().lanEnabled) {
      json(res, 403, { error: '好友房已关闭，请联系管理员' });
      return true;
    }
    if (room.match && !features().matchEnabled) {
      json(res, 403, { error: '在线匹配已关闭，请联系管理员' });
      return true;
    }
    try {
      const body = await readBody(req);
      const user = userByToken(tokenFrom(req, body, url));
      if (!user) {
        json(res, 401, { error: '请先登录账户' });
        return true;
      }
      ensureChips(user);
      const userKey = normalizeUsername(user.username);
      const existing = [...room.players.values()].find((p) => p.userKey === userKey);
      if (existing) {
        json(res, 200, {
          code: room.code,
          token: existing.token,
          pid: existing.pid,
          spectator: existing.spectator,
          host: existing.token === room.hostToken,
          seats: room.seats,
          startingChips: room.startingChips || 100,
          sb: room.sb || 1,
          bb: room.bb || 2,
          loserSpectate: Boolean(room.loserSpectate),
          match: Boolean(room.match),
          account: accountView(user),
        });
        return true;
      }
      if (room.match && room.started) {
        json(res, 409, { error: '该房间已开局' });
        return true;
      }
      if (!room.match) {
        if (String(body.password || '') !== room.password) {
          const failureKey = `room-pass:${rateLimit.clientIp(req)}:${room.code}`;
          const limitedPass = rateLimit.take(failureKey, 12, 5 * 60 * 1000);
          if (!limitedPass.ok) {
            json(res, 429, { error: '口令尝试次数过多，请 5 分钟后再试', retryAfter: limitedPass.retryAfter }, {
              'Retry-After': String(limitedPass.retryAfter),
            });
            return true;
          }
          json(res, 403, { error: '口令不正确' });
          return true;
        }
      }
      const players = [...room.players.values()].filter((p) => !p.spectator);
      const spectators = room.players.size - players.length;
      // 座位没满就可以进来等下一手；只有坐满才转为观战。
      const waiting = Boolean(room.started && players.length < room.seats);
      const spectator = players.length >= room.seats;
      if (spectator && spectators >= MAX_SPECTATORS) {
        json(res, 409, { error: '观战人数已满' });
        return true;
      }
      const previous = otherRoomFor(userKey, room.code);
      if (previous) leaveRoom(previous, userRooms.get(userKey).token);
      const player = addPlayer(room, {
        name: body.name || user.name,
        userKey,
        spectator,
      });
      player.versionCode = clientVersion(req, url);
      player.versionName = String(req.headers['x-client-version-name'] || '');
      markWaitingForNext(room, player);
      broadcastPlayers(room);
      if (room.match) checkMatchCountdown(room);
      json(res, 200, {
        code: room.code,
        token: player.token,
        pid: player.pid,
        spectator,
        waiting,
        started: Boolean(room.started),
        host: false,
        seats: room.seats,
        startingChips: room.startingChips || 100,
        sb: room.sb || 1,
        bb: room.bb || 2,
        loserSpectate: Boolean(room.loserSpectate),
        match: Boolean(room.match),
        account: accountView(user),
      });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  const authMatch = /^\/api\/rooms\/(\d{3})\/(events|action|state|start|leave|ready|voice|voice-audio|direct|round|me|config)$/.exec(pathname);
  if (!authMatch) return false;
  const room = rooms.get(authMatch[1]);
  if (!room) {
    json(res, 404, { error: '房间不存在' });
    return true;
  }
  const action = authMatch[2];

  if (action === 'events' && req.method === 'GET') {
    const playerToken = url.searchParams.get('token') || '';
    const player = room.players.get(playerToken);
    if (!player) {
      json(res, 401, { error: '房间已关闭或你已离开' });
      return true;
    }
    if (sseCount >= MAX_SSE) {
      json(res, 503, { error: '服务器连接数已满，请稍后再试' });
      return true;
    }
    const existing = room.clients.get(playerToken);
    if (existing) {
      existing.closed = true;
      if (existing.heartbeat) clearInterval(existing.heartbeat);
      try { existing.res.end(); } catch { /* 忽略 */ }
      room.clients.delete(playerToken);
      sseCount = Math.max(0, sseCount - 1);
    }
    if (room.clients.size >= MAX_SSE_PER_ROOM) {
      json(res, 503, { error: '该房间连接数已满' });
      return true;
    }

    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    res.write('retry: 3000\n\n');
    const record = { res, heartbeat: null, closed: false };
    room.clients.set(playerToken, record);
    sseCount += 1;
    player.online = true;
    if (player.offlineTimer) {
      clearTimeout(player.offlineTimer);
      player.offlineTimer = null;
    }
    room.lastActivity = Date.now();

    const user = player.userKey ? store.users.get(player.userKey) : null;
    if (user) ensureDaily(user);
    writeToClient(record, frameFor('hello', {
      code: room.code,
      name: room.name,
      host: playerToken === room.hostToken,
      started: room.started,
      seats: room.seats,
      startingChips: room.startingChips || 100,
      sb: room.sb || 1,
      bb: room.bb || 2,
      loserSpectate: Boolean(room.loserSpectate),
      match: Boolean(room.match),
      minPlayers: room.match ? MATCH_MIN_PLAYERS : 2,
      countdownEnd: room.countdownEnd || 0,
      countdownMs: MATCH_COUNTDOWN_MS,
      account: user ? accountView(user) : null,
    }));

    if (room.game) {
      room.game.setOnline(playerToken, true);
      const liveState = room.game.snapshot(false);
      writeToClient(record, frameFor('state', player.spectator ? spectatorState(liveState) : liveState));
      room.game.sendHole(playerToken);
    }

    broadcastPlayers(room);
    const readyStart = startIfAllReady(room);
    if (!readyStart.ok && !readyStart.skipped) {
      broadcast(room, 'notice', { message: readyStart.error });
    }
    checkMatchCountdown(room);

    record.heartbeat = setInterval(() => {
      if (record.closed) return;
      if (!writeToClient(record, ': ping\n\n')) {
        record.closed = true;
        clearInterval(record.heartbeat);
        try { record.res.destroy(); } catch { /* 忽略 */ }
      }
    }, 15000);
    if (record.heartbeat.unref) record.heartbeat.unref();

    req.on('close', () => {
      if (record.closed) return;
      record.closed = true;
      if (record.heartbeat) clearInterval(record.heartbeat);
      if (room.clients.get(playerToken) === record) {
        room.clients.delete(playerToken);
        sseCount = Math.max(0, sseCount - 1);
        const current = room.players.get(playerToken);
        if (current) {
          // Mobile WebView closes SSE when the app is backgrounded. Keep the
          // seat online for 90s and only mark offline if it does not reconnect.
          if (current.offlineTimer) clearTimeout(current.offlineTimer);
          current.offlineTimer = setTimeout(() => {
            current.offlineTimer = null;
            if (room.clients.has(playerToken)) return;
            if (!room.players.has(playerToken)) return;
            if (room.game) room.game.setOnline(playerToken, false);
            voiceLeave(room, current);
            current.online = false;
            if (room.hostToken === playerToken) transferHost(room);
            broadcastPlayers(room);
            if (room.match) checkMatchCountdown(room);
          }, SSE_OFFLINE_GRACE_MS);
          if (current.offlineTimer.unref) current.offlineTimer.unref();
        }
      }
    });
    return true;
  }

  if (action === 'events') {
    json(res, 405, { error: 'method not allowed' });
    return true;
  }

    if (action === 'voice-audio') {
      if (req.method !== 'POST') {
        json(res, 405, { error: 'method not allowed' });
        return true;
      }
      const playerToken = tokenFrom(req, null, url);
      const player = room.players.get(playerToken);
      if (!player) {
        json(res, 401, { error: '房间已关闭或你已离开' });
        return true;
      }
      if (player.spectator) {
        json(res, 403, { error: '观战者不能使用语音' });
        return true;
      }
      const chunks = [];
      let total = 0;
      let tooBig = false;
      await new Promise((resolve) => {
        req.on('data', (chunk) => {
          if (tooBig) return;
          total += chunk.length;
          if (total > 8192) {
            tooBig = true;
            chunks.length = 0;
            resolve();
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', resolve);
        req.on('error', resolve);
      });
      if (tooBig || !total) {
        json(res, tooBig ? 413 : 400, { error: tooBig ? '语音包过大' : '语音包为空' });
        return true;
      }
      const payload = Buffer.concat(chunks);
      voiceClaim(room, player);
      player.voice = true;
      broadcastVoicePcm(room, player.token, player.pid, 0, payload);
      json(res, 200, { ok: true });
      return true;
    }

  try {
    const body = await readBody(req);
    const playerToken = String(body.token || '') || tokenFrom(req, null, url);
    const player = room.players.get(playerToken);
    if (!player) {
      json(res, 401, { error: '房间已关闭或你已离开' });
      return true;
    }

    if (action === 'me') {
      const user = player.userKey ? store.users.get(player.userKey) : null;
      if (user) ensureDaily(user);
      json(res, 200, {
        player: { pid: player.pid, name: player.name, host: playerToken === room.hostToken },
        account: user ? accountView(user) : null,
        room: { code: room.code, name: room.name, seats: room.seats, started: room.started, match: Boolean(room.match) },
      });
      return true;
    }

    if (action === 'leave') {
      leaveRoom(room, playerToken);
      json(res, 200, { ok: true });
      return true;
    }


    if (action === 'voice') {
      if (player.spectator) {
        json(res, 403, { error: '观战者不能使用语音' });
        return true;
      }
      const kind = String(body.kind || '').trim();
      if (!room.voice) room.voice = new Set();
      if (kind === 'join') {
        if (room.voice.size >= MAX_VOICE_SPEAKERS && !room.voice.has(player.pid)) {
          json(res, 409, { error: '语音频道已满（最多8人同时说话）' });
          return true;
        }
        const peers = [...room.voice]
          .filter((pid) => pid !== player.pid)
          .map((pid) => voicePeerView(room, pid))
          .filter(Boolean);
        room.voice.add(player.pid);
        player.voice = true;
        broadcast(room, 'voice', { kind: 'join', from: player.pid, name: player.name });
        json(res, 200, { ok: true, peers, self: { pid: player.pid, name: player.name } });
        return true;
      }
      if (kind === 'leave') {
        voiceLeave(room, player);
        json(res, 200, { ok: true });
        return true;
      }
      if (kind === 'release') {
        voiceRelease(room, player);
        json(res, 200, { ok: true });
        return true;
      }
      if (kind === 'offer' || kind === 'answer' || kind === 'ice') {
        const targetPid = Number(body.targetPid);
        const target = [...room.players.values()].find((p) => p.pid === targetPid);
        if (!target || !room.voice.has(targetPid)) {
          json(res, 409, { error: '语音对端不在线' });
          return true;
        }
        directTo(room, target, 'voice', {
          kind,
          from: player.pid,
          name: player.name,
          payload: body.payload || null,
        });
        json(res, 200, { ok: true });
        return true;
      }
      json(res, 400, { error: 'unknown voice kind' });
      return true;
    }

    if (action === 'config') {
      if (playerToken !== room.hostToken) {
        json(res, 403, { error: '只有房主可以修改房间设置' });
        return true;
      }
      if (room.match || room.started) {
        json(res, 409, { error: '牌局已经开始，不能修改设置' });
        return true;
      }
      const nextChips = Math.max(20, Math.min(100000, Math.floor(Number(body.startingChips) || room.startingChips || 100)));
      const nextSb = Math.max(1, Math.min(100, Math.floor(Number(body.sb) || room.sb || 1)));
      const nextBb = Math.max(nextSb * 2, Math.min(200, Math.floor(Number(body.bb) || nextSb * 2)));
      room.startingChips = nextChips;
      room.sb = nextSb;
      room.bb = nextBb;
      room.loserSpectate = body.loserSpectate === true || body.loserSpectate === '1';
      for (const roomPlayer of room.players.values()) delete roomPlayer.playChips;
      broadcastPlayers(room);
      json(res, 200, {
        ok: true,
        startingChips: room.startingChips,
        sb: room.sb,
        bb: room.bb,
        loserSpectate: room.loserSpectate,
      });
      return true;
    }

    if (action === 'start') {
      if (playerToken !== room.hostToken) {
        json(res, 403, { error: '只有房主可以开始' });
        return true;
      }
      if (room.started) {
        json(res, 409, { error: '牌局已经开始' });
        return true;
      }
      const result = startRoomGame(room, false);
      if (!result.ok) {
        json(res, 409, { error: result.error || '无法开始牌局' });
        return true;
      }
      json(res, 200, { ok: true });
      return true;
    }

    if (action === 'action') {
      if (body.action === 'next') {
        if (!room.game) {
          json(res, 409, { error: '牌局尚未开始' });
          return true;
        }
        const result = room.game.markNextReady(playerToken);
        if (!result.ok) {
          json(res, 409, { error: result.error || '暂时不能继续' });
          return true;
        }
        json(res, 200, result);
        return true;
      }
      if (body.action === 'ready') {
        if (!requireCurrentVersion(req, res, url)) return true;
        if (player.spectator) {
          json(res, 403, { error: '观战者不能准备' });
          return true;
        }
        player.ready = Boolean(body.ready);
        broadcastPlayers(room);
        const started = startIfAllReady(room);
        if (!started.ok && !started.skipped) {
          broadcast(room, 'notice', { message: started.error || '开局失败' });
        }
        json(res, 200, { ok: true, ready: player.ready, started: started.ok });
        return true;
      }
      if (body.action === 'restart') {
        if (room.match) {
          json(res, 403, { error: '在线匹配不能重新分配筹码' });
          return true;
        }
        if (playerToken !== room.hostToken) {
          json(res, 403, { error: '只有房主可以重新分配筹码' });
          return true;
        }
        const restarted = restartFriendRoom(room);
        if (!restarted.ok) {
          json(res, 409, { error: restarted.error || '重新开始失败' });
          return true;
        }
        json(res, 200, { ok: true, started: true });
        return true;
      }
      if (limited(req, res, `room-action-${playerToken}`, 180, 60 * 1000)) return true;
      if (player.spectator) {
        json(res, 403, { error: '观战者不能行动' });
        return true;
      }
      if (!room.game) {
        json(res, 409, { error: '牌局尚未开始' });
        return true;
      }
      const result = room.game.action(playerToken, body.action);
      if (result.error) {
        json(res, result.status || 409, { error: result.error });
        return true;
      }
      room.lastActivity = Date.now();
      json(res, 200, { ok: true });
      return true;
    }

    if (action === 'state' || action === 'direct' || action === 'round') {
      json(res, 403, { error: '牌局由服务器管理，客户端不能直接修改牌局状态' });
      return true;
    }

    json(res, 400, { error: 'unknown action' });
  } catch (error) {
    json(res, 400, { error: error.message });
  }
  return true;
}

/* ---------------- API 分发 ---------------- */

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...SECURITY_HEADERS,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Client-Version,X-Client-Version-Name',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    res.end();
    return true;
  }

  if (url.pathname === '/api/presence' && req.method === 'POST') {
    if (limited(req, res, 'presence', 20, 60 * 1000)) return true;
    try {
      const body = await readBody(req, 4096);
      const id = String(body.id || '');
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
        json(res, 400, { error: 'invalid presence id' });
        return true;
      }
      const user = normalizeUsername(body.user || '');
      presence.set(id, {
        at: Date.now(),
        user: user && store.users.has(user) ? user : '',
      });
      json(res, 200, { ...onlineStats(), connections: sseCount, users: store.users.size });
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return true;
  }

  if (url.pathname === '/api/features') {
    json(res, 200, features());
    return true;
  }

  if (url.pathname === '/api/stats') {
    json(res, 200, {
      ...onlineStats(),
      connections: sseCount,
      users: store.users.size,
      time: new Date().toISOString(),
    });
    return true;
  }

  if (url.pathname === '/api/health') {
    json(res, 200, {
      ok: true,
      service: 'dezhounight',
      rooms: rooms.size,
      users: store.users.size,
      connections: sseCount,
      games: [...rooms.values()].filter((room) => room.game).length,
      features: features(),
      uptime: Math.round(process.uptime()),
      time: new Date().toISOString(),
    });
    return true;
  }

  if (url.pathname === '/api/app/latest') {
    try {
      json(res, 200, appManifest(req));
    } catch (error) {
      console.error('[manifest]', error.message);
      json(res, 500, { error: 'manifest unavailable' });
    }
    return true;
  }

  rollDay();

  if (url.pathname === '/api/voice/name') {
    await handleVoiceTts(req, res, url, { param: 'name', max: 12, subdir: 'names' });
    return true;
  }
  if (url.pathname === '/api/voice/phrase') {
    await handleVoiceTts(req, res, url, { param: 'text', max: 80, subdir: 'phrases' });
    return true;
  }

  if (url.pathname.startsWith('/api/admin/')) {
    await handleAdmin(req, res, url);
    return true;
  }
  if (await handleAuth(req, res, url)) return true;
  if (await handleAccount(req, res, url)) return true;
  if (await handleMatch(req, res, url)) return true;
  if (await handleRooms(req, res, url)) return true;

  json(res, 404, { error: 'not found' });
  return true;
}

/* ---------------- 启动 / 清理 ---------------- */

loadStore();
ensureMatchRooms();

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    text(res, 400, 'bad request');
    return;
  }

  const run = async () => {
    if (url.pathname.startsWith('/api/')) {
      if (!(await handleApi(req, res, url))) json(res, 404, { error: 'not found' });
      return;
    }

    if (url.pathname.startsWith('/download/')) {
      let name;
      try {
        name = path.basename(decodeURIComponent(url.pathname.slice('/download/'.length)));
      } catch {
        json(res, 404, { error: 'not found' });
        return;
      }
      if (!name.endsWith('.apk')) {
        json(res, 404, { error: 'not found' });
        return;
      }
      serveFile(req, res, path.join(APK_DIR, name), 'application/vnd.android.package-archive');
      return;
    }

    if (url.pathname.startsWith('/voice/')) {
      const relative = url.pathname.slice('/voice/'.length);
      if (!/^[a-z_]+\/[a-z_]+\.mp3$/.test(relative)) {
        json(res, 404, { error: 'not found' });
        return;
      }
      serveFile(req, res, path.join(PUBLIC_DIR, 'web', 'voice', relative), 'audio/mpeg');
      return;
    }

    if (url.pathname === '/play/manifest.webmanifest') {
      serveFile(req, res, path.join(PUBLIC_DIR, 'web', 'manifest.webmanifest'), 'application/manifest+json; charset=utf-8');
      return;
    }

    if (url.pathname === '/play/sw.js') {
      // The worker lives under /play/ but must control the canonical /play
      // start URL as well; allow the broader scope explicitly.
      res.setHeader('Service-Worker-Allowed', '/play');
      serveFile(req, res, path.join(PUBLIC_DIR, 'web', 'sw.js'), 'application/javascript; charset=utf-8');
      return;
    }

    if (url.pathname.startsWith('/play/icons/')) {
      const iconName = path.basename(url.pathname);
      if (!/^[a-z0-9-]+\.png$/i.test(iconName)) {
        json(res, 404, { error: 'not found' });
        return;
      }
      serveFile(req, res, path.join(PUBLIC_DIR, 'web', 'icons', iconName), 'image/png');
      return;
    }

    if (url.pathname === '/play' || url.pathname === '/play/') {
      serveFile(req, res, path.join(PUBLIC_DIR, 'web', 'index.html'), 'text/html; charset=utf-8');
      return;
    }

    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      serveFile(req, res, path.join(PUBLIC_DIR, 'admin', 'index.html'), 'text/html; charset=utf-8');
      return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      text(res, 200, '德扑之夜在线服务运行中\n\n电脑端游玩: /play\n后台管理: /admin\n版本接口: /api/app/latest\n匹配房间: /api/match/rooms\n排行榜: /api/leaderboard\n健康检查: /api/health\n');
      return;
    }

    json(res, 404, { error: 'not found' });
  };

  run().catch((error) => {
    console.error('[request]', error.stack || error.message);
    if (!res.headersSent) json(res, 500, { error: 'internal error' });
    else {
      try { res.destroy(); } catch { /* 忽略 */ }
    }
  });
});

server.on('clientError', (error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
});

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of loginFailures) {
    if (!entry.until || entry.until <= now) loginFailures.delete(key);
  }
  for (const [id, entry] of presence) {
    if (now - entry.at > PRESENCE_TTL) presence.delete(id);
  }
  for (const user of store.users.values()) ensureChips(user);
  for (const [code, room] of [...rooms]) {
    let changed = false;
    if (room.game && !room.game.isActive() && room.game.phase !== 'settle') {
      // Defensive: an engine that is neither playing nor settling is unusable.
      room.game.dispose();
      room.game = null;
      room.started = false;
    }
    if (room.match) {
      for (const [playerToken, player] of room.players) {
        if (player.online) continue;
        if (now - player.joinedAt < OFFLINE_SEAT_MS) continue;
        if (room.game && room.game.isActive() && room.game.players.some((p) => p.token === playerToken)) continue;
        room.players.delete(playerToken);
        removeUserRoom(player);
        if (room.hostToken === playerToken) transferHost(room);
        changed = true;
      }
      if (!room.players.size && room.started) {
        resetMatchRoom(room, 'room idle');
        continue;
      }
      if (changed) {
        broadcastPlayers(room);
        checkMatchCountdown(room);
      }
      continue;
    }
    if (!room.players.size && now - room.createdAt > EMPTY_ROOM_MS) {
      closeRoom(room, 'room idle');
      continue;
    }
    if (room.started && room.game && !room.players.size) {
      handleGameOver(room, 'room empty');
      continue;
    }
    if (room.started && room.game && now - room.lastActivity > 15 * 60 * 1000) {
      room.game.endGame('对局超时');
      continue;
    }
    if (!room.players.size && !room.clients.size) {
      rooms.delete(code);
    }
  }
}, 15000).unref();

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal}, saving store...`);
  try {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    if (storeDirty) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify({
        users: [...store.users.values()],
        history: store.history,
        meta: store.meta,
      }));
      storeDirty = false;
    }
  } catch (error) {
    console.error('[store] shutdown save failed', error.message);
  }
  for (const room of rooms.values()) room.game?.dispose();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('[uncaught]', error.stack || error.message);
  saveStore();
});
process.on('unhandledRejection', (error) => {
  console.error('[unhandled]', error?.stack || error);
});


/* ---------------- WebSocket PCM voice relay ---------------- */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
  return crypto.createHash('sha1').update(String(key) + WS_GUID).digest('base64');
}

function wsEncode(payload, opcode = 2) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const length = data.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

function wsSend(relay, payload, opcode = 2) {
  if (!relay || relay.closed || !relay.socket.writable) return false;
  if (relay.socket.writableLength > 1024 * 1024) return false;
  try {
    relay.socket.write(wsEncode(payload, opcode));
    return true;
  } catch {
    return false;
  }
}

function closeVoiceRelay(relay) {
  if (!relay || relay.closed) return;
  relay.closed = true;
  clearInterval(relay.pingTimer);
  const { room, token, player } = relay;
  if (room.voiceRelays) room.voiceRelays.delete(token);
  try { relay.socket.destroy(); } catch { /* 忽略 */ }
  if (player) player.voice = false;
}

function attachVoiceRelay(room, player, socket, head) {
  const relay = {
    room,
    token: player.token,
    player,
    socket,
    closed: false,
    buffer: Buffer.alloc(0),
    fragments: [],
    fragmentOpcode: 0,
    seq: 0,
    pingTimer: null,
  };
  if (!room.voiceRelays) room.voiceRelays = new Map();
  const existing = room.voiceRelays.get(player.token);
  if (existing) closeVoiceRelay(existing);
  room.voiceRelays.set(player.token, relay);
  player.voice = true;
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 30000);

  const cleanup = () => closeVoiceRelay(relay);
  socket.on('close', cleanup);
  socket.on('error', cleanup);

  const handleFrame = (fin, opcode, payload) => {
    if (opcode === 0x8) {
      wsSend(relay, Buffer.alloc(0), 0x8);
      cleanup();
      return;
    }
    if (opcode === 0x9) {
      wsSend(relay, payload, 0xA);
      return;
    }
    if (opcode === 0xA) return;
    if (opcode === 0x1) return;
    if (opcode === 0x2 || opcode === 0x0) {
      let frame = payload;
      if (opcode === 0x2 && !fin) {
        relay.fragments = [payload];
        relay.fragmentOpcode = 0x2;
        return;
      }
      if (opcode === 0x0) {
        if (!relay.fragments.length) return;
        relay.fragments.push(payload);
        if (!fin) return;
        frame = Buffer.concat(relay.fragments);
        relay.fragments = [];
      }
      if (frame.length < 4 || frame.length > 64 * 1024) return;
      relay.seq = (relay.seq + 1) & 0xffff;
      voiceClaim(room, player);
      player.voice = true;
      broadcastVoicePcm(room, player.token, player.pid, relay.seq, frame);
    }
  };

  const consume = () => {
    while (!relay.closed) {
      if (relay.buffer.length < 2) return;
      const b0 = relay.buffer[0];
      const b1 = relay.buffer[1];
      const fin = Boolean(b0 & 0x80);
      const opcode = b0 & 0x0f;
      const masked = Boolean(b1 & 0x80);
      let length = b1 & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (relay.buffer.length < 4) return;
        length = relay.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (relay.buffer.length < 10) return;
        const big = relay.buffer.readBigUInt64BE(2);
        if (big > 1024n * 1024n) { cleanup(); return; }
        length = Number(big);
        offset = 10;
      }
      const maskOffset = offset;
      if (masked) offset += 4;
      if (relay.buffer.length < offset + length) return;
      let payload = relay.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = relay.buffer.subarray(maskOffset, maskOffset + 4);
        const out = Buffer.allocUnsafe(length);
        for (let i = 0; i < length; i += 1) out[i] = payload[i] ^ mask[i % 4];
        payload = out;
      }
      relay.buffer = relay.buffer.subarray(offset + length);
      handleFrame(fin, opcode, payload);
    }
  };

  socket.on('data', (chunk) => {
    if (relay.closed) return;
    relay.buffer = Buffer.concat([relay.buffer, chunk]);
    if (relay.buffer.length > 2 * 1024 * 1024) {
      cleanup();
      return;
    }
    consume();
  });

  relay.pingTimer = setInterval(() => {
    if (relay.closed) return;
    if (!wsSend(relay, Buffer.alloc(0), 0x9)) cleanup();
  }, 20000);
  if (relay.pingTimer.unref) relay.pingTimer.unref();

  if (head && head.length) {
    relay.buffer = Buffer.concat([relay.buffer, head]);
    consume();
  }
}

server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    socket.destroy();
    return;
  }
  if (url.pathname !== '/api/voice-relay') {
    socket.destroy();
    return;
  }
  const code = String(url.searchParams.get('code') || '');
  const token = String(url.searchParams.get('token') || '');
  const room = rooms.get(code);
  const player = room ? room.players.get(token) : null;
  const reject = (status, message) => {
    try {
      socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    } catch { /* 忽略 */ }
    socket.destroy();
  };
  if (!room || !player || player.spectator) return reject(403, 'Forbidden');
  const latest = currentAppVersion();
  const version = clientVersion(req, url);
  if (latest.versionCode && version < latest.versionCode) return reject(426, 'Upgrade Required');
  const key = req.headers['sec-websocket-key'];
  if (!key) return reject(400, 'Bad Request');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${wsAccept(key)}`,
    '\r\n',
  ].join('\r\n'));
  attachVoiceRelay(room, player, socket, head);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`dezhounight server listening on ${PORT}`);
  warmStaticCompression();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'latest.json'), 'utf8'));
    if (manifest.file && !fs.existsSync(path.join(APK_DIR, manifest.file))) {
      console.warn(`[manifest] APK missing: ${manifest.file}`);
    }
  } catch (error) {
    console.warn('[manifest] unreadable', error.message);
  }
});
