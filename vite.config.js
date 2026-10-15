import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Laqta AI Studio — build config
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    cors: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
})
