import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import {realpathSync} from 'node:fs';
// Test-only allowance for an isolated symlinked KaTeX dependency overlay.
export default defineConfig({plugins:[react()],server:{fs:{allow:[process.cwd(),realpathSync('node_modules/katex')]}}});
