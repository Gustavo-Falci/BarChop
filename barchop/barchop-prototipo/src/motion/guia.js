// O guia: o freio da rolagem na roda do mouse e do trackpad. A página sempre rola presa ao gesto e nunca para
// sozinha, mas o alvo nunca fica mais que AVANCO telas à frente de onde a página está (~1,1 tela por segundo com o
// lerp 0,1 do Lenis): cada cena tem tempo de tocar mesmo com um gesto forte.
// Toque: rolagem nativa, nada cancelado (o Lenis chama este filtro também no toque; cancelar o touchend mataria o
// clique de todo botão no celular).
const AVANCO = 0.2;

export function criarGuia({ lenis }) {
  if (!lenis) return;
  function roda(data) {
    const { deltaY, event } = data;
    if (event.ctrlKey || !deltaY) return true;
    const alvo = lenis.targetScroll;
    const dir = Math.sign(deltaY);
    const lim = lenis.animatedScroll + dir * AVANCO * innerHeight;
    const novo = dir > 0 ? Math.max(alvo, Math.min(alvo + deltaY, lim)) : Math.min(alvo, Math.max(alvo + deltaY, lim));
    data.deltaY = novo - alvo;
    if (Math.abs(data.deltaY) < 0.5) { if (event.cancelable) event.preventDefault(); return false; }
    return true;
  }
  lenis.options.virtualScroll = (data) => (data.event.type.includes('touch') ? true : roda(data));
}
