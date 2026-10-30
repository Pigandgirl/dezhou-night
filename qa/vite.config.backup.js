import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [viteSingleFile()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || 'dev'),
    __APP_VERSION_CODE__: JSON.stringify(process.env.APP_VERSION_CODE || '0'),
    __UPDATE_BASE__: JSON.stringify(process.env.UPDATE_BASE || ''),
  },
  build: {
    target: 'es2018',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
});
