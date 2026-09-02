import { defineConfig } from 'vite';

// `vite dev` serves the demo at its root.
// `vite build` produces the SDK library in lib mode.
export default defineConfig({
  root: 'demo',
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: true,
  },
});
