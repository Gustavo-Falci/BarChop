// O hero preso: ao rolar, a interface sai (por marco, com tempo), as metades do nome se afastam, a cadeira gira ~40° e
// chega mais perto, e o fundo clareia como névoa até o osso da seção de baixo, que entra sem corte (preto → claro).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, faixa, lerp, suave, CELULAR, REDUZIDO } from './ease.js';

// com "reduzir movimento", rolar o hero só esmaece (névoa, cor, opacidade): nada anda, gira ou aproxima
const MOVE = REDUZIDO ? 0 : 1;

// do escuro do BarChop (#151412) ao papel do site (#F7F4EE)
const ESCURO = [21, 20, 18], CLARO = [247, 244, 238];
const SOPRO = 0.14;

export function heroRolando({ cena, aoClarear }) {
  const secao = document.querySelector('.hero');
  const fixo = secao.querySelector('.hero__fixo');
  const p1 = fixo.querySelector('.hero__p--1');
  const p2 = fixo.querySelector('.hero__p--2');
  const focoCss = fixo.querySelector('.hero__foco');
  const cabelo = fixo.querySelector('.hero__grade');
  const ui = [...fixo.querySelectorAll('[data-ui]')];

  let fora = false, claro = false;
  const sai = () => { if (fora) return; fora = true; gsap.to(ui, { opacity: 0, y: -14 * MOVE, duration: 0.45, ease: 'pf-in', stagger: 0.03, overwrite: true }); };
  const volta = () => { if (!fora) return; fora = false; gsap.to(ui, { opacity: 1, y: 0, duration: 0.8, ease: 'pf-out', stagger: 0.05, overwrite: true }); };

  function aplica(p) {
    if (document.documentElement.classList.contains('abertura-on')) return;
    p > 0.02 ? sai() : volta();
    const W = fixo.clientWidth, H = fixo.clientHeight;
    const a = suave(faixa(p, 0, 0.42)) * MOVE;
    gsap.set(p1, { x: -0.1 * W * a, y: -0.3 * H * a, opacity: 1 - faixa(p, 0.1, 0.4) });
    gsap.set(p2, { x: 0.09 * W * a, y: 0.26 * H * a, opacity: 1 - faixa(p, 0.1, 0.4) });

    const g = suave(faixa(p, 0, 0.72)) * MOVE;
    cena.e.giro = 0.78 * g;
    cena.e.zoom = g;
    const n = suave(faixa(p, 0.3, 0.97));
    cena.e.nevoa = n;
    cena.e.poeira = 1 - faixa(p, 0.3, 0.55);
    cena.e.chao = 1 - faixa(p, 0.34, 0.62);
    focoCss.style.opacity = String(1 - faixa(p, 0.32, 0.66));
    cabelo.style.opacity = String(SOPRO * (1 - faixa(p, 0.2, 0.45)));
    const f = suave(faixa(p, 0.3, 0.72));
    const cor = ESCURO.map((c, i) => Math.round(lerp(c, CLARO[i], f)));
    fixo.style.setProperty('--fundo', `rgb(${cor.join(',')})`);
    const agoraClaro = p > 0.62;
    if (agoraClaro !== claro) { claro = agoraClaro; aoClarear?.(claro); }
  }

  const st = ScrollTrigger.create({
    trigger: secao,
    start: 'top top',
    end: () => `+=${Math.round(innerHeight * (CELULAR() ? 1.2 : 1.35))}`,
    pin: true,
    pinSpacing: true,
    refreshPriority: 1,
    onUpdate: (self) => aplica(self.progress),
  });
  return { st, aplica: () => aplica(st.progress) };
}

// o degradê do foco nas letras usa o campo do hero inteiro: cada metade sabe onde está dentro dele
export function luzNasLetras(cena) {
  const fixo = document.querySelector('.hero__fixo');
  const palavras = fixo.querySelectorAll('.hero__p');
  function mede() {
    const W = fixo.clientWidth, H = fixo.clientHeight;
    const fx = cena.focoNaTela();
    fixo.style.setProperty('--foco-x', `${(fx / W) * 100}%`);
    for (const p of palavras) {
      p.style.setProperty('--hw', `${W}px`);
      p.style.setProperty('--hh', `${H}px`);
      p.style.setProperty('--bx', `${-p.offsetLeft}px`);
      p.style.setProperty('--by', `${-p.offsetTop}px`);
      p.style.setProperty('--foco-px', `${fx}px`);
    }
  }
  mede();
  addEventListener('resize', mede);
  return mede;
}

export { clamp };
