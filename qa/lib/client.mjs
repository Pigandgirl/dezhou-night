// Minimal HTTP + SSE test clients (no external deps).
import http from 'node:http';
import net from 'node:net';
import { EventEmitter } from 'node:events';

export async function api(port, method, path, { body, headers = {}, timeout = 10000, rawBody } = {}) {
  const started = Date.now();
  const payload = rawBody !== undefined ? rawBody : (body !== undefined ? JSON.stringify(body) : undefined);
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(payload !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: payload,
    signal: AbortSignal.timeout(timeout),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers.entries()),
    text,
    json,
    ms: Date.now() - started,
  };
}

/** Send exact bytes on a socket (for malformed / illegal HTTP requests). */
export function rawRequest(port, requestText, { timeout = 4000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    let data = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch { /* */ }
      resolve(result);
    };
    socket.setTimeout(timeout, () => finish({ error: 'timeout', data }));
    socket.on('connect', () => socket.write(requestText));
    socket.on('data', (chunk) => { data += chunk.toString('utf8'); });
    socket.on('error', (error) => finish({ error: error.message, data }));
    socket.on('close', () => finish({ data }));
    socket.setNoDelay?.(true);
  });
}

export class Sse extends EventEmitter {
  constructor(port, path, { headers = {}, label = '' } = {}) {
    super();
    this.port = port;
    this.path = path;
    this.headers = headers;
    this.label = label;
    this.status = 0;
    this.buffer = '';
    this.counts = new Map();
    this.bytes = 0;
    this.closed = false;
    this.openedAt = 0;
    this.lastEventAt = 0;
    this.frames = [];
    this.req = null;
    this.res = null;
    this.error = null;
  }

  open() {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: this.port,
        path: this.path,
        method: 'GET',
        headers: { Accept: 'text/event-stream', ...this.headers },
        agent: false,
      }, (res) => {
        this.res = res;
        this.status = res.statusCode;
        this.openedAt = Date.now();
        if (res.statusCode !== 200) {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            this.error = `HTTP ${res.statusCode} ${body.slice(0, 300)}`;
            this.closed = true;
            reject(new Error(this.error));
          });
          return;
        }
        res.setEncoding('utf8');
        res.on('data', (chunk) => this._onChunk(chunk));
        res.on('end', () => { this.closed = true; this.emit('closed'); });
        res.on('error', (error) => { this.error = error.message; });
        resolve(this);
      });
      req.on('error', (error) => {
        this.error = error.message;
        this.closed = true;
        reject(error);
      });
      this.req = req;
      req.end();
    });
  }

  _onChunk(chunk) {
    this.bytes += Buffer.byteLength(chunk);
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n\n');
    while (index >= 0) {
      const frame = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 2);
      this._onFrame(frame);
      index = this.buffer.indexOf('\n\n');
    }
  }

  _onFrame(frame) {
    let event = 'message';
    const dataLines = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith(':')) continue;
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (!dataLines.length) return;
    const raw = dataLines.join('\n');
    let data = null;
    try { data = JSON.parse(raw); } catch { data = raw; }
    this.counts.set(event, (this.counts.get(event) || 0) + 1);
    this.lastEventAt = Date.now();
    if (this.frames.length < 5000) this.frames.push({ event, data, at: this.lastEventAt });
    this.emit('event', { event, data, at: this.lastEventAt });
    this.emit(event, data);
  }

  count(event) {
    return this.counts.get(event) || 0;
  }

  pause() { this.res?.pause(); }
  resume() { this.res?.resume(); }

  close() {
    if (this.closed) return;
    this.closed = true;
    try { this.req?.destroy(); } catch { /* */ }
    try { this.res?.destroy(); } catch { /* */ }
    this.emit('closed');
  }

  waitFor(event, timeoutMs = 8000, predicate = null) {
    const matches = this.frames.filter((f) => f.event === event && (!predicate || predicate(f.data)));
    if (matches.length) return Promise.resolve(matches[matches.length - 1].data);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { cleanup(); resolve(null); }, timeoutMs);
      const handler = (data) => {
        if (predicate && !predicate(data)) return;
        cleanup();
        resolve(data);
      };
      const cleanup = () => { clearTimeout(timer); this.off(event, handler); };
      this.on(event, handler);
    });
  }
}
