import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api goes to the deployed stack so push and the General work locally.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: 'https://d2xs1tyhev935m.cloudfront.net', changeOrigin: true } } },
})
