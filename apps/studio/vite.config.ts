import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const pkg = (name: string) => fileURLToPath(new URL(`../../packages/${name}/src`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@kinemorph/core': pkg('core'),
      '@kinemorph/renderer': pkg('renderer'),
      '@kinemorph/audio': pkg('audio'),
      '@kinemorph/export': pkg('export')
    }
  },
  build: {
    outDir: '../../studio',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500
  }
});
