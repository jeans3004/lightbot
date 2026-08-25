# Robô de Luz

Jogo de puzzle de programação para navegador: você não controla o robô
diretamente — você **escreve um programa** e assiste ele rodar. O objetivo de
cada fase é acender todos os ladrilhos azuis.

Web app original em TypeScript + Three.js. Sem engine, sem assets externos,
sem back-end: o build inteiro são arquivos estáticos.

Fluxo de telas, como no jogo de referência: **splash → capítulos (carrossel
com setas) → grade de fases com cadeados e estrelas → jogo**, com tutorial em
balões de fala nas fases que introduzem um conceito novo.

## Versões

| pasta | o que é |
| --- | --- |
| raiz | versão atual: tema claro, fluxo por capítulos, layout espelhando o original |
| `backup/v1-tema-escuro/` | primeira versão, tema escuro, tela única com seletor de fases em modal |

O backup é um projeto completo e independente — `npm install && npm run dev`
dentro dele funciona.

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build    # gera dist/ — sobe em qualquer host estático
npm run preview  # serve o dist/ localmente
npm test         # 83 testes da VM e das 20 fases
node tests/smoke.mjs   # smoke test no navegador (precisa do dev server no ar)
```

O smoke test usa o Chromium do sistema; ajuste `executablePath` em
`tests/smoke.mjs` se o seu estiver em outro caminho.

## Como se joga

Comandos são colocados em blocos e executados de cima para baixo:

| Comando | O que faz |
| --- | --- |
| **Andar** | Avança uma célula, **se** o piso à frente estiver na mesma altura. |
| **Virar** ↺ ↻ | Gira 90°. Não muda de célula. |
| **Pular** | Sobe **exatamente** um degrau, ou desce qualquer altura. |
| **Acender** | Alterna a lâmpada da célula atual. Acender de novo **apaga**. |
| **P1 / P2** | Executa o bloco correspondente e volta. |

`MAIN` sempre tem espaços de menos para o caminho inteiro — é isso que força
o jogador a encontrar o padrão que se repete e guardá-lo em `P1`/`P2`.

Um procedimento pode chamar a si mesmo. Uma chamada recursiva **no fim do
bloco** substitui o quadro anterior em vez de empilhar, então o laço roda
indefinidamente; a fase termina no instante em que a última luz acende. Se a
chamada recursiva não for a última instrução, a pilha cresce e o jogo avisa.

## Som

Não há nenhum arquivo de áudio no projeto. Todo o som é **sintetizado em tempo
real** com a Web Audio API — osciladores, ruído branco filtrado e envelopes —
o que mantém o bundle do mesmo tamanho e elimina qualquer carregamento.

Sintetizar em vez de tocar samples também deixa o som responder ao jogo: o
efeito do pulo agenda a batida da aterrissagem a partir da duração real do
arco, então ela continua caindo no lugar certo em 0.5x e em 2x.

Há efeitos para passo, pulo, giro, colisão, acender/apagar, chamada de P1 e P2
(em alturas diferentes), vitória, derrota e cliques da interface. A trilha de
fundo é um pad generativo: quatro acordes em lá menor com notas esparsas de uma
escala pentatônica, agendadas com antecedência pelo relógio de áudio para não
tremerem junto com engasgos de quadro.

O botão de som cicla entre **som e música**, **só efeitos** e **mudo**, e a
escolha é salva. O `AudioContext` só é criado dentro de um gesto do usuário
(exigência dos navegadores) e nem chega a ser criado se o jogo abrir no mudo.

Rajadas de som — recursão rápida em 2x — passam por um compressor no barramento
principal, e efeitos repetidos têm intervalo mínimo para não virarem uma
massa só.

## Arquitetura

```
src/
  audio/
    audio.ts     sintese de efeitos e trilha, sem nenhum arquivo de som
  core/          logica pura, sem DOM e sem Three.js
    types.ts     comandos, direcoes, formato de fase e de programa
    vm.ts        interpretador: executa o programa e devolve o trace
    levels.ts    as 20 fases (mapas em ASCII) + solucoes de referencia
    save.ts      progresso em localStorage, com validacao do que le
    vm.test.ts   suite do interpretador e das fases
  render/        Three.js
    board.ts     colunas, ladrilhos e lampadas
    robot.ts     robo montado com primitivas
    view.ts      cena, camera ortografica isometrica, animacao dos passos
    anim.ts      motor de tweens
  ui/            DOM
    program.ts   blocos de programa e paleta
    menus.ts     splash, carrossel de capitulos, grade de fases (+ vinheta SVG)
    commands.ts  icones e textos de cada comando
  main.ts        amarra tudo
```

A decisão estrutural principal: **`core/` não conhece a tela**. `vm.run()`
executa o programa inteiro de uma vez e devolve a lista de passos; a camada
visual só reproduz essa lista. Isso deixa a regra do jogo testável sem
navegador (as 20 fases são verificadas contra suas soluções a cada `npm test`)
e torna o desfecho — inclusive laço infinito e estouro de pilha — conhecido
antes de a animação começar.

### Adicionando uma fase

Acrescente uma entrada em `LEVELS` (`src/core/levels.ts`). O mapa é texto:
`.` é buraco, `3` é piso na altura 3, `3*` é piso com lâmpada.

```ts
{
  name: 'Minha fase',
  map: `
    0 1 . .
    . 2* . .
  `,
  intro: ['Fala do robo ao abrir a fase.'],   // opcional: baloes de tutorial
  start: [0, 0, 0],          // x, z, direcao (0 leste, 1 sul, 2 oeste, 3 norte)
  slots: { main: 8, p1: 4 },
  allowed: ['F', 'J', 'X', 'P1'],
  hint: 'Texto do botao Dica.',
  solution: { main: ['J', 'R', 'J', 'X'] },
}
```

O campo `solution` não é decorativo: os testes rodam cada solução na VM e
falham se a fase for insolúvel, se a solução estourar os espaços disponíveis,
se usar um comando fora da paleta da fase ou se o robô bater em algo pelo
caminho. Uma fase quebrada não passa no `npm test`.

## Tamanho do bundle

| | gzip |
| --- | --- |
| jogo (lógica + UI + CSS + áudio) | ~22 KB |
| Three.js | ~131 KB |

Áudio: 0 KB de assets.

## Sobre o Lightbot

Este projeto é uma implementação original, escrita do zero. A mecânica de
puzzle de programação é uma ideia de jogo, não é protegida por copyright —
mas o código e a arte do Lightbot são da SpriteBox LLC. Nada aqui foi extraído,
descompilado ou copiado de nenhum pacote deles; o código, os mapas e os
gráficos são próprios.
