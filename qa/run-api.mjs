// Functional + security test suite for the Dezhou Night server.
// Run: node qa/run-api.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createSandbox, startServer, stopServer, makeUser, freePort, sleep,
} from './lib/env.mjs';
import { api, Sse } from './lib/client.mjs';

const results = [];
let currentGroup = '';

function group(name) {
  currentGroup = name;
  console.log(`\n=== ${name} ===`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ group: currentGroup, name, ok: true, detail: detail ?? '' });
    console.log(`[PASS] ${name}${detail ? ` :: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  } catch (error) {
    results.push({ group: currentGroup, name, ok: false, detail: error.message });
    console.log(`[FAIL] ${name} :: ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

let PORT = 0;
const call = (method, p, opts) => api(PORT, method, p, opts);

const USERS = [];
const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi', 'ivan', 'judy', 'ken', 'luna'];
for (let i = 0; i < 40; i += 1) {
  const username = i < NAMES.length ? `qa_${NAMES[i]}` : `qa_p${String(i).padStart(2, '0')}`;
  USERS.push(makeUser({
    username,
    name: i === 0 ? '爱丽丝' : `玩家${i}`,
    tokens: [{ token: `seedtoken_${username}`, at: Date.now() }],
  }));
}
const chipUser = makeUser({
  username: 'qa_chip',
  name: '筹码测试',
  chips: 0,
  tokens: [{ token: 'seedtoken_qa_chip', at: Date.now() }],
});
chipUser.chips = 0;
chipUser.chipsAt = Date.now() - 6 * 60 * 60 * 1000 - 1000;
USERS.push(chipUser);
const brokeUser = makeUser({
  username: 'qa_broke',
  name: '无筹码',
  chips: 0,
  tokens: [{ token: 'seedtoken_qa_broke', at: Date.now() }],
});
brokeUser.chips = 0;
brokeUser.chipsAt = Date.now();
USERS.push(brokeUser);
const byUser = (username) => USERS.find((u) => u.username === username);
const tok = (username) => `seedtoken_${username}`;

const CODES = [{
  code: 'QA10CODE', yuan: 10, maxUses: 2, usedBy: [], createdAt: Date.now(),
}, {
  code: 'QA01CODE', yuan: 1, maxUses: 1, usedBy: [], createdAt: Date.now(),
}];

const sandbox = createSandbox({ users: USERS, codes: CODES, label: 'api' });
const admin = { user: 'qaadmin', password: 'QaAdmin!2345' };
let server;

async function main() {
  PORT = await freePort();
  server = await startServer(sandbox, { port: PORT, admin });
  console.log(`server on ${PORT}, dir ${sandbox.dir}`);

  /* ---------------- basic ---------------- */
  group('basic HTTP');
  await check('health endpoint', async () => {
    const r = await call('GET', '/api/health');
    expectEqual(r.status, 200, 'status');
    expect(r.json?.ok === true, 'ok flag');
    expectEqual(r.json.service, 'dezhounight', 'service');
    expect(r.json.users >= 40, 'user count');
    return r.json;
  });

  await check('root text page', async () => {
    const r = await call('GET', '/');
    expectEqual(r.status, 200, 'status');
    expect(r.text.includes('/play') && r.text.includes('/admin'), 'links');
  });

  await check('web client served', async () => {
    const r = await call('GET', '/play');
    expectEqual(r.status, 200, 'status');
    expect(r.headers['content-type']?.includes('text/html'), 'content type');
    expect(r.text.length > 600000, `size ${r.text.length}`);
    return `${r.text.length} bytes`;
  });

  await check('admin page served', async () => {
    const r = await call('GET', '/admin');
    expectEqual(r.status, 200, 'status');
    expect(r.text.includes('后台管理') || r.text.includes('dezhounight'), 'admin markup');
  });

  await check('public online stats', async () => {
    const r = await call('GET', '/api/stats');
    expectEqual(r.status, 200, 'status');
    expectEqual(r.json.online, 0, 'online');
    expect(r.json.users >= 40, 'users');
    expect(Number.isInteger(r.json.connections), 'connections');
    const p1 = await call('POST', '/api/presence', { body: { id: 'apitestpresence01' } });
    const p2 = await call('POST', '/api/presence', { body: { id: 'apitestpresence02' } });
    expectEqual(p1.status, 200, 'presence 1');
    expectEqual(p1.json.online, 1, 'online 1');
    expectEqual(p2.json.online, 2, 'online 2');
    const live = await call('GET', '/api/stats');
    expectEqual(live.json.online, 2, 'stats online');
  });

  await check('lobby markup has online count and no redeem/account bar', async () => {
    const r = await call('GET', '/play');
    expect(r.text.includes('id="onlineCount"'), 'online count');
    expect(!r.text.includes('id="redeemModal"'), 'redeem modal');
    expect(!r.text.includes('id="accountBar"'), 'account bar');
    expect(r.text.includes('id="btnPlayerChip"'), 'player chip');
    expect(r.text.includes('id="gtShowdown"'), 'showdown panel');
  });

  await check('unknown route 404 json', async () => {
    const r = await call('GET', '/nope');
    expectEqual(r.status, 404, 'status');
    expectEqual(r.json?.error, 'not found', 'body');
  });

  await check('CORS preflight', async () => {
    const r = await call('OPTIONS', '/api/auth/login');
    expectEqual(r.status, 204, 'status');
    expectEqual(r.headers['access-control-allow-origin'], '*', 'acao');
  });

  await check('security headers present', async () => {
    const r = await call('GET', '/api/health');
    const missing = ['x-content-type-options', 'x-frame-options', 'referrer-policy']
      .filter((h) => !r.headers[h]);
    expect(missing.length === 0, `missing: ${missing.join(',')}`);
    const page = await call('GET', '/play');
    expect(String(page.headers['content-security-policy'] || '').includes("default-src 'self'"), 'page CSP');
  });

  /* ---------------- auth ---------------- */
  group('authentication');
  await check('register rejects short username', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: 'ab', password: 'pass1234' } });
    expectEqual(r.status, 400, 'status');
  });

  await check('register rejects short password', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: 'qa_short', password: '12345' } });
    expectEqual(r.status, 400, 'status');
  });

  await check('register rejects 33-char password', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: 'qa_long', password: 'x'.repeat(33) } });
    expectEqual(r.status, 400, 'status');
  });

  await check('register creates account with 100 points', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: 'qa_newbie', password: 'pass1234', name: '新人' } });
    expectEqual(r.status, 201, 'status');
    expect(/^[0-9a-f]{48}$/.test(r.json.token), 'token format');
    expectEqual(r.json.account.points, 100, 'points');
    expectEqual(r.json.account.chips, 100, 'chips');
    const nick = await call('POST', '/api/account/nickname', {
      body: { token: r.json.token, name: '新昵称' },
    });
    expectEqual(nick.status, 200, 'nickname update');
    expectEqual(nick.json.account.name, '新昵称', 'nickname value');
    const phoneNick = await call('POST', '/api/account/nickname', {
      body: { token: r.json.token, name: '13178470821' },
    });
    expectEqual(phoneNick.status, 400, 'phone nickname rejected');
  });

  await check('duplicate register blocked (case insensitive)', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: 'QA_NEWBIE', password: 'pass1234' } });
    expectEqual(r.status, 409, 'status');
  });

  await check('register allows chinese username', async () => {
    const r = await call('POST', '/api/auth/register', { body: { username: '测试玩家', password: 'pass1234' } });
    expectEqual(r.status, 201, 'status');
  });

  await check('login rejects wrong password', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'qa_alice', password: 'wrong-pass' } });
    expectEqual(r.status, 401, 'status');
  });

  await check('login rejects unknown user', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'qa_ghost', password: 'whatever' } });
    expectEqual(r.status, 401, 'status');
  });

  await check('login succeeds and issues fresh token', async () => {
    const r = await call('POST', '/api/auth/login', { body: { username: 'qa_alice', password: 'pass1234' } });
    expectEqual(r.status, 200, 'status');
    expect(r.json.token !== tok('qa_alice'), 'new token');
    expectEqual(r.json.account.username, 'qa_alice', 'username');
    globalThis.aliceToken = r.json.token;
  });

  await check('/me requires token', async () => {
    const r = await call('GET', '/api/auth/me');
    expectEqual(r.status, 401, 'status');
  });

  await check('/me accepts both old and new tokens', async () => {
    const a = await call('GET', `/api/auth/me?token=${tok('qa_alice')}`);
    const b = await call('GET', `/api/auth/me?token=${globalThis.aliceToken}`);
    expectEqual(a.status, 200, 'seeded token');
    expectEqual(b.status, 200, 'login token');
  });

  await check('six-hour grant adds 100 chips', async () => {
    const r = await call('GET', '/api/auth/me?token=seedtoken_qa_chip');
    expectEqual(r.status, 200, 'status');
    expectEqual(r.json.account.chips, 100, 'chips');
    expect(r.json.account.chipsRefillAt > Date.now(), 'next grant in future');
  });

  await check('quick match requires at least one chip', async () => {
    const r = await call('POST', '/api/match/quick', {
      body: { token: 'seedtoken_qa_broke' },
    });
    expectEqual(r.status, 403, 'status');
    expect(/筹码/.test(r.json.error), 'chip error');
    const room = await call('POST', '/api/rooms', {
      body: { token: 'seedtoken_qa_broke', name: '零筹码好友房', seats: 2, password: '246' },
    });
    expectEqual(room.status, 201, 'friend room without chips');
    const leave = await call('POST', `/api/rooms/${room.json.code}/leave`, {
      body: { token: room.json.token },
    });
    expectEqual(leave.status, 200, 'leave');
  });

  await check('logout revokes only its own token', async () => {
    const login = await call('POST', '/api/auth/login', { body: { username: 'qa_alice', password: 'pass1234' } });
    const temp = login.json.token;
    await call('POST', '/api/auth/logout', { body: { token: temp } });
    const dead = await call('GET', `/api/auth/me?token=${temp}`);
    const alive = await call('GET', `/api/auth/me?token=${tok('qa_alice')}`);
    expectEqual(dead.status, 401, 'revoked');
    expectEqual(alive.status, 200, 'other session kept');
  });

  await check('password change verifies old password', async () => {
    const r = await call('POST', '/api/auth/password', {
      body: { token: tok('qa_bob'), oldPassword: 'nope', newPassword: 'newpass123' },
    });
    expectEqual(r.status, 403, 'status');
  });

  await check('password change rejects short new password', async () => {
    const r = await call('POST', '/api/auth/password', {
      body: { token: tok('qa_bob'), oldPassword: 'pass1234', newPassword: '123' },
    });
    expectEqual(r.status, 400, 'status');
  });

  await check('password change works', async () => {
    const r = await call('POST', '/api/auth/password', {
      body: { token: tok('qa_bob'), oldPassword: 'pass1234', newPassword: 'newpass123' },
    });
    expectEqual(r.status, 200, 'status');
    const login = await call('POST', '/api/auth/login', { body: { username: 'qa_bob', password: 'newpass123' } });
    expectEqual(login.status, 200, 'new password login');
  });

  await check('SEC: password change revokes other sessions', async () => {
    const me = await call('GET', `/api/auth/me?token=${tok('qa_bob')}`);
    expectEqual(me.status, 401, 'old session still valid after password change');
  });

  group('account / economy');
  await check('leaderboard masks usernames', async () => {
    const r = await call('GET', '/api/leaderboard');
    expectEqual(r.status, 200, 'status');
    expect(Array.isArray(r.json.chips) && r.json.chips.length > 0, 'rank list');
    const row = r.json.chips.find((x) => x.username.includes('***'));
    expect(row, 'masked username present');
    expect(!r.json.chips.some((x) => /^qa_/.test(x.username)), 'raw usernames leaked');
    return row;
  });

  await check('leaderboard masks display names', async () => {
    const r = await call('GET', '/api/leaderboard');
    const names = r.json.chips.map((x) => x.name);
    expect(names.every((n) => !n || n.includes('*')), `names: ${names.slice(0, 3)}`);
  });

  await check('recharge disabled by default', async () => {
    const r = await call('POST', '/api/recharge', { body: { token: tok('qa_alice'), yuan: 10 } });
    expectEqual(r.status, 403, 'status');
  });

  await check('redeem endpoint removed', async () => {
    const r = await call('POST', '/api/redeem', { body: { token: tok('qa_carol'), code: 'QA10CODE' } });
    expectEqual(r.status, 404, 'status');
  });

  await check('daily points are not granted twice per day', async () => {
    const a = await call('GET', `/api/auth/me?token=${tok('qa_grace')}`);
    const b = await call('GET', `/api/auth/me?token=${tok('qa_grace')}`);
    expectEqual(a.json.account.points, b.json.account.points, 'points drift');
  });

  /* ---------------- admin ---------------- */
  group('admin');
  await check('admin login rejects wrong credentials', async () => {
    const r = await call('POST', '/api/admin/login', { body: { username: admin.user, password: 'bad' } });
    expectEqual(r.status, 401, 'status');
  });

  await check('admin endpoints reject unauthenticated', async () => {
    const paths = ['/api/admin/overview', '/api/admin/users', '/api/admin/codes', '/api/admin/history'];
    for (const p of paths) {
      const r = await call('GET', p);
      expectEqual(r.status, 401, p);
    }
  });

  await check('admin login and overview', async () => {
    const r = await call('POST', '/api/admin/login', { body: { username: admin.user, password: admin.password } });
    expectEqual(r.status, 200, 'status');
    globalThis.adminToken = r.json.token;
    const o = await call('GET', `/api/admin/overview?token=${globalThis.adminToken}`);
    expectEqual(o.status, 200, 'overview status');
    expect(o.json.users >= 40, 'user total');
    const header = await call('GET', '/api/admin/overview', {
      headers: { Authorization: `Bearer ${globalThis.adminToken}` },
    });
    expectEqual(header.status, 200, 'overview via Authorization header');
    return { users: o.json.users, rooms: o.json.rooms.length };
  });

  await check('admin global feature switches', async () => {
    const pub = await call('GET', '/api/features');
    expectEqual(pub.status, 200, 'public features');
    const set = (body) => call('POST', '/api/admin/features', {
      body: { token: globalThis.adminToken, ...body },
    });
    try {
      const offMatch = await set({ matchEnabled: false });
      expectEqual(offMatch.status, 200, 'match off');
      const quick = await call('POST', '/api/match/quick', { body: { token: tok('qa_alice') } });
      expectEqual(quick.status, 403, 'quick blocked');
      await set({ matchEnabled: true });

      const offLan = await set({ lanEnabled: false });
      expectEqual(offLan.status, 200, 'lan off');
      const room = await call('POST', '/api/rooms', {
        body: { token: tok('qa_alice'), name: '关闭测试', seats: 2, password: '246' },
      });
      expectEqual(room.status, 403, 'lan blocked');

      const allOff = await set({ onlineEnabled: false });
      expectEqual(allOff.status, 200, 'master off');
      expectEqual(allOff.json.features.onlineEnabled, false, 'online flag off');
      expectEqual(allOff.json.features.matchEnabled, false, 'master disables match');
      expectEqual(allOff.json.features.lanEnabled, false, 'master disables lan');
      const quick2 = await call('POST', '/api/match/quick', { body: { token: tok('qa_alice') } });
      expectEqual(quick2.status, 403, 'master blocks quick');
      const room2 = await call('POST', '/api/rooms', {
        body: { token: tok('qa_alice'), name: '总开关测试', seats: 2, password: '246' },
      });
      expectEqual(room2.status, 403, 'master blocks friend room');
      await set({ onlineEnabled: true });
    } finally {
      await set({ matchEnabled: true, lanEnabled: true });
    }
  });

  await check('admin code endpoints removed', async () => {
    const r = await call('POST', '/api/admin/codes', {
      body: { token: globalThis.adminToken, yuan: 5, count: 3 },
    });
    expectEqual(r.status, 404, 'status');
  });

  await check('admin user update clamps chips and revokes on password reset', async () => {
    const r = await call('POST', '/api/admin/users/update', {
      body: { token: globalThis.adminToken, username: 'qa_heidi', chips: 999999, points: -5 },
    });
    expectEqual(r.status, 200, 'update');
    expectEqual(r.json.user.chips, 100000, 'chip clamp');
    expectEqual(r.json.user.points, 0, 'points clamp');
    const reset = await call('POST', '/api/admin/users/update', {
      body: { token: globalThis.adminToken, username: 'qa_heidi', password: 'resetpass1' },
    });
    expectEqual(reset.status, 200, 'password reset');
    const me = await call('GET', `/api/auth/me?token=${tok('qa_heidi')}`);
    expectEqual(me.status, 401, 'token revoked');
  });

  await check('admin delete user removes account', async () => {
    const r = await call('POST', '/api/admin/users/delete', {
      body: { token: globalThis.adminToken, username: 'qa_ivan' },
    });
    expectEqual(r.status, 200, 'delete');
    const me = await call('GET', `/api/auth/me?token=${tok('qa_ivan')}`);
    expectEqual(me.status, 401, 'token dead');
  });

  /* ---------------- private rooms ---------------- */
  group('private rooms');
  await check('private room creation works', async () => {
    const r = await call('POST', '/api/rooms', {
      body: { token: tok('qa_alice'), name: 'qa room', seats: 8, password: '123' },
    });
    expectEqual(r.status, 201, 'status');
    expect(/^\d{3}$/.test(r.json.code), 'code');
    expectEqual(r.json.host, true, 'host');
    globalThis.privateCode = r.json.code;
    return r.json;
  });

  await check('failed room creation does not leak a ghost room', async () => {
    const before = await call('GET', '/api/rooms');
    const bad = await call('POST', '/api/rooms', {
      body: { token: tok('qa_alice'), name: 'bad', seats: 8, password: '1' },
    });
    expectEqual(bad.status, 400, 'bad password');
    const after = await call('GET', '/api/rooms');
    expectEqual(after.json.rooms.length, before.json.rooms.length, 'room count');
    expect(!after.json.rooms.some((x) => x.players === 0), 'no empty ghost room');
  });

  group('input handling');
  await check('rejects oversized body', async () => {
    const big = 'x'.repeat(100 * 1024);
    let status = 0;
    let socketError = '';
    try {
      const r = await call('POST', '/api/auth/login', { rawBody: JSON.stringify({ username: 'qa_alice', password: big }) });
      status = r.status;
    } catch (error) {
      socketError = error.message;
    }
    expect(status === 400 || socketError !== '', `status ${status} error ${socketError}`);
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'server survived oversized body');
    return status === 400 ? '400 response' : `connection reset (${socketError})`;
  });

  await check('rejects invalid json', async () => {
    const r = await call('POST', '/api/auth/login', { rawBody: '{oops' });
    expectEqual(r.status, 400, 'status');
  });

  await check('survives prototype pollution payload', async () => {
    const r = await call('POST', '/api/auth/login', {
      rawBody: JSON.stringify({ username: 'qa_alice', password: 'x', __proto__: { polluted: true } }),
    });
    expect(r.status === 401 || r.status === 400, `status ${r.status}`);
    const health = await call('GET', '/api/health');
    expectEqual(health.status, 200, 'still alive');
  });

  await check('PATH: download traversal blocked', async () => {
    for (const p of [
      '/download/..%2Fserver.js',
      '/download/%2e%2e%2fserver.js',
      '/download/..%5Cserver.js',
      '/download/server.js',
    ]) {
      const r = await call('GET', p);
      expectEqual(r.status, 404, p);
    }
  });

  await check('download rejects non-apk and serves apk', async () => {
    const bad = await call('GET', '/download/latest.json');
    expectEqual(bad.status, 404, 'json blocked');
    const ok = await call('GET', '/download/DezhouNight-1.0.4.apk');
    expectEqual(ok.status, 200, 'apk status');
    expect(ok.headers['content-type']?.includes('android'), 'content type');
    return `${ok.headers['content-length']} bytes`;
  });

  await check('manifest-listed APK is downloadable', async () => {
    const manifest = await call('GET', '/api/app/latest');
    const url = new URL(manifest.json.url);
    const r = await call('GET', url.pathname);
    expectEqual(r.status, 200, `${url.pathname} (manifest says ${manifest.json.versionName})`);
    return `${manifest.json.versionName} ${r.headers['content-length']} bytes`;
  });

  await check('range request supported for apk', async () => {
    const r = await call('GET', '/download/DezhouNight-1.0.4.apk', { headers: { Range: 'bytes=0-99' } });
    expectEqual(r.status, 206, 'status');
    expectEqual(r.headers['content-length'], '100', 'length');
    expect(r.headers['content-range']?.startsWith('bytes 0-99/'), 'content range');
  });

  await check('app manifest uses request Host (spoofable)', async () => {
    const http = await import('node:http');
    const body = await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1', port: PORT, path: '/api/app/latest', method: 'GET',
        headers: { Host: 'evil.example' },
      }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.end();
    });
    expectEqual(body.status, 200, 'status');
    const json = JSON.parse(body.body);
    expect(json.url.startsWith('http://evil.example/'), `url ${json.url}`);
    return json.url;
  });

  await check('SEC: repeated login failures lock the account', async () => {
    const statuses = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await call('POST', '/api/auth/login', {
        body: { username: 'qa_alice', password: `bad-${i}` },
        timeout: 20000,
      });
      statuses.push(r.status);
    }
    expect(statuses.includes(429), `statuses ${statuses}`);
    return statuses;
  });

  await check('SEC: Authorization header is the supported path', async () => {
    const r = await call('GET', '/api/auth/me', {
      headers: { Authorization: `Bearer ${globalThis.aliceToken}` },
    });
    expectEqual(r.status, 200, 'header token');
  });

  /* ---------------- summary ---------------- */
  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== SUMMARY: ${results.length - failed.length}/${results.length} passed, ${failed.length} failed =====`);
  if (failed.length) {
    for (const f of failed) console.log(`  FAIL ${f.group} / ${f.name}: ${f.detail}`);
  }
  const outFile = path.join(import.meta.dirname, 'out');
  fs.mkdirSync(outFile, { recursive: true });
  fs.writeFileSync(path.join(outFile, 'api-results.json'), JSON.stringify({ port: PORT, results }, null, 2));
}

main()
  .catch((error) => {
    console.error('FATAL', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try { await fetch(`http://127.0.0.1:${PORT}/api/health`); } catch { /* */ }
    stopServer(server);
    await sleep(600);
  });
