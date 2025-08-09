import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue()
  ],
  server: {
    allowedHosts: ['text_process.jmper.cn'],
    port: 3000
  }
}) 