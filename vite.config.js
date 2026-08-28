import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    host: true,
  open: false,
  proxy: {
      '/functions': {
        target: 'https://0ec90b57d6e95fcbda19832f.supabase.co',
        changeOrigin: true,
      },
    },
  },
});
