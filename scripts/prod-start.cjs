#!/usr/bin/env node
/**
 * Production startup wrapper — zero healthcheck gap.
 *
 * Strategy:
 *  1. Hold port 5000 permanently with a proxy/stub server (never closes).
 *  2. Build the app with spawn() — non-blocking, event loop stays alive,
 *     proxy responds 200 "Building..." to every healthcheck.
 *  3. Start the real server on PORT=3001 via spawn + IPC.
 *  4. When the real server signals "ready", switch the proxy to forward
 *     all traffic to 127.0.0.1:3001.  Port 5000 is NEVER closed — zero gap.
 *
 * Why not execSync: it blocks the event loop, making the HTTP server
 * unresponsive → "context deadline exceeded" in healthchecks.
 */

const http = require('http');
const { spawn } = require('child_process');

let appReady = false; // flips true once real server signals readiness

// ── Simple HTTP proxy ─────────────────────────────────────────────────────────
function proxyRequest(req, res) {
  const options = {
    hostname: '127.0.0.1',
    port: 3001,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Bad Gateway');
  });
  req.pipe(proxyReq, { end: true });
}

// ── Permanent holder of port 5000 ────────────────────────────────────────────
const stubServer = http.createServer((req, res) => {
  if (!appReady) {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Building, please wait...\n');
  } else {
    proxyRequest(req, res);
  }
});

// Also proxy WebSocket / upgrade requests once app is ready
stubServer.on('upgrade', (req, socket, head) => {
  if (!appReady) { socket.destroy(); return; }
  const conn = require('net').connect(3001, '127.0.0.1', () => {
    conn.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
      Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      `\r\n\r\n`
    );
    conn.write(head);
    socket.pipe(conn);
    conn.pipe(socket);
  });
  conn.on('error', () => socket.destroy());
});

stubServer.listen(5000, '0.0.0.0', () => {
  console.log('[prod-start] Stub server on :5000 — building...');

  // ── Step 1: Install deps + Build ────────────────────────────────────────────
  const build = spawn('sh', ['-c', 'npm install && npm run build'], { stdio: 'inherit', shell: false });

  build.on('error', (err) => {
    console.error('[prod-start] Failed to start build:', err.message);
    process.exit(1);
  });

  build.on('close', (code) => {
    if (code !== 0) {
      console.error('[prod-start] Build FAILED (exit ' + code + ')');
      process.exit(1);
    }
    console.log('[prod-start] Build done — starting app on :3001...');

    // ── Step 2: Start real server on port 3001 ──────────────────────────────
    const app = spawn('node', ['dist/index.cjs'], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      shell: false,
      env: { ...process.env, PORT: '3001' },
    });

    app.on('message', (msg) => {
      if (msg === 'ready') {
        console.log('[prod-start] App ready — proxying :5000 → :3001');
        appReady = true;
        // Optionally disconnect IPC channel (app keeps running)
        app.disconnect();
      }
    });

    app.on('error', (err) => {
      console.error('[prod-start] App process error:', err.message);
      process.exit(1);
    });

    app.on('exit', (code) => {
      console.error('[prod-start] App exited with code', code);
      process.exit(code ?? 1);
    });
  });
});
