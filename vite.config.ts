import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the build works on any static host (GitHub Pages, Netlify, S3).
export default defineConfig({
  plugins: [react()],
  base: './',
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
