import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind every interface, not just IPv6 loopback. Vite's default `localhost`
    // resolved to ::1 only on this machine, so http://127.0.0.1:5173 was
    // refused outright and the portal looked like it would not load. 0.0.0.0
    // covers 127.0.0.1, ::1 and the LAN address, which also lets a real device
    // open the portal while testing.
    host: '0.0.0.0',
    port: 5173,
  },
})
