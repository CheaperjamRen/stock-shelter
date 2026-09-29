import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// 扶摇 API Key 由服务端环境变量注入代理（不进 bundle）。
// 本地开发：FUYAO_API_KEY=sk-xxx npm run dev
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/fuyao/api': {
        target: 'https://fuyao.aicubes.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fuyao\/api/, '/api'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const key = process.env.FUYAO_API_KEY;
            if (key) proxyReq.setHeader('X-api-key', key);
          });
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});