import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, 'frontend'),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.join(rootDir, 'public'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.join(rootDir, 'frontend', 'index.html'),
        upload: path.join(rootDir, 'frontend', 'upload.html'),
        detail: path.join(rootDir, 'frontend', 'detail.html'),
        profile: path.join(rootDir, 'frontend', 'profile.html'),
      },
    },
  },
});
