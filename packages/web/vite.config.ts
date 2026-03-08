import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/nexus-ws': {
        target: 'http://localhost:7700',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:7700',
        changeOrigin: true,
      },
    },
  },
})
