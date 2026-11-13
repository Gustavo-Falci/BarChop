import { laminaEm } from "./lamina";
import {
  caminhoDaNavalha,
  podeAcelerar,
  proximoTempo,
  quadroDaAbertura,
  type Medidas,
  type Quadro,
} from "./linhaDoTempo";
import { CLASSE_DA_ABERTURA, VIVA } from "./script";

// Quem toca a abertura da navalha (home nova, marco 5): mede o topo, anda
// o relógio quadro a quadro e aplica o quadro de quadroDaAbertura nas
// peças. Pular (o botão, Esc, espaço, Enter, ↓, PageDown, a roda do mouse
// ou o primeiro toque) faz o relógio andar 5× até o fim, sem corte seco.
// No fim, cada peça volta ao estilo que tinha e a classe sai do <html>:
// o que fica é o topo de sempre, e a cadeira 3D pode entrar.

type Alvo = { topo: HTMLElement; cabecalho: HTMLElement | null };

const TECLAS_DE_PULAR = new Set(["Escape", " ", "Enter", "ArrowDown", "PageDown"]);
// Um quadro perdido (aba em segundo plano) não pula a história.
const PASSO_MAXIMO = 0.1;
// O clarão do horário que a navalha acabou de acender.
const CLARAO = 0.38;
const OPACIDADE_DOS_FIOS = [0.42, 0.6, 0.82, 1, 0.82, 0.6, 0.42];
const SVG = "http://www.w3.org/2000/svg";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const n = (v: number) => String(Number(v.toFixed(3)));

