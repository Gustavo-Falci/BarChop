// A abertura é o próprio hero no primeiro estado (adaptada do Pente Fino para o BarChop): a agenda do dia vazia no
// fundo, "Bar" e "Chop" no meio e a navalha passando; cada fio dourado que ela deixa é um horário, e os agendamentos
// acendem por onde ela passou ("Livres hoje" desce de 8 a 0). A navalha é a própria marca, aberta: freia no meio da
// tela, a lâmina fecha ao lado do cabo e a barra reta se deforma nas duas barrigas do B; a lâmina abre no pino e o
// resto da agenda enche de uma vez. Os fios brilham, a agenda apaga de baixo para cima, a cadeira vazia aparece no
// escuro, o B voa até o ícone da navegação, as duas metades do nome vão para os cantos e o canhão de luz acende tudo.
// ~4,3 s; rolar, teclar ou "Pular" acelera.
import gsap from 'gsap';
import { REDUZIDO, CELULAR, unidade } from './ease.js';

const NS = 'http://www.w3.org/2000/svg';
const DENTES = [-3, -2, -1, 0, 1, 2, 3];
const SOPRO = 0.14; // a opacidade da agenda no fundo depois da abertura
// a navalha aberta anda de pé (lâmina para cima, cabo para baixo), com o gume na frente; este é o quanto ela inclina,
// como na mão
const INCLINA = -18;
// a lâmina: fechada é uma barra reta ao lado do cabo; no B são as duas barrigas (o mesmo traço de scripts/marca.mjs:
// reta, meia-volta de raio 24/33, reta). As duas formas são escritas com as mesmas 8 curvas, 4 por barriga, e a barra
// é dividida na proporção do comprimento de cada trecho do B: deformar é só andar cada número de uma para a outra
const reta = (x0, y0, x1, y1) => [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1];
const BARRA = [
  [92, 52, ...reta(92, 52, 92, 62.7), ...reta(92, 62.7, 92, 76), ...reta(92, 76, 92, 89.3), ...reta(92, 89.3, 92, 100)],
  [92, 100, ...reta(92, 100, 92, 113.5), ...reta(92, 113.5, 92, 133), ...reta(92, 133, 92, 152.5), ...reta(92, 152.5, 92, 166)],
];
const BARRIGAS = [
  [80, 52, ...reta(80, 52, 110, 52), 123.25, 52, 134, 62.75, 134, 76, 134, 89.25, 123.25, 100, 110, 100, ...reta(110, 100, 80, 100)],
  [80, 100, ...reta(80, 100, 116, 100), 134.23, 100, 149, 114.77, 149, 133, 149, 151.23, 134.23, 166, 116, 166, ...reta(116, 166, 80, 166)],
];
const laminaEm = (t) => BARRA.map((sub, s) => {
  const v = sub.map((n, i) => (n + (BARRIGAS[s][i] - n) * t).toFixed(2));
  return `M${v[0]} ${v[1]}` + [0, 1, 2, 3].map((c) => ` C${v.slice(2 + c * 6, 8 + c * 6).join(' ')}`).join('');
}).join('');
const ABERTA = 180, FECHADA = 0, NO_B = -11; // giro da lâmina no pino
// o resto da cena (agenda apagando, cadeira, nome indo para os cantos) espera o B se formar
const D = 0.4;

