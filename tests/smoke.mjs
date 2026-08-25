import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:5173'
const OUT = process.env.OUT ?? '/tmp/claude-1000/-mnt-linux-projetos-jean-jogos-lightbot/c50ee603-5d79-45d0-ae89-36a8128a1d71/scratchpad'

const browser = await chromium.launch({
  executablePath: '/usr/sbin/chromium',
  args: ['--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } })

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

const visible = (sel) => page.isVisible(sel)
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

/** Fases sao bloqueadas ate a anterior ser vencida, entao o teste libera
 *  tudo escrevendo direto no save antes de navegar. */
async function unlockUpTo(n) {
  await page.evaluate((n) => {
    const raw = localStorage.getItem('lightbot.save.v1')
    const save = raw ? JSON.parse(raw) : { version: 1, completed: [], programs: {}, best: {}, intros: [] }
    save.completed = Array.from({ length: n - 1 }, (_, i) => i + 1)
    localStorage.setItem('lightbot.save.v1', JSON.stringify(save))
  }, n)
}

// ---------------------------------------------------------- fluxo de telas
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(500)

console.log('splash visivel?', await visible('#screen-splash'))
await shot('r1-splash')

await page.click('#screen-splash')
await page.waitForTimeout(300)
console.log('capitulos visivel?', await visible('#screen-chapters'), '| capitulo:', await page.textContent('#chapter-name'))
await shot('r2-capitulos')

// setas do carrossel
await page.click('#chapter-next')
console.log('apos seta ->', await page.textContent('#chapter-name'))
await page.click('#chapter-prev')

await page.click('#chapter-card')
await page.waitForTimeout(300)
const tiles = await page.$$eval('.level-tile', (els) => els.map((e) => (e.disabled ? 'lock' : 'open')))
console.log('fases visivel?', await visible('#screen-levels'), '| tiles:', tiles.join(','))
await shot('r3-fases')

await page.click('.level-tile.open')
await page.waitForTimeout(600)
console.log('jogo visivel?', await visible('#screen-game'), '| rotulo:', await page.textContent('#level-label'))

// tutorial: tres baloes, avancam com toque
const lines = []
for (let i = 0; i < 4; i++) {
  if (!(await visible('#dialogue'))) break
  lines.push((await page.textContent('#speech-text')).trim().slice(0, 30))
  if (i === 0) await shot('r4-tutorial')
  await page.click('#dialogue')
  await page.waitForTimeout(150)
}
console.log(`tutorial: ${lines.length} baloes ->`, lines.join(' | '))
console.log('dialogo fechou?', !(await visible('#dialogue')))

// ---------------------------------------------------------- jogar fase 1
await page.click('#palette [data-cmd="F"]')
await page.click('#palette [data-cmd="F"]')
await page.click('#palette [data-cmd="X"]')
const filled = await page.$$eval('[data-slot="main"] .slot.filled', (els) => els.map((e) => e.getAttribute('data-cmd')))
console.log('MAIN montado:', filled.join(','))
await shot('r5-jogo')

await page.click('#game-speed') // 2x
await page.click('#game-run')
await page.waitForTimeout(500)
await shot('r6-executando')
await page.waitForSelector('.overlay-card.win', { timeout: 15000 })
console.log('vitoria:', (await page.textContent('#overlay-text')).trim())
console.log('estrelas no overlay:', await page.$$eval('.overlay-stars svg', (e) => e.length))
await shot('r7-vitoria')

// --- audio ---
const sound = await page.evaluate(() => window.__audio)
console.log(`audio: ${sound.contexts} contexto(s), ${sound.oscillators} osciladores, ${sound.buffers} fontes de ruido`)
if (sound.contexts === 0) problems.push('[audio] AudioContext nunca foi criado')
if (sound.oscillators === 0) problems.push('[audio] nenhum oscilador foi gerado')

// proxima fase pelo overlay
await page.click('.overlay-actions .pill-btn.primary')
await page.waitForTimeout(400)
console.log('proxima fase:', await page.textContent('#level-label'))

// voltar ao menu: a fase 1 deve ter estrela e a 2 estar aberta
await page.click('#game-back')
await page.waitForTimeout(300)
const tiles2 = await page.$$eval('.level-tile', (els) => els.map((e) => (e.disabled ? 'lock' : 'open')))
console.log('fases apos vitoria:', tiles2.join(','), '| estrelas:', await page.textContent('#levels-stars'))
await shot('r8-fases-progresso')

// ---------------------------------------------------------- fase 20 completa
await unlockUpTo(20)
await page.goto(`${BASE}/#fase-20`, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
console.log('deep link fase 20:', await page.textContent('#level-label'), '| jogo visivel?', await visible('#screen-game'))
await page.click('#game-hint')
await page.click('.overlay-actions button:has-text("Ver solucao")')
await page.waitForTimeout(300)
await shot('r9-fase20')
await page.click('#game-speed')
await page.click('#game-run')
await page.waitForSelector('.overlay-card.win', { timeout: 60000 })
console.log('fase 20:', (await page.textContent('#overlay-text')).trim())

// ---------------------------------------------------------- mobile
const mobile = await browser.newPage({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true })
await mobile.goto(`${BASE}/#fase-3`, { waitUntil: 'networkidle' })
await mobile.evaluate(() => {
  const save = { version: 1, completed: [1, 2], programs: {}, best: {}, intros: [1, 2, 3] }
  localStorage.setItem('lightbot.save.v1', JSON.stringify(save))
})
await mobile.reload({ waitUntil: 'networkidle' })
await mobile.waitForTimeout(700)
const overflowX = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
console.log('mobile rola na horizontal?', overflowX, '| jogo visivel?', await mobile.isVisible('#screen-game'))
await mobile.screenshot({ path: `${OUT}/r10-mobile.png` })

console.log('\n--- console do navegador ---')
console.log(problems.length ? problems.join('\n') : '(limpo)')

await browser.close()
