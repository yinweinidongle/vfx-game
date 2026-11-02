import { defineConfig } from 'vite';
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: { lab: 'index.html', game: 'game.html' },
      output: {
        manualChunks(id) {
          if ((id.includes('node_modules/three/src/') || id.includes('node_modules/three/build/'))) return 'three-core';
          if (id.includes('node_modules/three/examples/')) return 'three-addons';
        },
      },
    },
  },
});
