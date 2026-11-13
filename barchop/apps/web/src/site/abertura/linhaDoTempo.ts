// A linha do tempo da abertura da navalha (home nova, marco 5), como
// conta pura: do segundo t pro estado de cada peça. É o abertura.js do
// protótipo (Documents/barchop-prototipo) sem GSAP, com os mesmos tempos
// e curvas; quem desenha (tocar.ts) só aplica o quadro. O mesmo jeito do
// rolagem.ts do marco 3.
//
// A história, em ~4,3 s:
// - 0,0  a agenda do dia, vazia, no escuro; "Bar" e "Chop" no meio;
// - 0,35 a navalha aberta entra e atravessa a agenda, deixando os fios
//        dourados; os horários acendem por onde ela passa, os livres
//        descem de 8 a 0, e ela freia no meio da tela;
// - 1,3  a lâmina fecha ao lado do cabo e a navalha se endireita;
// - 1,8  a lâmina se deforma nas duas barrigas do B; a agenda enche;
// - 2,2  a lâmina abre 11°, como na marca;
// - 2,6  o B voa até o ícone do cabeçalho; a agenda apaga, a cadeira
//        aparece no escuro e o nome vai pro lugar de sempre;
// - 3,0  o canhão de luz acende; o cabeçalho e a interface entram;
// - 4,35 o ícone do cabeçalho aparece em volta do B, que some. Fim.

type Caixa = { x: number; y: number; largura: number };

/** O que a abertura mede no topo antes de começar (px, relativo ao topo). */
export type Medidas = {
  largura: number;
  altura: number;
  celular: boolean;
  /** A unidade de cena do protótipo (390×844 no celular, 1440×900 no computador). */
  u: number;
  /** O centro e a largura de "Bar" e "Chop" no lugar de sempre. */
  bar: Caixa;
  chop: Caixa;
  /** O centro e a largura do ícone da marca no cabeçalho. */
  icone: Caixa;
};

type Ponto = { x: number; y: number; ang: number };

export type Caminho = {
  /** O caminho da navalha em pontos a passos iguais. */
  pontos: Ponto[];
  /** Onde ela freia (0..1 do caminho): no meio da tela, já na reta. */
  parada: number;
  /** Os sete fios que ela deixa, lado a lado, como `d` de path. */
  fios: string[];
};

type Peca = { opacidade: number; y: number };
type Metade = { x: number; y: number; escala: number; opacidade: number };

export type Quadro = {
  /** A navalha (origem 0 0 do quadro de lado×lado): translate, giro em graus, escala. */
  navalha: { x: number; y: number; giro: number; escala: number; lado: number; opacidade: number };
  /** Giro da lâmina no pino, em graus; forma 0 = barra, 1 = B; gume e detalhes da marca. */
  lamina: { giro: number; forma: number; gume: number; detalhe: number };
  /** Os fios: o quanto do caminho já foi desenhado, o brilho (0..1) e a opacidade. */
  fios: { progresso: number; brilho: number; opacidade: number };
  /** "Livres hoje". */
  contador: number;
  /** A agenda do fundo: acende os horários com o centro à direita de `acendeAte`. */
  agenda: { acendeAte: number; todos: boolean; escala: number; apaga: number; brilho: number; opacidade: number };
  /** "Bar" e "Chop": deslocamento do lugar de sempre, escala e opacidade; luz 0..1 das duas. */
  nome: { bar: Metade; chop: Metade; luz: number };
  cantos: number;
  foco: number;
  /** O brilho da cadeira parada (filtro): pintada desde o 1º quadro, apagada. */
  cadeira: number;
  /** O sopro da grade do topo de sempre. */
  sopro: number;
  cabecalho: Peca;
  /** A promessa, o status e a base (apoio, convites e nota), nessa ordem. */
  interface: Peca[];
  /** O ícone da marca no cabeçalho. */
  icone: number;
  fim: boolean;
};

// ---------- curvas (as do protótipo; no GSAP, power1 = quadrática, power2 = cúbica, power3 = quártica) ----------

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const coord = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const meio = (lo + hi) / 2;
      if (coord(x1, x2, meio) < t) lo = meio;
      else hi = meio;
    }
    return coord(y1, y2, (lo + hi) / 2);
  };
}

