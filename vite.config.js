import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { wsRelayPlugin } from './src/ws-relay-plugin.js'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), basicSsl(), wsRelayPlugin()],
  server: {
    host: true,
    port: 5174,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
})