export function abertura({ lenis, cena, grade, aoTerminar }) {
  const html = document.documentElement;
  const fixo = document.querySelector('.hero__fixo');
  const cabelo = fixo.querySelector('.hero__grade');
  const focoCss = fixo.querySelector('.hero__foco');
  const trilha = fixo.querySelector('.hero__trilha');
  const p1 = fixo.querySelector('.hero__p--1');
  const p2 = fixo.querySelector('.hero__p--2');
  const ui = [...document.querySelectorAll('[data-ui]')];
  const nav = document.querySelector('.nav');
  const contador = fixo.querySelector('[data-contador]');
  const pular = fixo.querySelector('.abertura__pular');
  const cantos = fixo.querySelector('.abertura__ui');
  const frase = fixo.querySelector('.hero__frase');
  const gl = fixo.querySelector('.hero__gl');
  const marca = fixo.querySelector('.hero__marca');
  const marcaLamina = marca.querySelector('.hero__marca-lamina');
  const marcaAco = marca.querySelector('.hero__marca-aco');
  const marcaGume = marca.querySelector('.hero__marca-gume');
  const marcaDetalhe = marca.querySelector('.hero__marca-detalhe');
  const navIcone = document.querySelector('.nav__icone');

  // a frase do canto entra digitada: cada letra num span
  const letras = [];
  for (const parte of frase.children) {
    const txt = parte.textContent;
    parte.textContent = '';
    parte.setAttribute('aria-label', txt);
    for (const ch of txt) {
      const s = document.createElement('span');
      s.className = 'letra';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = ch;
      parte.append(s);
      letras.push(s);
    }
  }

  function estadoFinal() {
    html.classList.remove('abertura-on');
    html.classList.add('abertura-fim');
    gsap.set([p1, p2], { clearProps: 'transform,opacity' });
    gsap.set([p1, p2], { '--luz': 1 });
    gsap.set(ui, { opacity: 1, y: 0 });
    gsap.set(letras, { opacity: 1 });
    gsap.set(nav, { opacity: 1, y: 0 });
    gsap.set(focoCss, { opacity: 1 });
    cabelo.classList.add('is-sopro');
    gsap.set(cabelo, { opacity: SOPRO, clearProps: 'webkitMaskImage,maskImage,filter' });
    grade?.acendeTodos();
    trilha.innerHTML = '';
    gsap.set(marca, { opacity: 0 });
    gsap.set(navIcone, { opacity: 1 });
    Object.assign(cena.e, { luz: 1, contorno: 1, chao: 1, poeira: 1 });
    lenis?.start();
    aoTerminar?.();
  }

  if (REDUZIDO || !html.classList.contains('abertura-on')) { estadoFinal(); return; }
  window.__aberturaViva = true;
  lenis?.stop();
  scrollTo(0, 0);

  // ---- espera o que a abertura mostra: os dois pesos do nome (a navalha é SVG, já está na página) ----
  const fontes = Promise.all([
    document.fonts.load('200 100px "Clash Grotesk"'),
    document.fonts.load('700 100px "Clash Grotesk"'),
    document.fonts.load('600 12px "Inter"'),
  ]).catch(() => {});
  const tempo = (ms) => new Promise((ok) => setTimeout(ok, ms));
  Promise.race([fontes, tempo(2500)]).then(comecar);

  function comecar() {
    const W = fixo.clientWidth, H = fixo.clientHeight, u = unidade(W, H);
    const cel = CELULAR();
    grade?.mede();

    // ---- as metades do nome saem do centro (abertura) para os cantos (hero): FLIP ----
    const caixa = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; };
    const a = caixa(p1), b = caixa(p2);
    const s1 = Math.min((cel ? 0.84 : 0.58) * W / a.w, 1.4);
    const s2 = Math.min((cel ? 0.66 : 0.44) * W / b.w, 1.4);
    const y1 = H * (cel ? 0.36 : 0.32), y2 = H * (cel ? 0.62 : 0.71);
    gsap.set(p1, { x: W / 2 - a.x, y: y1 - a.y, scale: s1, opacity: 1, '--luz': 0 });
    gsap.set(p2, { x: W / 2 - b.x, y: y2 - b.y, scale: s2, opacity: 1, '--luz': 0 });

    // ---- o caminho do pente e os fios dos dentes ----
    trilha.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const meioY = H * (cel ? 0.49 : 0.505);
    const d = cel
      ? `M ${W * 1.05} ${H * 0.16} C ${W * 0.86} ${H * 0.3}, ${W * 0.86} ${meioY - 6}, ${W * 0.55} ${meioY} L ${-W * 0.1} ${meioY + 8}`
      : `M ${W * 1.015} ${-H * 0.05} C ${W * 0.93} ${H * 0.22}, ${W * 0.875} ${meioY - 4}, ${W * 0.64} ${meioY} L ${-W * 0.06} ${meioY + 14 * u}`;
    const guia = document.createElementNS(NS, 'path');
    guia.setAttribute('d', d);
    const L = guia.getTotalLength();
    const AMOSTRAS = 160, passo = (cel ? 9 : 12) * u;
    const pts = [];
    for (let i = 0; i <= AMOSTRAS; i++) {
      const q = guia.getPointAtLength((i / AMOSTRAS) * L), q2 = guia.getPointAtLength(Math.min(L, (i / AMOSTRAS) * L + 1));
      const ang = Math.atan2(q2.y - q.y, q2.x - q.x) || (pts.at(-1)?.ang ?? 0);
      pts.push({ x: q.x, y: q.y, ang });
    }
    const fios = DENTES.map((k) => {
      const p = document.createElementNS(NS, 'path');
      const dd = pts.map((q, i) => `${i ? 'L' : 'M'}${(q.x - Math.sin(q.ang) * k * passo).toFixed(1)} ${(q.y + Math.cos(q.ang) * k * passo).toFixed(1)}`).join(' ');
      p.setAttribute('d', dd);
      p.setAttribute('pathLength', '1');
      p.style.strokeDasharray = '1 1';
      p.style.strokeDashoffset = '1';
      p.style.strokeWidth = `${(k === 0 ? 1.7 : Math.abs(k) === 1 ? 1.35 : 1.05) * u}px`;
      p.style.opacity = [0.42, 0.6, 0.82, 1, 0.82, 0.6, 0.42][k + 3];
      trilha.append(p);
      return p;
    });

    // a navalha atravessa o caminho com o fio da lâmina na frente; os agendamentos acendem por onde ela passou.
    // Ela para no meio da tela (já na reta do caminho), onde vira o B
    let iPara = pts.findIndex((q, i) => i > AMOSTRAS * 0.3 && q.x <= W / 2);
    if (iPara < 0) iPara = AMOSTRAS;
    const pPara = iPara / AMOSTRAS, qPara = pts[iPara];

    // a marca num quadro de 200 (k px por unidade). Aberta, a lâmina fica acima do pino; o ponto que corta (o meio
    // dela, em 30,-1 do quadro) é o que anda sobre o caminho, e é em volta dele que a navalha gira
    const lado = (cel ? 200 : 300) * u, k = lado / 200;
    const OX = 30 * k, OY = -1 * k;
    const ESCALA_ANDANDO = 0.8;
    const sombra = `drop-shadow(0 ${18 * u}px ${24 * u}px rgba(0,0,0,.65))`;
    const brilho = (r, a) => `drop-shadow(0 0 ${r}px rgba(232,197,71,${a}))`;
    const giroDe = (ang) => (((ang * 180) / Math.PI - 180 + INCLINA + 540) % 360) - 180;
    const anda = { p: 0 };
    function poePente() {
      const i = Math.min(AMOSTRAS, Math.round(anda.p * AMOSTRAS));
      const q = pts[i];
      gsap.set(marca, { x: q.x - OX, y: q.y - OY, rotation: giroDe(q.ang) });
      for (const f of fios) f.style.strokeDashoffset = String(1 - anda.p);
      contador.textContent = String(Math.max(0, 8 - Math.floor((anda.p / pPara) * 9)));
      grade?.acende(q.x);
    }
    gsap.set(marca, { width: lado, height: lado, transformOrigin: `${OX}px ${OY}px`, scale: ESCALA_ANDANDO, opacity: 0, filter: sombra });
    const giro = { a: ABERTA };
    const poeGiro = () => marcaLamina.setAttribute('transform', `rotate(${giro.a} 69 52)`);
    poeGiro();
    const forma = { t: 0 };
    const poeForma = () => marcaAco.setAttribute('d', laminaEm(forma.t));
    poeForma();

    // depois de formado, o B voa até o ícone da navegação. O ícone é medido agora, antes de a linha do tempo pôr a
    // navegação 16px acima; o B é um quadro de 200 com o desenho no mesmo lugar do ícone, então basta encolher um
    // sobre o outro (a escala, aí, é a partir do centro)
    const caixaFixo = fixo.getBoundingClientRect();
    const alvo = navIcone.getBoundingClientRect();
    const sAlvo = alvo.width / lado;
    const folga = (lado * (1 - sAlvo)) / 2;
    gsap.set(navIcone, { opacity: 0 });

    const tl = gsap.timeline({ defaults: { ease: 'pf-out' }, onComplete: () => { lenis?.start(); } });
    tl.addLabel('inicio')
      .fromTo(cabelo, { scale: 1.035 }, { scale: 1, duration: 1.6, ease: 'pf-out' }, 0)
      .fromTo([p1, p2], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.5, stagger: 0.08 }, 0.05)
      .fromTo(cantos, { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.1)
      // a navalha aberta entra e atravessa a agenda, freando no meio da tela
      .fromTo(marca, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.35)
      .to(anda, { p: pPara, duration: 0.95, ease: 'power3.out', onUpdate: poePente, onStart: poePente }, 0.35)
      // o nome recua enquanto a navalha vira o B
      .to([p1, p2], { opacity: 0.2, duration: 0.35, ease: 'power2.out' }, 1.12)
      // fecha: a lâmina gira no pino e deita ao lado do cabo, enquanto a navalha se endireita no centro
      .to(giro, { a: FECHADA, duration: 0.5, ease: 'power2.inOut', onUpdate: poeGiro }, 1.3)
      .to(marca, { x: qPara.x - lado / 2, y: qPara.y - lado / 2, rotation: 0, scale: 1, duration: 0.5, ease: 'power2.inOut' }, 1.3)
      .fromTo(marca, { filter: sombra }, { filter: brilho(16 * u, 0.55), duration: 0.5, ease: 'power2.inOut', immediateRender: false }, 1.3)
      // a lâmina fechada se deforma nas duas barrigas do B; os detalhes da marca acendem
      .to(forma, { t: 1, duration: 0.45, ease: 'power2.inOut', onUpdate: poeForma }, 1.8)
      .to(marcaGume, { opacity: 0, duration: 0.2 }, 1.8)
      .to(marcaDetalhe, { opacity: 1, duration: 0.25 }, 2.15)
      // a lâmina abre no pino e a agenda enche
      .to(giro, { a: NO_B, duration: 0.35, ease: 'back.out(3)', onUpdate: poeGiro }, 2.2)
      .call(() => { grade?.acendeTodos(); contador.textContent = '0'; }, null, 2.25)
      .to([p1, p2], { opacity: 1, duration: 0.6, ease: 'power2.inOut' }, 2.3)
      // o B voa até o ícone da navegação (sem giro nem escala agora, trocar a origem não mexe nele)
      .set(marca, { transformOrigin: '50% 50%' }, 2.55)
      .to(marca, { x: alvo.left - caixaFixo.left - folga, y: alvo.top - caixaFixo.top - folga, scale: sAlvo, duration: 0.95, ease: 'pf-io' }, 2.6)
      .to(marca, { filter: brilho(0, 0), duration: 0.5 }, 2.6)
      // os fios brilham
      .to(fios, { strokeWidth: (i) => `${(i === 3 ? 3.4 : 2.4) * u}px`, duration: 0.4, ease: 'power2.out' }, 1.45)
      .fromTo(trilha, { filter: 'drop-shadow(0 0 0px #e8c547)' }, { filter: `drop-shadow(0 0 ${10 * u}px rgba(232,197,71,.9))`, duration: 0.4 }, 1.45)
      // o cabelo apaga de baixo para cima
      .fromTo(cabelo, { '--apaga': '-20%' }, { '--apaga': '120%', duration: 0.75, ease: 'pf-io' }, 1.62 + D)
      .to(cabelo, { filter: 'contrast(1.25) brightness(0.35)', duration: 0.75, ease: 'pf-io' }, 1.62 + D)
      .to(trilha, { opacity: 0, duration: 0.5, ease: 'power2.in' }, 1.9 + D)
      .to(cena.e, { contorno: 1, chao: 0.6, duration: 0.7, ease: 'power2.out' }, 1.85 + D)
      .fromTo(gl, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, 1.85 + D)
      .to(cantos, { opacity: 0, duration: 0.35 }, 1.9 + D)
      // as metades vão para os cantos
      .to([p1, p2], { x: 0, y: 0, scale: 1, duration: 1.15, ease: 'pf-io' }, 2.0 + D)
      // acende
      .to(focoCss, { opacity: 1, duration: 1.0, ease: 'power2.inOut' }, 2.6 + D)
      .to(cena.e, { luz: 1, chao: 1, poeira: 1, duration: 1.1, ease: 'power2.inOut' }, 2.6 + D)
      .to([p1, p2], { '--luz': 1, duration: 1.0, ease: 'power2.inOut' }, 2.62 + D)
      .call(() => { cabelo.classList.add('is-sopro'); gsap.set(cabelo, { clearProps: 'webkitMaskImage,maskImage' }); }, null, 2.7 + D)
      .fromTo(cabelo, { opacity: 0 }, { opacity: SOPRO, duration: 1, immediateRender: false }, 2.7 + D)
      .to(cabelo, { filter: 'contrast(1) brightness(1)', duration: 0.1 }, 2.7 + D)
      // a interface
      .fromTo(nav, { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.9 }, 2.95 + D)
      .to(letras, { opacity: 1, duration: 0.01, stagger: 0.022, ease: 'none' }, 2.95 + D)
      .fromTo(ui.filter((el) => el !== frase), { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.09 }, 3.05 + D)
      .set(frase, { opacity: 1 }, 2.95 + D)
      // a navegação chegou: o quadro do ícone aparece em volta do B, que sai por baixo
      .to(navIcone, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 3.55 + D)
      .to(marca, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 3.65 + D)
      .call(() => { html.classList.remove('abertura-on'); html.classList.add('abertura-fim'); lenis?.start(); aoTerminar?.(); }, null, 3.25 + D);

    // a máscara que apaga o cabelo (o --apaga anda de baixo para cima)
    cabelo.style.webkitMaskImage = cabelo.style.maskImage = 'linear-gradient(to top, transparent var(--apaga, -20%), #000 calc(var(--apaga, -20%) + 22%))';

    // só para conferir: ?quadro=1.2 congela a abertura nesse segundo
    const quadro = parseFloat(new URLSearchParams(location.search).get('quadro'));
    // (pausar pula os onUpdate: a navalha e o giro são postos à mão; depois de ela parar, o fechamento parte dali)
    if (Number.isFinite(quadro)) {
      if (quadro >= 1.3) { anda.p = pPara; poePente(); tl.pause(quadro); } else { tl.pause(quadro); poePente(); }
      poeGiro();
      poeForma();
    }

    // pular: acelera até o fim (não corta seco)
    let acelerou = false;
    const acelera = () => { if (acelerou || tl.progress() > 0.86) return; acelerou = true; tl.timeScale(5); };
    pular.addEventListener('click', acelera);
    addEventListener('wheel', acelera, { passive: true, once: true });
    addEventListener('touchstart', acelera, { passive: true, once: true });
    addEventListener('keydown', (ev) => { if (['Escape', ' ', 'ArrowDown', 'PageDown', 'Enter'].includes(ev.key)) acelera(); });
  }
}
