import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // three e o codigo do jogo em chunks separados: o motor grafico
    // e cacheavel entre deploys, a logica muda com frequencia.
    rollupOptions: {
      output: {
        manualChunks: (id: string) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
})
