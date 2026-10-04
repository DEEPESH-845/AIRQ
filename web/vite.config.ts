import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api goes to the deployed stack so push and the General work locally.
export default defineConfig({
  plugins: [react()],
  // /data too, so local runs show the same live world the General and the player Lambda read
  server: { proxy: { '/api': { target: 'https://d2xs1tyhev935m.cloudfront.net', changeOrigin: true }, '/data': { target: 'https://d2xs1tyhev935m.cloudfront.net', changeOrigin: true } } },
})
