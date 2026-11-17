import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The data/*.csv files are imported with "?raw", so editing a CSV hot-reloads the app in dev mode.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: './',
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    // The single-file preview build inlines everything into one HTML page (see scripts/inline_build.mjs).
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    cssCodeSplit: mode !== 'single',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
