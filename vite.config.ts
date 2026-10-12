import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // Zappar's CV library resolves its worker and wasm with `new URL(..., import.meta.url)`;
    // dev-server pre-bundling would break those relative URLs, so serve the Zappar packages as-is
    // and pre-bundle only their CommonJS dependencies.
    exclude: ['@zappar/zappar-threejs', '@zappar/zappar', '@zappar/zappar-cv'],
    include: [
      '@zappar/zappar-threejs > @zappar/zappar > @zappar/zappar-cv > ua-parser-js',
      '@zappar/zappar-threejs > @zappar/zappar > gl-matrix',
    ],
  },
});