export async function tocar({ topo, cabecalho }: Alvo): Promise<() => void> {
  const html = document.documentElement;
  if (!html.classList.contains(CLASSE_DA_ABERTURA)) return () => {};

  const pega = <T extends Element = HTMLElement>(seletor: string) => topo.querySelector<T>(seletor);
  const todas = <T extends Element = HTMLElement>(seletor: string) => [...topo.querySelectorAll<T>(seletor)];

  // O estilo de cada peça antes de mexer, pra devolver no fim.
  const originais = new Map<Element, string | null>();
  function estilo(el: Element | null | undefined): CSSStyleDeclaration | undefined {
    if (!el) return undefined;
    if (!originais.has(el)) originais.set(el, el.getAttribute("style"));
    return (el as HTMLElement | SVGElement).style;
  }

  let acabou = false;
  let pedido = 0;
  const ouvintes: [EventTarget, string, EventListener][] = [];

  function encerra() {
    if (acabou) return;
    acabou = true;
    if (pedido) cancelAnimationFrame(pedido);
    for (const [alvo, tipo, f] of ouvintes) alvo.removeEventListener(tipo, f);
    for (const [el, antes] of originais) {
      if (antes === null) el.removeAttribute("style");
      else el.setAttribute("style", antes);
    }
    for (const bloco of todas("[data-bloco]")) {
      delete bloco.dataset.cheio;
      delete bloco.dataset.clarao;
    }
    html.removeAttribute(VIVA);
    html.classList.remove(CLASSE_DA_ABERTURA);
  }

  // A trava do script não corta mais: daqui em diante quem encerra é a abertura.
  html.setAttribute(VIVA, "");

  // Quem pediu menos movimento depois de o script decidir, ou já desceu a
  // página antes de o código chegar, fica com o topo de sempre.
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || window.scrollY > 0) {
    encerra();
    return encerra;
  }
  estilo(document.body)!.overflow = "hidden";

  // As medidas, com as fontes carregadas (o nome muda de largura com elas).
  // Não espera mais que um instante: as fontes da home vêm pré-carregadas.
  const fontes = (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  if (fontes) await Promise.race([fontes, new Promise((r) => setTimeout(r, 600))]);
  if (acabou || !html.classList.contains(CLASSE_DA_ABERTURA)) {
    encerra();
    return encerra;
  }

  const caixaDoTopo = topo.getBoundingClientRect();
  const largura = caixaDoTopo.width || window.innerWidth;
  const altura = caixaDoTopo.height || window.innerHeight;
  const celular = largura <= 760;
  const caixa = (el: Element | null | undefined) => {
    const r = el?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0, largura: 1 };
    return {
      x: r.left - caixaDoTopo.left + r.width / 2,
      y: r.top - caixaDoTopo.top + r.height / 2,
      largura: Math.max(1, r.width),
    };
  };
  const marca = cabecalho?.querySelector("[data-marca-da-nav]");
  const medidas: Medidas = {
    largura,
    altura,
    celular,
    u: celular ? Math.min(largura / 390, altura / 844) : Math.min(largura / 1440, altura / 900),
    bar: caixa(pega('[data-metade="bar"]')),
    chop: caixa(pega('[data-metade="chop"]')),
    icone: caixa(marca?.querySelector("svg") ?? marca),
  };
  const caminho = caminhoDaNavalha(medidas);

  // As peças.
  const bar = pega('[data-metade="bar"]');
  const chop = pega('[data-metade="chop"]');
  const navalha = pega<SVGSVGElement>("[data-navalha]");
  const lamina = pega<SVGGElement>("[data-lamina]");
  const aco = pega<SVGPathElement>("[data-aco]");
  const gume = pega<SVGPathElement>("[data-gume]");
  const detalhe = pega<SVGGElement>("[data-detalhe]");
  const agenda = pega("[data-agenda]");
  const cantos = pega("[data-cantos]");
  const contador = pega("[data-contador]");
  const foco = pega("[data-foco]");
  const grade = pega("[data-sopro]");
  const cadeira = pega("picture img");
  const pecas = ["promessa", "status", "base"].map((p) => pega(`[data-peca="${p}"]`));
  const blocos = todas("[data-bloco]").map((el) => ({ el, centro: caixa(el).x, aceso: -1 }));

  // Os fios, desenhados uma vez no caminho medido.
  const svgDosFios = pega<SVGSVGElement>("[data-fios]");
  const fios: SVGPathElement[] = [];
  if (svgDosFios) {
    svgDosFios.setAttribute("viewBox", `0 0 ${n(largura)} ${n(altura)}`);
    svgDosFios.replaceChildren();
    caminho.fios.forEach((d) => {
      const fio = document.createElementNS(SVG, "path");
      fio.setAttribute("d", d);
      fio.setAttribute("pathLength", "1");
      fio.setAttribute("stroke-dasharray", "1 1");
      fio.setAttribute("stroke-width", n((celular ? 1.2 : 1.5) * medidas.u));
      svgDosFios.append(fio);
      fios.push(fio);
    });
  }

  if (navalha) {
    const lado = n(quadroDaAbertura(0, medidas, caminho).navalha.lado);
    navalha.setAttribute("width", lado);
    navalha.setAttribute("height", lado);
  }

  // Sem transição durante a abertura: quem anda é o relógio.
  for (const el of [cabecalho, ...pecas]) {
    const s = estilo(el);
    if (s) s.transition = "none";
  }

  function mostra(el: Element | null, opacidade: number, y: number) {
    const s = estilo(el);
    if (!s) return;
    s.opacity = n(opacidade);
    s.translate = `0 ${n(y)}px`;
    s.visibility = opacidade > 0 ? "visible" : "hidden";
  }

  let ultimoContador = -1;
  function aplica(q: Quadro, t: number) {
    const nv = q.navalha;
    const sn = estilo(navalha);
    if (sn) {
      sn.opacity = n(nv.opacidade);
      sn.transform = `translate(${n(nv.x)}px, ${n(nv.y)}px) rotate(${n(nv.giro)}deg) scale(${n(nv.escala)})`;
    }
    lamina?.setAttribute("transform", `rotate(${n(q.lamina.giro)} 69 52)`);
    aco?.setAttribute("d", laminaEm(q.lamina.forma));
    if (gume) estilo(gume)!.opacity = n(q.lamina.gume);
    if (detalhe) estilo(detalhe)!.opacity = n(q.lamina.detalhe);

    fios.forEach((fio, i) => {
      fio.setAttribute("stroke-dashoffset", n(1 - q.fios.progresso));
      fio.setAttribute("stroke-opacity", n(OPACIDADE_DOS_FIOS[i] * lerp(0.7, 1, q.fios.brilho)));
    });
    if (svgDosFios) estilo(svgDosFios)!.opacity = n(q.fios.opacidade);

    if (q.contador !== ultimoContador && contador) {
      ultimoContador = q.contador;
      contador.textContent = String(q.contador);
    }

    const sa = estilo(agenda);
    if (sa) {
      sa.opacity = n(q.agenda.opacidade);
      sa.transform = `scale(${n(q.agenda.escala)})`;
      sa.filter = `brightness(${n(q.agenda.brilho)})`;
    }
    for (const bloco of blocos) {
      const cheio = q.agenda.todos || bloco.centro > q.agenda.acendeAte;
      if (cheio && bloco.aceso < 0) {
        bloco.aceso = t;
        bloco.el.dataset.cheio = "";
      }
      const clarao = bloco.aceso >= 0 && t - bloco.aceso < CLARAO;
      if (clarao !== "clarao" in bloco.el.dataset) {
        if (clarao) bloco.el.dataset.clarao = "";
        else delete bloco.el.dataset.clarao;
      }
    }

    for (const [el, m] of [
      [bar, q.nome.bar],
      [chop, q.nome.chop],
    ] as const) {
      const s = estilo(el);
      if (!s) continue;
      s.opacity = n(m.opacidade);
      s.transform = `translate(${n(m.x)}px, ${n(m.y)}px) scale(${n(m.escala)})`;
      s.filter = `brightness(${n(lerp(0.5, 1, q.nome.luz))})`;
    }

    if (cantos) estilo(cantos)!.opacity = n(q.cantos);
    if (foco) estilo(foco)!.opacity = n(q.foco);
    if (grade) estilo(grade)!.opacity = n(0.14 * q.sopro);
    if (cadeira) estilo(cadeira)!.filter = `brightness(${n(q.cadeira)})`;
    mostra(cabecalho, q.cabecalho.opacidade, q.cabecalho.y);
    pecas.forEach((el, i) => mostra(el, q.interface[i].opacidade, q.interface[i].y));
    if (marca) estilo(marca)!.opacity = n(q.icone);
  }

  let t = 0;
  let antes: number | undefined;
  let acelerado = false;

  function quadro(agora: number) {
    pedido = 0;
    if (acabou) return;
    const dt = antes === undefined ? 0 : Math.min(PASSO_MAXIMO, (agora - antes) / 1000);
    antes = agora;
    t = proximoTempo(t, dt, acelerado);
    const q = quadroDaAbertura(t, medidas, caminho);
    aplica(q, t);
    if (q.fim) encerra();
    else pedido = requestAnimationFrame(quadro);
  }

  function pular() {
    if (podeAcelerar(t)) acelerado = true;
  }
  function ouvir(alvo: EventTarget, tipo: string, f: EventListener, opcoes?: AddEventListenerOptions) {
    alvo.addEventListener(tipo, f, opcoes);
    ouvintes.push([alvo, tipo, f]);
  }
  const botao = pega("[data-pular]");
  if (botao) ouvir(botao, "click", pular);
  ouvir(window, "keydown", (ev) => {
    if (!TECLAS_DE_PULAR.has((ev as KeyboardEvent).key)) return;
    // Espaço, ↓ e PageDown rolariam a página presa; Enter no botão já é o clique.
    if ((ev as KeyboardEvent).key !== "Enter") ev.preventDefault();
    pular();
  });
  ouvir(window, "wheel", pular, { passive: true });
  ouvir(window, "touchstart", pular, { passive: true });

  aplica(quadroDaAbertura(0, medidas, caminho), 0);
  pedido = requestAnimationFrame(quadro);
  return encerra;
}
