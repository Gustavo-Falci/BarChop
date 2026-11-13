// A grade da agenda do dia no fundo do hero (o lugar do cabelo em macro do Pente Fino): dez linhas de horário, quatro
// colunas de profissional e os agendamentos que acendem quando a navalha passa por cima. Só visual: os nomes são
// inventados e o leitor de tela pula tudo (o pai é aria-hidden).

// [coluna 1..4, linha 0..9 (09:00..18:00), duração em linhas, serviço, cliente]
const BLOCOS = [
  [4, 0, 1, 'Corte', 'Diego'], [2, 0, 2, 'Corte e barba', 'Bruno'], [1, 0, 1, 'Corte', 'Rafael'],
  [3, 1, 1, 'Barba', 'Caio'], [4, 2, 2, 'Corte e barba', 'Lucas'], [1, 2, 1, 'Degradê', 'Thiago'],
  [3, 3, 1, 'Corte', 'Pedro'], [2, 4, 1, 'Barba', 'Vitor'], [1, 4, 2, 'Pigmentação', 'André'],
  [4, 5, 1, 'Sobrancelha', 'Felipe'], [3, 5, 2, 'Corte e barba', 'Mateus'], [2, 6, 1, 'Corte', 'Igor'],
  [4, 7, 2, 'Corte', 'Léo'], [1, 7, 1, 'Corte', 'Gabriel'], [3, 8, 1, 'Corte', 'Rui'], [2, 8, 1, 'Barba', 'Davi'],
];

export function montarGrade(el) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 10; i++) {
    const h = document.createElement('span');
    h.className = 'grade__hora mono';
    h.style.top = `${i * 10}%`;
    h.textContent = `${String(9 + i).padStart(2, '0')}:00`;
    frag.append(h);
  }
  const blocos = BLOCOS.map(([col, lin, dur, servico, cliente]) => {
    const b = document.createElement('span');
    b.className = 'grade__bloco';
    b.dataset.col = col;
    b.style.cssText = `left:calc(${col} * var(--cw) + 0.5%);width:calc(var(--cw) - 1%);top:calc(${lin * 10}% + 0.5%);height:calc(${dur * 10}% - 1%)`;
    b.innerHTML = `<span>${servico}</span><small>${cliente}</small>`;
    frag.append(b);
    return { el: b, cx: 0, aceso: false };
  });
  el.append(frag);

  // o centro de cada bloco na tela (a navalha anda da direita para a esquerda e acende o que deixa para trás)
  function mede() {
    const r0 = el.getBoundingClientRect();
    for (const b of blocos) { const r = b.el.getBoundingClientRect(); b.cx = r.left - r0.left + r.width * 0.5; }
  }
  function acende(x) {
    for (const b of blocos) {
      if (b.aceso || x > b.cx) continue;
      b.aceso = true;
      b.el.classList.add('is-cheio', 'is-flash');
      setTimeout(() => b.el.classList.remove('is-flash'), 380);
    }
  }
  function acendeTodos() { for (const b of blocos) { b.aceso = true; b.el.classList.add('is-cheio'); } }

  return { mede, acende, acendeTodos };
}
