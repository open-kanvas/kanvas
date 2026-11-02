import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:8807',headless:true},webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 8807 --strictPort',url:'http://127.0.0.1:8807/tests/math-browser/index.html',reuseExistingServer:false},reporter:'list'});
