import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({ build: { rollupOptions: { input: { directory: fileURLToPath(new URL('./index.html', import.meta.url)), lab: fileURLToPath(new URL('./lab.html', import.meta.url)) } } } });
