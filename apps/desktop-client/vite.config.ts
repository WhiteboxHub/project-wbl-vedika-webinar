import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    allowedHosts: true,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      },
      '/signal': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
      '/livekit': {
        target: 'http://localhost:7880',
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
        rewrite: (path) => path.replace(/^\/livekit/, ''),
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    }
  },
  envPrefix: ['VITE_', 'TAURI_'],
  optimizeDeps: {
    exclude: ['@webinar/shared'],
  },
  resolve: {
    // Prefer .ts over .js when both exist (avoids stale CJS artifacts in shared/src)
    extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.json'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: '@webinar/shared',
        replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    ],
  },
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});
