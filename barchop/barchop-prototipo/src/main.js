// o CSS não entra por aqui: vem em <link> no index.html (importado pelo JS, a página aparecia crua no recarregamento)
window.__aberturaViva = true;
document.documentElement.classList.add('js-pronto');
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { REDUZIDO } from './motion/ease.js';
import { criarScroll } from './motion/smooth.js';
import { criarGuia } from './motion/guia.js';
import { scrollbar } from './motion/scrollbar.js';
import { criarCadeira } from './gl/cadeira.js';
import { abertura } from './motion/abertura.js';
import { heroRolando, luzNasLetras } from './motion/hero.js';
import { barra } from './motion/nav.js';
import { titulos } from './motion/titulos.js';
import { montarGrade } from './grade.js';
import { status } from './status.js';

// a primeira pintura nasce sem transição (nada pisca); depois de dois quadros as transições valem
requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('assentou')));

// botões: o rótulo ganha uma cópia logo abaixo (sobe no hover)
for (const b of document.querySelectorAll('.botao')) {
  const t = b.textContent.trim();
  b.innerHTML = `<span class="botao__txt" data-txt="${t}"><span>${t}</span></span>`;
}

// couro da cadeira (?tema=preto | vinho | conhaque)
const tema = new URLSearchParams(location.search).get('tema') || 'conhaque';

const grade = montarGrade(document.querySelector('.hero__grade'));
status();

const lenis = criarScroll();
criarGuia({ lenis });
scrollbar({ lenis });

const cena = criarCadeira(document.querySelector('.hero__gl'), { tema });
const medeLuz = luzNasLetras(cena);
cena.pronto.then(() => { medeLuz(); ScrollTrigger.refresh(); });

const nav = barra({ lenis });
const hero = heroRolando({ cena, aoClarear: (claro) => nav.heroClaro(claro) });
titulos();

abertura({ lenis, cena, grade, aoTerminar: () => { medeLuz(); hero.aplica(); } });

if (REDUZIDO) document.documentElement.classList.add('reduzido');
addEventListener('load', () => ScrollTrigger.refresh());
window.__bc = { gsap, ScrollTrigger, lenis, cena };
