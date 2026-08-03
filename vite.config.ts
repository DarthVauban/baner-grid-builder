import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    assetsDir: 'web-assets',
    rollupOptions: {
      input: {
        workspace: 'client/index.html',
        storefront: 'client/storefront.html',
        tradeIn: 'client/trade-in.html',
        storeMap: 'client/store-map.html'
      },
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll('\\', '/');
          if (normalizedId.includes('/node_modules/@tiptap/')
            || normalizedId.includes('/node_modules/prosemirror-')) {
            return 'tiptap-editor';
          }
          if (normalizedId.includes('/node_modules/@lezer/')
            || normalizedId.includes('/node_modules/@codemirror/language/')
            || normalizedId.includes('/node_modules/@codemirror/lang-')) {
            return 'codemirror-language';
          }
          if (normalizedId.includes('/node_modules/@codemirror/state/')
            || normalizedId.includes('/node_modules/@codemirror/view/')) {
            return 'codemirror-core';
          }
          if (normalizedId.includes('/node_modules/@codemirror/')) {
            return 'codemirror-features';
          }
          if (normalizedId.includes('/node_modules/@uiw/react-codemirror/')) {
            return 'react-codemirror';
          }
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true
  }
});
