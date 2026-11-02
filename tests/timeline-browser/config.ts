import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'*.spec.ts',workers:1,use:{baseURL:'http://127.0.0.1:8805',headless:true},webServer:{cwd:process.cwd(),command:'node_modules/.bin/vite --host 127.0.0.1 --port 8805',url:'http://127.0.0.1:8805',reuseExistingServer:false},reporter:'list'});
