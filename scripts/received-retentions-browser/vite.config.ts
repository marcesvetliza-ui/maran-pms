import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({
  root: path.resolve('scripts/received-retentions-browser'),
  plugins: [react()],
  resolve: { alias: { '@/App': path.resolve('scripts/received-retentions-browser/auth-stub.ts'), '@': path.resolve('client/src'), '@shared': path.resolve('shared') } },
  server: { host: '127.0.0.1', port: 5015, strictPort: true, fs: { allow: [process.cwd()] } },
});
