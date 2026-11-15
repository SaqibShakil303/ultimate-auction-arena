import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const serverPort = Number(process.env.SERVER_PORT || 8787);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    host: true,
    port: Number(process.env.PORT || 5173),
    strictPort: true,
    proxy: {
      '/ws': { target: `ws://localhost:${serverPort}`, ws: true },
      '/health': { target: `http://localhost:${serverPort}` },
    },
  },
});
