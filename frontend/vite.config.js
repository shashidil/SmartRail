import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser calls /api on the same origin and Vite forwards it to the backend,
// so phones on the LAN or through a tunnel never need to reach localhost:5000 directly.
const proxy = {
  '/api': { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5000', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.app'],
    proxy,
  },
  preview: { host: true, proxy },
});
