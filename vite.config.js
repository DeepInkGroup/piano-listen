import { defineConfig } from 'vite';
export default defineConfig({ base: './', esbuild: false, build: { target: 'esnext', minify: false, chunkSizeWarningLimit: 1600 } });
