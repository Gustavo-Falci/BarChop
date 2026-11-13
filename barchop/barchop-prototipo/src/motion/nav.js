// A barra: some ao descer e volta ao subir; troca para tinta escura sobre as seções claras; marca o link da seção.
export function barra({ lenis }) {
  const nav = document.querySelector('.nav');
  const links = [...nav.querySelectorAll('.nav__links a')];
  const alvos = links.map((a) => document.querySelector(a.getAttribute('href')));
  const secoes = [...document.querySelectorAll('main > section, .rodape')];
  let ultimo = 0, heroClaro = false, pedido = false;

  function atualiza() {
    pedido = false;
    const y = lenis ? lenis.scroll : scrollY;
    const desce = y > ultimo + 2, sobe = y < ultimo - 2;
    if (y < 140) nav.classList.remove('is-escondida');
    else if (desce) nav.classList.add('is-escondida');
    else if (sobe) nav.classList.remove('is-escondida');
    ultimo = y;

    // a seção que está embaixo da barra (a 36 px do topo)
    let clara = false;
    for (const s of secoes) {
      const r = s.getBoundingClientRect();
      if (r.top <= 36 && r.bottom > 36) {
        clara = s.classList.contains('hero') ? heroClaro : s.classList.contains('secao--clara');
        break;
      }
    }
    nav.classList.toggle('is-clara', clara);
    // o link da seção mais perto do meio da tela
    let aqui = -1;
    alvos.forEach((el, i) => { if (!el) return; const r = el.getBoundingClientRect(); if (r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5) aqui = i; });
    links.forEach((a, i) => a.classList.toggle('is-aqui', i === aqui));
  }
  const pede = () => { if (!pedido) { pedido = true; requestAnimationFrame(atualiza); } };
  if (lenis) lenis.on('scroll', pede); else addEventListener('scroll', pede, { passive: true });
  addEventListener('resize', pede);
  // os links rolam pelo Lenis (com o mesmo freio)
  for (const a of document.querySelectorAll('a[href^="#"]')) {
    a.addEventListener('click', (ev) => {
      const id = a.getAttribute('href');
      const el = id === '#topo' ? document.body : document.querySelector(id);
      if (!el) return;
      ev.preventDefault();
      if (lenis) lenis.scrollTo(id === '#topo' ? 0 : el, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else el.scrollIntoView({ behavior: 'smooth' });
    });
  }
  return { heroClaro: (c) => { heroClaro = c; pede(); } };
}
