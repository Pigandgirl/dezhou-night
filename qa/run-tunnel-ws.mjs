// Prove the game's WebSocket voice relay works through a localhost.run HTTPS
// tunnel: local sandbox server -> SSH tunnel -> wss://.../api/voice-relay.
// Run: node qa/run-tunnel-ws.mjs
import { spawn } from 'node:child_process';
import { createSandbox, makeUser, newToken, startServer, stopServer, freePort, sleep } from './lib/env.mjs';

const tokenA = newToken();
const tokenB = newToken();
const sandbox = createSandbox({
  users: [
    makeUser({ username: 'voice_a', name: 'VoiceA', tokens: [{ token: tokenA, at: Date.now() }] }),
    makeUser({ username: 'voice_b', name: 'VoiceB', tokens: [{ token: tokenB, at: Date.now() }] }),
  ],
  label: 'tunnel-ws',
});
const port = await freePort();
const server = await startServer(sandbox, { port });
let tunnel = null;
let ws = null;

function waitForUrl(child, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`tunnel URL timeout\n${text.slice(-800)}`)), timeoutMs);
    const onData = (chunk) => {
      text += chunk.toString();
      const match = /https:\/\/[a-z0-9-]+\.lhr\.life/i.exec(text);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`tunnel exited ${code}\n${text.slice(-800)}`));
    });
  });
}

try {
  const create = await fetch(`http://127.0.0.1:${port}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Version': '121' },
    body: JSON.stringify({ token: tokenA, name: 'VoiceTunnel', seats: 2, password: '123' }),
  });
  const room = await create.json();
  if (create.status !== 201) throw new Error(`room HTTP ${create.status}: ${JSON.stringify(room)}`);
  console.log('room', { code: room.code, pid: room.pid });

  const join = await fetch(`http://127.0.0.1:${port}/api/rooms/${room.code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Version': '121' },
    body: JSON.stringify({ token: tokenB, password: '123', name: 'VoiceB' }),
  });
  console.log('join HTTP', join.status);
  if (!join.ok) throw new Error(`join HTTP ${join.status}: ${await join.text()}`);

  tunnel = spawn('ssh', [
    '-tt',
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', `UserKnownHostsFile=${process.env.TEMP ? `${process.env.TEMP}/known_hosts_lhr_ws` : '/tmp/known_hosts_lhr_ws'}`,
    '-o', 'ConnectTimeout=12',
    '-o', 'ServerAliveInterval=30',
    '-o', 'ExitOnForwardFailure=yes',
    '-R', `80:127.0.0.1:${port}`,
    'nokey@localhost.run',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const base = await waitForUrl(tunnel);
  console.log('tunnel', base);

  const sseUrl = `${base}/api/rooms/${room.code}/events?token=${encodeURIComponent(room.token)}`;
  const sse = await fetch(sseUrl, { headers: { Accept: 'text/event-stream' } });
  const contentType = sse.headers.get('content-type') || '';
  if (sse.status !== 200 || !contentType.includes('text/event-stream') || !sse.body) {
    throw new Error(`SSE HTTP ${sse.status} ${contentType}`);
  }
  const reader = sse.body.getReader();
  const early = await Promise.race([
    reader.read().then((result) => (result.value ? new TextDecoder().decode(result.value).slice(0, 160) : 'closed')),
    new Promise((resolve) => setTimeout(() => resolve('no-early-bytes'), 5000)),
  ]);
  console.log('SSE_OK', contentType, JSON.stringify(early));
  await sse.body.cancel().catch(() => {});

  const wsUrl = base.replace(/^https:/, 'wss:')
    + `/api/voice-relay?code=${encodeURIComponent(room.code)}&token=${encodeURIComponent(room.token)}&v=121`;
  console.log('ws', wsUrl.replace(tokenA, '<token>'));

  const opened = await new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    ws = socket;
    const timer = setTimeout(() => { try { socket.close(); } catch { /* */ } reject(new Error('WS open timeout')); }, 20000);
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      clearTimeout(timer);
      const frame = new Uint8Array([0, 0, 0, 1, 1, 2, 3, 4]);
      socket.send(frame);
      setTimeout(() => {
        try { socket.close(); } catch { /* */ }
        resolve('open');
      }, 300);
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error('WS error'));
    };
    socket.onclose = (event) => {
      if (event.wasClean) return;
      clearTimeout(timer);
      reject(new Error(`WS closed code=${event.code} reason=${event.reason}`));
    };
  });
  console.log('WEBSOCKET_OK', opened);
  console.log('TUNNEL_WS_OK');
} finally {
  try { ws?.close(); } catch { /* */ }
  try { tunnel?.kill(); } catch { /* */ }
  stopServer(server);
  await sleep(300);
}