type Curva = (t: number) => number;
const pfOut: Curva = cubicBezier(0.22, 1, 0.36, 1);
const pfIo: Curva = cubicBezier(0.76, 0, 0.24, 1);
const quadOut: Curva = (t) => 1 - (1 - t) ** 2;
const quadIn: Curva = (t) => t * t;
const cubicaOut: Curva = (t) => 1 - (1 - t) ** 3;
const cubicaIn: Curva = (t) => t ** 3;
const cubicaInOut: Curva = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const quarticaOut: Curva = (t) => 1 - (1 - t) ** 4;
const voltaOut: Curva = (t) => 1 + 4 * (t - 1) ** 3 + 3 * (t - 1) ** 2; // back.out(3)

const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// O progresso (0..1, já com a curva) de um trecho que começa em `inicio` e
// dura `duracao`. Rente ao fim conta como fim: (4,35 − 4,05) / 0,3 dá
// 0,999…, e o último quadro tem de ser exatamente o topo de sempre.
const trecho = (t: number, inicio: number, duracao: number, curva: Curva) => {
  const p = (t - inicio) / duracao;
  return curva(p > 1 - 1e-9 ? 1 : limitar(p));
};
// -0 vira 0 (o fim tem de ser exatamente o lugar de sempre).
const zero = (n: number) => n + 0;

// ---------- o caminho ----------

const AMOSTRAS = 160;
const DENTES = [-3, -2, -1, 0, 1, 2, 3];
// A navalha anda de pé (lâmina pra cima, cabo pra baixo), inclinada como na mão.
const INCLINA = -18;
// O resto da cena (agenda apagando, cadeira, nome indo pros cantos) espera o B se formar.
const D = 0.4;

export const DURACAO_DA_ABERTURA = 4.35;

function pontoDaCurva(p: number[], s: number) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const a = (1 - s) ** 3;
  const b = 3 * s * (1 - s) ** 2;
  const c = 3 * s * s * (1 - s);
  const d = s ** 3;
  return { x: a * x0 + b * x1 + c * x2 + d * x3, y: a * y0 + b * y1 + c * y2 + d * y3 };
}

