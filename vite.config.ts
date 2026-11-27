import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { mapLibreShaderChunks, resolvedShaderModuleId } from './build/maplibre-shaders.ts';

export default defineConfig({
  root: 'client',
  plugins: [react(), mapLibreShaderChunks()],
  resolve: {
    alias: {
      '@zero': fileURLToPath(new URL('./src/modules/popup-banners/zero-block', import.meta.url)),
      '@workspace': fileURLToPath(new URL('./client/src', import.meta.url))
    }
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    assetsDir: 'web-assets',
    rollupOptions: {
      input: {
        workspace: 'client/index.html',
        storefront: 'client/storefront.html',
        tradeIn: 'client/trade-in.html',
        storeMap: 'client/store-map.html',
        storeMapRegistration: 'client/store-map-registration.html',
        supportChat: 'client/support-chat.html'
      },
      output: {
        codeSplitting: {
          groups: [
            {
              // Preserve MapLibre's acyclic ESM boundaries instead of folding its
              // shaders and shared code back into the main module.
              includeDependenciesRecursively: false,
              name(id) {
                const normalizedId = id.replaceAll('\\', '/');
                if (id === resolvedShaderModuleId) return 'maplibre-shaders';
                if (normalizedId.includes('/node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs')) return 'maplibre-shared';
                if (normalizedId.includes('/node_modules/maplibre-gl/')) return 'maplibre';
              }
            },
            {
              // React and other shared dependencies must stay outside editor chunks.
              includeDependenciesRecursively: false,
              name(id) {
                const normalizedId = id.replaceAll('\\', '/');
                if (normalizedId.includes('/node_modules/libphonenumber-js/')) return 'zero-block-phone';
                if (normalizedId.includes('/node_modules/@base-ui/')
                  || normalizedId.includes('/node_modules/@floating-ui/')) return 'zero-block-controls';
                if (normalizedId.includes('/src/modules/popup-banners/zero-block/')) return 'zero-block-canvas';
                // Keep Tiptap's runtime dependencies out of the route that imports its chunk.
                if (normalizedId.includes('/node_modules/@tiptap/')
                  || normalizedId.includes('/node_modules/prosemirror-')
                  || /\/node_modules\/(?:orderedmap|rope-sequence|fast-equals|linkifyjs)\//u.test(normalizedId)) {
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
          ]
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
