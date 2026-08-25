import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  test: {
    // A pasta backup guarda versoes antigas inteiras, com testes proprios.
    exclude: ['**/node_modules/**', '**/dist/**', '**/backup/**'],
  },
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
