#!/usr/bin/env node
/**
 * Production startup wrapper.
 * 1. Starts a minimal HTTP server on :5000 IMMEDIATELY so healthchecks pass.
 * 2. Builds using spawn (non-blocking) so the temp server keeps responding.
 * 3. When build is done, closes temp server and starts the real Express server.
 *
 * Critical: NEVER use execSync here — it blocks the event loop and makes the
 * HTTP server unresponsive, causing "context deadline exceeded" in healthchecks.
 */
const { spawn } = require('child_process');
const http = require('http');

const connections = new Set();

const tempServer = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Building, please wait...\n');
});

tempServer.on('connection', (conn) => {
  connections.add(conn);
  conn.on('close', () => connections.delete(conn));
});

tempServer.listen(5000, '0.0.0.0', () => {
  console.log('[prod-start] Health-check server ready on :5000 — starting build...');

  // Use spawn (non-blocking) so the event loop stays free and the HTTP server
  // above keeps responding to healthcheck requests during the build.
  const build = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: false });

  build.on('close', (code) => {
    if (code !== 0) {
      console.error('[prod-start] Build FAILED (exit code ' + code + ') — aborting.');
      process.exit(1);
    }

    console.log('[prod-start] Build complete — switching to real server...');

    // Force-close all open connections so the port is freed immediately.
    for (const conn of connections) conn.destroy();

    tempServer.close(() => {
      const app = spawn('node', ['dist/index.cjs'], { stdio: 'inherit', shell: false });
      app.on('exit', (code) => process.exit(code ?? 0));
    });
  });

  build.on('error', (err) => {
    console.error('[prod-start] Failed to start build process:', err.message);
    process.exit(1);
  });
});
