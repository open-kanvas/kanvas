import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
