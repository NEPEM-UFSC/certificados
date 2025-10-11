import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist'
  },
  server: {
    port: 5173,
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/.netlify\/functions/, '/.netlify/functions')
      }
    }
  }
})