import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config';
export default mergeConfig(base,defineConfig({cacheDir:process.env.KANVAS_GAME_CACHE??'/tmp/kanvas-game-vite-cache'}));
