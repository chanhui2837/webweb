import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 시 API/업로드 요청을 Express 서버(4000)로 프록시
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
});
