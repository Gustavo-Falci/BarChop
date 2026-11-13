import { describe, expect, it } from "vitest";
import {
  DURACAO_DA_ABERTURA,
  caminhoDaNavalha,
  podeAcelerar,
  proximoTempo,
  quadroDaAbertura,
  type Medidas,
} from "../../src/site/abertura/linhaDoTempo";

// Home nova, marco 5: a linha do tempo da abertura como conta pura (o
// abertura.js do protótipo, sem GSAP). Do segundo t pro estado de cada
// peça; quem desenha só aplica. Os testes conferem os momentos que a
// pessoa vê: a navalha entra e freia no meio, vira o B, a agenda enche,
// o B pousa no ícone do cabeçalho e o topo de sempre acende.

const COMPUTADOR: Medidas = {
  largura: 1440,
  altura: 900,
  celular: false,
  u: 1,
  bar: { x: 400, y: 430, largura: 640 },
  chop: { x: 1180, y: 960, largura: 820 },
  icone: { x: 87, y: 44, largura: 30 },
};

const CELULAR: Medidas = {
  largura: 375,
  altura: 812,
  celular: true,
  u: 375 / 390,
  bar: { x: 150, y: 220, largura: 260 },
  chop: { x: 230, y: 470, largura: 300 },
  icone: { x: 40, y: 34, largura: 28 },
};

// O centro da navalha na tela, a partir da posição (origem 0 0), do giro
// e da escala que o quadro manda aplicar.
function centroDaNavalha(m: Medidas, t: number) {
  const { navalha } = quadroDaAbertura(t, m);
  const meio = navalha.lado / 2;
  const r = (navalha.giro * Math.PI) / 180;
  const s = navalha.escala;
  return {
    x: navalha.x + s * (meio * Math.cos(r) - meio * Math.sin(r)),
    y: navalha.y + s * (meio * Math.sin(r) + meio * Math.cos(r)),
  };
}

describe("caminho da navalha", () => {
  it("entra pela direita, acima, e sai pela esquerda, na altura do meio", () => {
    const { pontos } = caminhoDaNavalha(COMPUTADOR);
    expect(pontos[0].x).toBeGreaterThan(COMPUTADOR.largura);
    expect(pontos[0].y).toBeLessThan(0);
    expect(pontos.at(-1)!.x).toBeLessThan(0);
    expect(pontos.at(-1)!.y).toBeCloseTo(900 * 0.505 + 14, 0);
  });

  it("os pontos ficam a passos iguais ao longo do caminho", () => {
    const { pontos } = caminhoDaNavalha(COMPUTADOR);
    const passos = pontos.slice(1).map((p, i) => Math.hypot(p.x - pontos[i].x, p.y - pontos[i].y));
    const media = passos.reduce((a, b) => a + b, 0) / passos.length;
    for (const passo of passos) expect(Math.abs(passo - media)).toBeLessThan(media * 0.05);
  });

  it("freia no meio da tela, já na reta", () => {
    const { pontos, parada } = caminhoDaNavalha(COMPUTADOR);
    const ponto = pontos[Math.round(parada * (pontos.length - 1))];
    expect(ponto.x).toBeLessThanOrEqual(COMPUTADOR.largura / 2);
    expect(ponto.x).toBeGreaterThan(COMPUTADOR.largura / 2 - 20);
  });

  it("no celular, o caminho do celular: entra mais baixo, pela direita", () => {
    const { pontos } = caminhoDaNavalha(CELULAR);
    expect(pontos[0].x).toBeCloseTo(375 * 1.05, 0);
    expect(pontos[0].y).toBeCloseTo(812 * 0.16, 0);
  });

  it("os sete fios seguem o caminho, lado a lado", () => {
    const { fios } = caminhoDaNavalha(COMPUTADOR);
    expect(fios).toHaveLength(7);
    for (const fio of fios) expect(fio).toMatch(/^M[-\d.]+ [-\d.]+( L[-\d.]+ [-\d.]+)+$/);
  });
});

