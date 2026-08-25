import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = process.env.OUT ?? '/tmp/claude-1000/-mnt-linux-projetos-jean-jogos-lightbot/c50ee603-5d79-45d0-ae89-36a8128a1d71/scratchpad'

const browser = await chromium.launch({
  executablePath: '/usr/sbin/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })

// Instrumenta a Web Audio API antes do jogo carregar: contar osciladores e a
// forma de provar, sem placa de som, que os efeitos estao mesmo sendo gerados.
await page.addInitScript(() => {
  window.__audio = { contexts: 0, oscillators: 0, buffers: 0 }
  const Original = window.AudioContext
  window.AudioContext = class extends Original {
    constructor(...args) {
      super(...args)
      window.__audio.contexts++
    }
    createOscillator() {
      window.__audio.oscillators++
      return super.createOscillator()
    }
    createBufferSource() {
      window.__audio.buffers++
      return super.createBufferSource()
    }
  }
})

const problems = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`)
})
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`))

/** Fases sao bloqueadas ate a anterior ser vencida, entao o teste libera
 *  tudo escrevendo direto no save antes de navegar. */
async function goLevel(n) {
  await page.evaluate((n) => {
    const raw = localStorage.getItem('lightbot.save.v1')
    const save = raw ? JSON.parse(raw) : { version: 1, completed: [], programs: {}, best: {} }
    save.completed = Array.from({ length: n - 1 }, (_, i) => i + 1)
    localStorage.setItem('lightbot.save.v1', JSON.stringify(save))
    location.hash = `#fase-${n}`
  }, n)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
}

// --- fase 1: montar a solucao clicando na paleta, como um jogador faria ---
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const levelName = await page.textContent('#level-name')
console.log('fase carregada:', levelName)

// executar sem comandos deve avisar, nao quebrar
await page.click('#btn-run')
await page.waitForSelector('#banner.error', { timeout: 5000 })
console.log('MAIN vazio ->', (await page.textContent('#banner-text')).trim())

await page.click('.palette [data-cmd="F"]')
await page.click('.palette [data-cmd="F"]')
await page.click('.palette [data-cmd="X"]')

const filled = await page.$$eval('[data-slot="main"] .slot.filled', (els) =>
  els.map((e) => e.getAttribute('data-cmd')),
)
console.log('MAIN montado:', filled.join(','))

await page.screenshot({ path: `${OUT}/01-editor.png` })

// velocidade 2x para o smoke nao demorar
await page.click('#btn-speed')
await page.click('#btn-run')
await page.waitForTimeout(600)
await page.screenshot({ path: `${OUT}/02-executando.png` })

await page.waitForSelector('#banner.win', { timeout: 15000 })
console.log('banner:', (await page.textContent('#banner-text')).trim())
await page.screenshot({ path: `${OUT}/03-vitoria.png` })

// --- audio ---
const sound = await page.evaluate(() => window.__audio)
console.log(
  `audio: ${sound.contexts} contexto(s), ${sound.oscillators} osciladores, ${sound.buffers} fontes de ruido`,
)
if (sound.contexts === 0) problems.push('[audio] AudioContext nunca foi criado')
if (sound.oscillators === 0) problems.push('[audio] nenhum oscilador foi gerado')
if (sound.buffers === 0) problems.push('[audio] nenhuma camada de ruido foi gerada')

// o botao de som cicla entre os tres modos e a escolha sobrevive ao reload
const modes = []
for (let i = 0; i < 4; i++) {
  modes.push(await page.getAttribute('#btn-audio', 'title'))
  await page.click('#btn-audio')
}
console.log('modos de audio:', modes.join(' -> '))

await page.click('#btn-audio') // deixa em um modo nao-padrao
const chosen = await page.getAttribute('#btn-audio', 'title')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const restored = await page.getAttribute('#btn-audio', 'title')
console.log(`preferencia de audio: "${chosen}" -> apos reload "${restored}"`)
if (chosen !== restored) problems.push('[audio] preferencia nao sobreviveu ao reload')

// --- fase 20: a mais complexa, via dica -> ver solucao ---
await goLevel(20)
console.log('fase 20:', await page.textContent('#level-name'))
await page.click('#btn-hint')
await page.click('.banner-actions button:has-text("Ver solucao")')
await page.waitForTimeout(300)
const blocks = await page.$$eval('.strip', (els) =>
  els.map((e) => `${e.querySelector('.strip-name').textContent}=${e.querySelector('.strip-count').textContent}`),
)
console.log('blocos preenchidos:', blocks.join(' '))
await page.screenshot({ path: `${OUT}/04-fase20.png` })

await page.click('#btn-speed') // 2x
await page.click('#btn-run')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${OUT}/05-fase20-run.png` })
await page.waitForSelector('#banner.win', { timeout: 60000 })
console.log('fase 20 concluida:', (await page.textContent('#banner-text')).trim())
await page.screenshot({ path: `${OUT}/06-fase20-vitoria.png` })

// --- enquadramento em fases de formatos bem diferentes ---
for (const n of [8, 12, 16, 19]) {
  await goLevel(n)
  await page.screenshot({ path: `${OUT}/frame-${n}.png` })
  console.log(`enquadramento fase ${n}:`, await page.textContent('#level-name'))
}

// --- mobile ---
const mobile = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })
await mobile.goto(`${BASE}/#fase-16`, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(900)
const overflowX = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
console.log('mobile rola na horizontal?', overflowX)
await mobile.screenshot({ path: `${OUT}/07-mobile.png` })

console.log('\n--- console do navegador ---')
console.log(problems.length ? problems.join('\n') : '(limpo)')

await browser.close()
