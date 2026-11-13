// A lâmina da navalha na abertura (home nova, marco 5, do abertura.js do
// protótipo). Fechada, é uma barra reta ao lado do cabo; no B, são as
// duas barrigas da marca (o traço do MarcaDoBarChop: reta, meia-volta de
// raio 24 e 33, reta). As duas formas são escritas com as mesmas 8 curvas,
// 4 por barriga, e a barra é dividida na proporção do comprimento de cada
// trecho do B: deformar é só andar cada número de uma para a outra.

// Uma reta como curva: os dois pontos de controle a 1/3 e 2/3 do caminho.
function reta(x0: number, y0: number, x1: number, y1: number): number[] {
  return [x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1];
}

// [ponto inicial, 4 curvas de 6 números] por barriga.
const BARRA = [
  [92, 52, ...reta(92, 52, 92, 62.7), ...reta(92, 62.7, 92, 76), ...reta(92, 76, 92, 89.3), ...reta(92, 89.3, 92, 100)],
  [92, 100, ...reta(92, 100, 92, 113.5), ...reta(92, 113.5, 92, 133), ...reta(92, 133, 92, 152.5), ...reta(92, 152.5, 92, 166)],
];

const BARRIGAS = [
  [80, 52, ...reta(80, 52, 110, 52), 123.25, 52, 134, 62.75, 134, 76, 134, 89.25, 123.25, 100, 110, 100, ...reta(110, 100, 80, 100)],
  [80, 100, ...reta(80, 100, 116, 100), 134.23, 100, 149, 114.77, 149, 133, 149, 151.23, 134.23, 166, 116, 166, ...reta(116, 166, 80, 166)],
];

const num = (n: number) => String(Number(n.toFixed(2)));

/** O `d` da lâmina: 0 = a barra reta (fechada), 1 = o B da marca. */
export function laminaEm(t: number): string {
  const k = Math.min(1, Math.max(0, t));
  return BARRA.map((barra, s) => {
    const v = barra.map((n, i) => num(n + (BARRIGAS[s][i] - n) * k));
    const curvas = [0, 1, 2, 3].map((c) => ` C${v.slice(2 + c * 6, 8 + c * 6).join(" ")}`).join("");
    return `M${v[0]} ${v[1]}${curvas}`;
  }).join("");
}
