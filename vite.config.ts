import { defineConfig } from 'vitest/config';

// base: './' so the bundle works from Android assets (WebViewAssetLoader) as well as a web server.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
  },
});