describe("quadroDaAbertura", () => {
  it("dura uns 4,3 s", () => {
    expect(DURACAO_DA_ABERTURA).toBeGreaterThan(4.2);
    expect(DURACAO_DA_ABERTURA).toBeLessThan(4.5);
  });

  it("no começo, tudo apagado: a agenda vazia, 8 livres, sem navalha nem cabeçalho", () => {
    const q = quadroDaAbertura(0, COMPUTADOR);
    expect(q.navalha.opacidade).toBe(0);
    expect(q.contador).toBe(8);
    expect(q.agenda.todos).toBe(false);
    expect(q.cabecalho.opacidade).toBe(0);
    expect(q.foco).toBe(0);
    expect(q.cadeira).toBeLessThan(0.3);
    expect(q.fim).toBe(false);
  });

  it("a navalha atravessa a agenda: os livres descem e só acendem os horários que ela já passou", () => {
    const antes = quadroDaAbertura(0.6, COMPUTADOR);
    const depois = quadroDaAbertura(1.0, COMPUTADOR);
    expect(antes.navalha.opacidade).toBe(1);
    expect(depois.contador).toBeLessThanOrEqual(antes.contador);
    expect(depois.agenda.acendeAte).toBeLessThan(antes.agenda.acendeAte);
    expect(depois.fios.progresso).toBeGreaterThan(antes.fios.progresso);
  });

  it("os livres nunca sobem", () => {
    let anterior = 8;
    for (let t = 0; t <= DURACAO_DA_ABERTURA; t += 0.05) {
      const { contador } = quadroDaAbertura(t, COMPUTADOR);
      expect(contador).toBeLessThanOrEqual(anterior);
      anterior = contador;
    }
  });

  it("no meio, a lâmina fecha e vira o B; depois abre 11° como na marca e a agenda enche", () => {
    expect(quadroDaAbertura(1.8, COMPUTADOR).lamina.giro).toBeCloseTo(0, 5);
    const b = quadroDaAbertura(2.6, COMPUTADOR);
    expect(b.lamina.forma).toBe(1);
    expect(b.lamina.giro).toBeCloseTo(-11, 1);
    expect(b.lamina.gume).toBe(0);
    expect(b.lamina.detalhe).toBe(1);
    expect(b.agenda.todos).toBe(true);
    expect(b.contador).toBe(0);
    expect(b.navalha.escala).toBe(1);
    expect(b.navalha.giro).toBe(0);
  });

  it("o B voa e pousa no ícone do cabeçalho, do tamanho dele", () => {
    const pouso = centroDaNavalha(COMPUTADOR, 3.6);
    expect(pouso.x).toBeCloseTo(COMPUTADOR.icone.x, 0);
    expect(pouso.y).toBeCloseTo(COMPUTADOR.icone.y, 0);
    const { navalha } = quadroDaAbertura(3.6, COMPUTADOR);
    expect(navalha.lado * navalha.escala).toBeCloseTo(COMPUTADOR.icone.largura, 1);
  });

  it("\"Bar\" e \"Chop\" começam no meio, maiores, e terminam no lugar de sempre", () => {
    const inicio = quadroDaAbertura(0.6, COMPUTADOR);
    expect(COMPUTADOR.bar.x + inicio.nome.bar.x).toBeCloseTo(720, 0);
    expect(inicio.nome.bar.escala).toBeGreaterThan(1);
    const fim = quadroDaAbertura(DURACAO_DA_ABERTURA, COMPUTADOR);
    expect(fim.nome.bar).toEqual({ x: 0, y: 0, escala: 1, opacidade: 1 });
    expect(fim.nome.chop).toEqual({ x: 0, y: 0, escala: 1, opacidade: 1 });
  });

  it("no fim, o topo de sempre: luz acesa, cabeçalho e interface no lugar, ícone no cabeçalho, navalha fora", () => {
    const q = quadroDaAbertura(DURACAO_DA_ABERTURA, COMPUTADOR);
    expect(q.navalha.opacidade).toBe(0);
    expect(q.icone).toBe(1);
    expect(q.cabecalho).toEqual({ opacidade: 1, y: 0 });
    for (const peca of q.interface) expect(peca).toEqual({ opacidade: 1, y: 0 });
    expect(q.foco).toBe(1);
    expect(q.cadeira).toBe(1);
    expect(q.sopro).toBe(1);
    expect(q.cantos).toBe(0);
    expect(q.fios.opacidade).toBe(0);
    expect(q.agenda.opacidade).toBe(0);
    expect(q.fim).toBe(true);
  });

  it("no celular, o B também pousa no ícone", () => {
    const pouso = centroDaNavalha(CELULAR, 3.6);
    expect(pouso.x).toBeCloseTo(CELULAR.icone.x, 0);
    expect(pouso.y).toBeCloseTo(CELULAR.icone.y, 0);
  });
});

describe("pular", () => {
  it("acelerar faz o relógio andar 5 vezes mais rápido, sem corte seco", () => {
    expect(proximoTempo(1, 0.1, false)).toBeCloseTo(1.1);
    expect(proximoTempo(1, 0.1, true)).toBeCloseTo(1.5);
    expect(proximoTempo(4.3, 1, true)).toBe(DURACAO_DA_ABERTURA);
  });

  it("perto do fim, não acelera mais", () => {
    expect(podeAcelerar(1)).toBe(true);
    expect(podeAcelerar(DURACAO_DA_ABERTURA * 0.9)).toBe(false);
  });
});
