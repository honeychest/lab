import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium'; // 이 플러그인을 쓰면 설정이 제일 쉽습니다.
import tailwindcss from '@tailwindcss/vite';
import * as path from "node:path"; // v4 플러그인

export default defineConfig({
  plugins: [react(), cesium(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"), // shadcn을 위한 경로 별칭
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/ws/binance-price': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true
      },
      '/ws/upbit-price': {
        target: 'ws://localhost:8080',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
