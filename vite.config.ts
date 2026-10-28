import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on any static host (GitHub Pages, Netlify, S3).
export default defineConfig({
  plugins: [react()],
  base: './',
  // `npm run dev:api` serves the PHP backend; Vite forwards /api to it during development.
  server: { proxy: { '/api': 'http://127.0.0.1:8000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
});
