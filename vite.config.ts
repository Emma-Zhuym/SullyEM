import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { bakeVoiceMiddleware } from './server/bake-voice-middleware';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'bake-voice-middleware',
      configureServer(server) {
        server.middlewares.use('/api/minimax/bake-voice', bakeVoiceMiddleware);
      },
    },
  ],
  base: './', // 关键配置：使用相对路径，确保在 GitHub Pages 子目录下能找到资源
  server: {
    host: true, // 允许局域网内的手机访问
    proxy: {
      '/api/minimax/t2a': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/t2a_v2',
      },
      '/api/minimax/get-voice': {
        target: 'https://api.minimaxi.com',
        changeOrigin: true,
        secure: true,
        rewrite: () => '/v1/get_voice',
      },
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // 关键修复：将这些包排除在打包之外，让浏览器通过 index.html 的 importmap 加载
      external: ['pdfjs-dist', 'katex', 'jszip']
    }
  }
});
