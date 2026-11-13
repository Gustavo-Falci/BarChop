// Barra de rolagem própria: a nativa fica escondida (base.css) porque ocupa largura e some enquanto o Lenis trava a
// página (abertura, menu); quando voltava, a página inteira pulava de lado. Esta flutua por cima, sem trilho: um fio
// que aparece ao rolar e some parado; no mouse, engrossa ao passar e dá para arrastar. Clara com mistura por diferença:
// aparece igual sobre a página branca e sobre as cenas escuras.
export function scrollbar({ lenis }) {
  const html = document.documentElement;
  const bar = document.createElement('div');
  bar.className = 'sbar';
  bar.setAttribute('aria-hidden', 'true');
  bar.innerHTML = '<div class="sbar__thumb"></div>';
  document.body.append(bar);
  const thumb = bar.firstChild;

  let idle, h = 0;
  const limit = () => Math.max(0, html.scrollHeight - innerHeight);
  const pos = () => (lenis ? lenis.scroll : scrollY);

  function draw() {
    const max = limit();
    bar.classList.toggle('is-none', max < 2);
    if (max < 2) return;
    const track = bar.clientHeight;
    h = Math.max(36, track * (innerHeight / (max + innerHeight)));
    thumb.style.height = `${h}px`;
    thumb.style.transform = `translateY(${(track - h) * Math.min(1, Math.max(0, pos() / max))}px)`;
  }
  function wake() {
    draw();
    bar.classList.add('is-on');
    clearTimeout(idle);
    idle = setTimeout(() => { if (!bar.classList.contains('is-drag')) bar.classList.remove('is-on'); }, 900);
  }

  if (lenis) lenis.on('scroll', wake); else addEventListener('scroll', wake, { passive: true });
  addEventListener('resize', draw);
  new ResizeObserver(draw).observe(document.body);
  draw();

  // arrastar: o deslocamento do ponteiro vira rolagem na proporção do trilho
  let y0 = 0, s0 = 0;
  thumb.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    thumb.setPointerCapture(e.pointerId);
    y0 = e.clientY; s0 = pos();
    bar.classList.add('is-drag', 'is-on');
  });
  thumb.addEventListener('pointermove', (e) => {
    if (!bar.classList.contains('is-drag')) return;
    const y = s0 + ((e.clientY - y0) / (bar.clientHeight - h)) * limit();
    lenis ? lenis.scrollTo(y, { immediate: true, force: true }) : scrollTo(0, y);
  });
  const release = () => { bar.classList.remove('is-drag'); wake(); };
  thumb.addEventListener('pointerup', release);
  thumb.addEventListener('pointercancel', release);
}
