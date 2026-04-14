import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
const ktBackendUrl = process.env.VITE_KT_BACKEND_URL || 'http://127.0.0.1:8001'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('@xterm/')) return 'vendor-terminal'
          // shiki core + engine + themes → 一个小 chunk；
          // 语言 grammar（@shikijs/langs/*）由 dynamic import 自动拆分
          if ((id.includes('shiki') || id.includes('@shikijs/')) && !id.includes('@shikijs/langs'))
            return 'vendor-shiki'
          if (id.includes('streamdown') || id.includes('remend')) return 'vendor-markdown'

          if (id.includes('@tauri-apps/')) return 'vendor-tauri'
        },
      },
    },
  },

  // Tauri CLI 兼容：不清屏，让 Tauri 的日志能保留在终端
  clearScreen: false,

  server: {
    // Tauri mobile dev 需要通过网络访问 Vite dev server
    host: process.env.TAURI_DEV_HOST || false,
    // 避免端口冲突
    strictPort: true,
    // 允许所有域名
    allowedHosts: true,

    proxy: {
      // 开发环境代理 - 将 KT API/WS 转发到 `kt web --dev` 启动的后端
      '/api': {
        target: ktBackendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/ws': {
        target: ktBackendUrl,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
