import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
export default defineConfig({root:path.resolve('scripts/ota-access-browser'),plugins:[react()],resolve:{alias:[{find:'@/App',replacement:path.resolve('scripts/ota-access-browser/auth-stub.ts')},{find:'@',replacement:path.resolve('client/src')},{find:'@shared',replacement:path.resolve('shared')}]},server:{host:'127.0.0.1',port:5018,strictPort:true,fs:{allow:[process.cwd()]}}});
