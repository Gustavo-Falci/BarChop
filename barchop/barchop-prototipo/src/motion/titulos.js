// Títulos de seção: as palavras sobem e saem do desfoque uma a uma, a parte leve antes e a pesada depois. Entram por
// marco, com tempo fixo (nunca presas à rolagem: parar no meio nunca deixa meia palavra); ao subir de volta, saem.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { REDUZIDO } from './ease.js';

export function titulos() {
  for (const t of document.querySelectorAll('[data-titulo]')) {
    const palavras = [];
    for (const parte of t.querySelectorAll(':scope > span')) {
      const txt = parte.textContent.trim().split(/\s+/);
      parte.textContent = '';
      txt.forEach((w, i) => {
        const s = document.createElement('span');
        s.className = 'palavra';
        s.textContent = w;
        parte.append(s);
        if (i < txt.length - 1) parte.append(' ');
        palavras.push(s);
      });
    }
    if (REDUZIDO) continue;
    const desfoque = t.dataset.titulo === 'desfoque';
    gsap.set(palavras, { opacity: 0, y: desfoque ? 0 : '0.42em', filter: `blur(${desfoque ? 14 : 8}px)` });
    const entra = () => gsap.to(palavras, { opacity: 1, y: 0, filter: 'blur(0px)', duration: desfoque ? 1.1 : 0.95, ease: 'pf-out', stagger: desfoque ? 0.16 : 0.07, overwrite: true });
    const sai = () => gsap.to(palavras, { opacity: 0, y: desfoque ? 0 : '0.42em', filter: `blur(${desfoque ? 14 : 8}px)`, duration: 0.35, ease: 'pf-in', overwrite: true });
    ScrollTrigger.create({ trigger: t, start: 'top 86%', onEnter: entra, onLeaveBack: sai });
  }
}
