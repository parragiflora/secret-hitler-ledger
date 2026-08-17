import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on 0.0.0.0, not just localhost, so devices on the same WiFi (or
    // a tunnel like ngrok pointed at this port) can actually reach it.
    host: true,
    // Vite validates the incoming Host header by default (DNS-rebinding
    // protection) and rejects anything it doesn't recognize -- which is
    // exactly what a tunnel's generated hostname looks like. This is a local
    // party-game dev server, not a public deployment, so it's fine to trust
    // any host here.
    allowedHosts: true,
    proxy: {
      // The client only ever talks to itself in dev -- both REST and the
      // WebSocket connection get proxied straight through to the game
      // server. This means only ONE port (this one) needs to be exposed to
      // other players, whether that's this machine's LAN IP or a tunnel.
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
})
