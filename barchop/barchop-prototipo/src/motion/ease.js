// Curvas da marca e o que a página sabe do aparelho.
import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(CustomEase);

CustomEase.create('pf-out', '0.22, 1, 0.36, 1');
CustomEase.create('pf-in', '0.64, 0, 0.78, 0');
CustomEase.create('pf-io', '0.76, 0, 0.24, 1');

export const REDUZIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const TOQUE = matchMedia('(hover: none)').matches;
export const CELULAR = () => innerWidth <= 760;

// a altura das cenas presas é 100svh (a tela com as barras do navegador abertas): medir pelo innerHeight mudaria o
// tamanho das peças quando a barra do Safari some no meio da rolagem
const regua = document.createElement('div');
regua.style.cssText = 'position:fixed;left:0;top:0;width:0;height:100svh;visibility:hidden;pointer-events:none';
document.body.append(regua);
export const alturaTela = () => regua.offsetHeight || innerHeight;
// a unidade de cena, a mesma conta do --u do CSS (tokens.css)
export const unidade = (vw = innerWidth, vh = alturaTela()) => (vw <= 760 ? Math.min(vw / 390, vh / 844) : Math.min(vw / 1440, vh / 900));

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const faixa = (v, a, b) => clamp((v - a) / (b - a));
export const suave = (t) => t * t * (3 - 2 * t);
