// Lenis + ScrollTrigger num relógio só (o do GSAP). Sem Lenis com movimento reduzido.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { REDUZIDO } from './ease.js';

gsap.registerPlugin(ScrollTrigger);

export function criarScroll() {
  ScrollTrigger.config({ ignoreMobileResize: true });
  if (REDUZIDO) return null;
  // no toque a rolagem é a nativa (sem syncTouch): o script nunca briga com o dedo nem com a inércia do iOS
  const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  return lenis;
}
