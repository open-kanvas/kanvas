import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';

export default defineConfig({
  plugins: [react(), {name: 'third-party-notices', generateBundle() { this.emitFile({type: 'asset', fileName: 'assets/THIRD-PARTY-NOTICES.txt', source: readFileSync('public/THIRD-PARTY-NOTICES.txt', 'utf8')}); }}],
  build: {
    outDir: 'dist/client', sourcemap: false,
    // Keep font files same-origin: the application CSP intentionally rejects data: fonts.
    assetsInlineLimit: filePath => /\.(?:woff2?|ttf|otf)$/i.test(filePath) ? false : undefined,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: false },
      '/mcp': { target: 'http://127.0.0.1:8787', changeOrigin: false },
    },
  },
});