/** O caminho da navalha (o do protótipo, um pra cada tela) em pontos a passos iguais, e os fios. */
export function caminhoDaNavalha(m: Medidas): Caminho {
  const { largura: W, altura: H, celular, u } = m;
  const meioY = H * (celular ? 0.49 : 0.505);
  // Uma curva que entra pela direita e uma reta que sai pela esquerda.
  const curva = celular
    ? [W * 1.05, H * 0.16, W * 0.86, H * 0.3, W * 0.86, meioY - 6, W * 0.55, meioY]
    : [W * 1.015, -H * 0.05, W * 0.93, H * 0.22, W * 0.875, meioY - 4, W * 0.64, meioY];
  const fimDaReta = celular ? { x: -W * 0.1, y: meioY + 8 } : { x: -W * 0.06, y: meioY + 14 * u };

  // Bem fino primeiro, depois a passos iguais de comprimento (o getPointAtLength do protótipo).
  const fino: { x: number; y: number }[] = [];
  for (let i = 0; i <= 600; i++) fino.push(pontoDaCurva(curva, i / 600));
  const inicioDaReta = fino.at(-1)!;
  for (let i = 1; i <= 200; i++) {
    fino.push({ x: lerp(inicioDaReta.x, fimDaReta.x, i / 200), y: lerp(inicioDaReta.y, fimDaReta.y, i / 200) });
  }
  const acumulado = [0];
  for (let i = 1; i < fino.length; i++) {
    acumulado.push(acumulado[i - 1] + Math.hypot(fino[i].x - fino[i - 1].x, fino[i].y - fino[i - 1].y));
  }
  const total = acumulado.at(-1)!;
  const posicoes: { x: number; y: number }[] = [];
  let j = 1;
  for (let i = 0; i <= AMOSTRAS; i++) {
    const alvo = (i / AMOSTRAS) * total;
    while (j < fino.length - 1 && acumulado[j] < alvo) j++;
    const k = limitar((alvo - acumulado[j - 1]) / (acumulado[j] - acumulado[j - 1] || 1));
    posicoes.push({ x: lerp(fino[j - 1].x, fino[j].x, k), y: lerp(fino[j - 1].y, fino[j].y, k) });
  }
  const pontos: Ponto[] = posicoes.map((p, i) => {
    const a = posicoes[Math.max(0, i - (i === AMOSTRAS ? 1 : 0))];
    const b = posicoes[Math.min(AMOSTRAS, i + (i === AMOSTRAS ? 0 : 1))];
    return { ...p, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  });

  let iParada = pontos.findIndex((p, i) => i > AMOSTRAS * 0.3 && p.x <= W / 2);
  if (iParada < 0) iParada = AMOSTRAS;

  const passo = (celular ? 9 : 12) * u;
  const fios = DENTES.map((dente) =>
    pontos
      .map((p, i) => {
        const x = p.x - Math.sin(p.ang) * dente * passo;
        const y = p.y + Math.cos(p.ang) * dente * passo;
        return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ")
  );

  return { pontos, parada: iParada / AMOSTRAS, fios };
}

// ---------- a navalha ----------

// Onde a navalha está: um ponto do desenho (`local`, no quadro de lado×lado)
// num ponto da tela, com giro e escala em volta dele. Vira o translate de
// origem 0 0 que o CSS aplica.
function pose(local: { x: number; y: number }, tela: { x: number; y: number }, giro: number, escala: number) {
  const r = (giro * Math.PI) / 180;
  return {
    x: tela.x - escala * (local.x * Math.cos(r) - local.y * Math.sin(r)),
    y: tela.y - escala * (local.x * Math.sin(r) + local.y * Math.cos(r)),
    giro,
    escala,
  };
}

const giroDoCaminho = (ang: number) => ((((ang * 180) / Math.PI - 180 + INCLINA + 540) % 360) - 180);

/** O estado de cada peça no segundo `t` da abertura. */
export function quadroDaAbertura(t: number, m: Medidas, caminho: Caminho = caminhoDaNavalha(m)): Quadro {
  const { largura: W, altura: H, celular } = m;
  const { pontos, parada } = caminho;
  const ultimo = pontos.length - 1;

  // A navalha anda até a parada, freando (0,35 → 1,3 s).
  const andou = parada * trecho(t, 0.35, 0.95, quarticaOut);
  const aqui = pontos[Math.round(andou * ultimo)];
  const naParada = pontos[Math.round(parada * ultimo)];

  // O quadro da marca: 200 unidades; o ponto que corta (o meio da lâmina
  // aberta, em 30,-1) é o que anda sobre o caminho.
  const lado = (celular ? 200 : 300) * m.u;
  const k = lado / 200;
  const corte = { x: 30 * k, y: -1 * k };
  const centro = { x: lado / 2, y: lado / 2 };

  let navalha;
  if (t < 1.3) {
    navalha = pose(corte, aqui, giroDoCaminho(aqui.ang), 0.8);
  } else if (t < 2.6) {
    // Endireita no meio da tela, do tamanho cheio (1,3 → 1,8 s).
    const s = trecho(t, 1.3, 0.5, cubicaInOut);
    const destino = { x: naParada.x - centro.x + corte.x, y: naParada.y - centro.y + corte.y };
    navalha = pose(
      corte,
      { x: lerp(naParada.x, destino.x, s), y: lerp(naParada.y, destino.y, s) },
      zero(lerp(giroDoCaminho(naParada.ang), 0, s)),
      lerp(0.8, 1, s)
    );
  } else {
    // O B voa até o ícone do cabeçalho e encolhe até o tamanho dele (2,6 → 3,55 s).
    const s = trecho(t, 2.6, 0.95, pfIo);
    navalha = pose(
      centro,
      { x: lerp(naParada.x, m.icone.x, s), y: lerp(naParada.y, m.icone.y, s) },
      0,
      lerp(1, m.icone.largura / lado, s)
    );
  }
  const opacidadeDaNavalha =
    t < 3.65 + D ? trecho(t, 0.35, 0.2, pfOut) : 1 - trecho(t, 3.65 + D, 0.3, quadIn);

  // A lâmina: fecha (180° → 0), vira o B, e abre 11° como na marca.
  const giroDaLamina = t < 2.2 ? lerp(180, 0, trecho(t, 1.3, 0.5, cubicaInOut)) : lerp(0, -11, trecho(t, 2.2, 0.35, voltaOut));

  // "Bar" e "Chop": do meio (maiores) pro lugar de sempre.
  const voltaDoNome = trecho(t, 2.0 + D, 1.15, pfIo);
  const metade = (caixa: Caixa, alturaNoMeio: number, fracao: number, entra: number): Metade => {
    const escalaNoMeio = Math.min((fracao * W) / caixa.largura, 1.4);
    const opacidade =
      t < 1.12
        ? trecho(t, entra, 0.5, pfOut)
        : t < 2.3
          ? lerp(1, 0.2, trecho(t, 1.12, 0.35, cubicaOut))
          : lerp(0.2, 1, trecho(t, 2.3, 0.6, cubicaInOut));
    return {
      x: zero((W / 2 - caixa.x) * (1 - voltaDoNome)),
      y: zero((alturaNoMeio - caixa.y) * (1 - voltaDoNome)),
      escala: lerp(escalaNoMeio, 1, voltaDoNome),
      opacidade,
    };
  };

  const peca = (inicio: number, duracao: number, deslize: number): Peca => {
    const s = trecho(t, inicio, duracao, pfOut);
    return { opacidade: s, y: zero(deslize * (1 - s)) };
  };

  const apaga = trecho(t, 1.62 + D, 0.75, pfIo);

  return {
    navalha: { ...navalha, lado, opacidade: opacidadeDaNavalha },
    lamina: {
      giro: giroDaLamina,
      forma: trecho(t, 1.8, 0.45, cubicaInOut),
      gume: 1 - trecho(t, 1.8, 0.2, pfOut),
      detalhe: trecho(t, 2.15, 0.25, pfOut),
    },
    fios: {
      progresso: andou,
      brilho: trecho(t, 1.45, 0.4, cubicaOut),
      opacidade: 1 - trecho(t, 1.9 + D, 0.5, cubicaIn),
    },
    contador: t >= 2.25 ? 0 : Math.max(0, 8 - Math.floor((andou / parada) * 9)),
    agenda: {
      acendeAte: t < 0.35 ? Number.POSITIVE_INFINITY : aqui.x,
      todos: t >= 2.25,
      escala: lerp(1.035, 1, trecho(t, 0, 1.6, pfOut)),
      apaga,
      brilho: lerp(1, 0.35, apaga),
      opacidade: apaga >= 1 ? 0 : 1,
    },
    nome: {
      bar: metade(m.bar, H * (celular ? 0.36 : 0.32), celular ? 0.84 : 0.58, 0.05),
      chop: metade(m.chop, H * (celular ? 0.62 : 0.71), celular ? 0.66 : 0.44, 0.13),
      luz: trecho(t, 2.62 + D, 1.0, cubicaInOut),
    },
    cantos: t < 1.9 + D ? trecho(t, 0.1, 0.5, pfOut) : 1 - trecho(t, 1.9 + D, 0.35, pfOut),
    foco: trecho(t, 2.6 + D, 1.0, cubicaInOut),
    cadeira:
      t < 2.6 + D
        ? lerp(0.12, 0.35, trecho(t, 1.85 + D, 0.6, cubicaOut))
        : lerp(0.35, 1, trecho(t, 2.6 + D, 1.1, cubicaInOut)),
    sopro: trecho(t, 2.7 + D, 1.0, pfOut),
    cabecalho: peca(2.95 + D, 0.9, -16),
    interface: [peca(2.95 + D, 0.8, 14), peca(3.05 + D, 0.8, 14), peca(3.14 + D, 0.8, 14)],
    icone: trecho(t, 3.55 + D, 0.35, quadOut),
    fim: t >= DURACAO_DA_ABERTURA,
  };
}

// ---------- o relógio ----------

const ACELERA = 5;

/** O próximo segundo da abertura: pular faz o relógio andar 5× até o fim, sem corte seco. */
export function proximoTempo(t: number, dt: number, acelerado: boolean): number {
  return Math.min(DURACAO_DA_ABERTURA, t + dt * (acelerado ? ACELERA : 1));
}

/** Perto do fim não vale acelerar: já está acabando. */
export function podeAcelerar(t: number): boolean {
  return t / DURACAO_DA_ABERTURA <= 0.86;
}
