import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev, /api goes to the deployed stack so push and the General work locally.
export default defineConfig({
  plugins: [react()],
  // the map library changes rarely: its own chunk stays cached across app deploys
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'maplibre', test: /node_modules[\\/]maplibre-gl/ }] } } } },
  // /data too, so local runs show the same live world the General and the player Lambda read
  server: { proxy: { '/api': { target: 'https://d2xs1tyhev935m.cloudfront.net', changeOrigin: true }, '/data': { target: 'https://d2xs1tyhev935m.cloudfront.net', changeOrigin: true } } },
})
