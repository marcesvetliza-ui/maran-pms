#!/usr/bin/env node
/**
 * Production startup wrapper.
 * 1. Starts a minimal HTTP server on :5000 immediately so healthchecks pass.
 * 2. Runs `npm run build` to rebuild dist/ inside the run container.
 * 3. Shuts down the temp server and starts the real Express server.
 */
const { execSync } = require('child_process');
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

tempServer.listen(5000, () => {
  console.log('[prod-start] Health-check server ready on :5000 — starting build...');

  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch (err) {
    console.error('[prod-start] Build FAILED — aborting.');
    process.exit(1);
  }

  console.log('[prod-start] Build complete — switching to real server...');

  // Destroy all open connections so the port is freed immediately.
  for (const conn of connections) conn.destroy();

  tempServer.close(() => {
    const app = spawn('node', ['dist/index.cjs'], { stdio: 'inherit' });
    app.on('exit', (code) => process.exit(code ?? 0));
  });
});
