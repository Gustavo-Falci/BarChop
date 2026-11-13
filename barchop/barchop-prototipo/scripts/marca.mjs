// Gera os arquivos da marca do BarChop ("Navalha em B", versão C: a lâmina abrindo no pino).
// Um desenho só, num quadro de 200: o cabo dourado é a haste do B e a lâmina de aço faz as duas barrigas,
// girada 11° no pino. Abaixo de 24 px entra o favicon redesenhado em grade de 16.
// Rodar: npm run marca  →  public/marca/*.svg e *.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const SAIDA = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'marca');

const COR = {
  ouro: '#E8C547',
  escuro: '#1A1A1A',
  aco: '#ECE6DA',
  fio: '#B8B0A2',
  borda: '#3A3631',
  tinta: '#26221C',
};

const GIRO = 'rotate(-11 69 52)'; // a lâmina abre no pino
const CENTRO = 'translate(-16 4)'; // com a lâmina aberta, o desenho pende pra direita: volta pro meio

// pino, friso do cabo e corte são vazados de verdade (máscara), então a marca serve sobre qualquer fundo
function mascara(fioVazado) {
  return `<mask id="furos" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
<rect width="200" height="200" fill="#fff"/>
<circle cx="69" cy="52" r="6.5" fill="#000"/>
<circle cx="69" cy="52" r="2.6" fill="#fff"/>
<rect x="60.5" y="72" width="2" height="84" rx="1" fill="#000"/>
<g transform="${GIRO}">
<path d="M128 112 160 92 164 98 132 118Z" fill="#000"/>${fioVazado ? `
<path d="M90 52H110A24 24 0 0 1 110 100M90 100H116A33 33 0 0 1 116 166" fill="none" stroke="#000" stroke-width="2.4"/>` : ''}
</g>
</mask>`;
}

// cores: { cabo, aco, fio, brilho }. fio/brilho null = versão de uma cor (friso vazado, sem brilho, fresta entre cabo e lâmina)
function desenho({ cabo, aco, fio, brilho }) {
  const umaCor = !fio;
  const inicio = umaCor ? 88 : 80;
  return `<g transform="${CENTRO}"><g mask="url(#furos)">
<path d="M70 36Q70 22 86 22" fill="none" stroke="${aco}" stroke-width="7" stroke-linecap="round"/>
<g transform="${GIRO}">
<path d="M${inicio} 52H110A24 24 0 0 1 110 100H${inicio}M${inicio} 100H116A33 33 0 0 1 116 166H${inicio}" fill="none" stroke="${aco}" stroke-width="19"/>${umaCor ? '' : `
<path d="M84 52H110A24 24 0 0 1 110 100M84 100H116A33 33 0 0 1 116 166" fill="none" stroke="${fio}" stroke-width="2"/>
<path d="M140 136 168 119" fill="none" stroke="${brilho}" stroke-width="3" stroke-linecap="round"/>`}
</g>
<rect x="55" y="36" width="28" height="134" rx="14" fill="${cabo}"/>
</g></g>`;
}

function svg(titulo, corpo, defs) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${titulo}">
<title>${titulo}</title>
<defs>${defs}</defs>
${corpo}
</svg>
`;
}

const quadro = `<rect x="2" y="2" width="196" height="196" rx="46" fill="${COR.escuro}"/>
<rect x="3.5" y="3.5" width="193" height="193" rx="44.5" fill="none" stroke="${COR.borda}" stroke-width="3"/>`;
const quadroCheio = `<rect width="200" height="200" fill="${COR.escuro}"/>`; // o iOS arredonda sozinho

const colorida = { cabo: COR.ouro, aco: COR.aco, fio: COR.fio, brilho: COR.ouro };

const arquivos = {
  // sobre fundo escuro, sem quadro
  'marca.svg': svg('BarChop', desenho(colorida), mascara(false)),
  // sobre o ouro: tudo em quase preto
  'marca-escura.svg': svg('BarChop', desenho({ cabo: COR.escuro, aco: COR.escuro, fio: COR.ouro, brilho: COR.escuro }), mascara(false)),
  // uma cor: carimbo, recibo, bordado
  'marca-tinta.svg': svg('BarChop', desenho({ cabo: COR.tinta, aco: COR.tinta }), mascara(true)),
  'marca-creme.svg': svg('BarChop', desenho({ cabo: COR.aco, aco: COR.aco }), mascara(true)),
  // ícone de app: dentro do quadro escuro (a versão que funciona no claro e no escuro)
  'icone.svg': svg('BarChop', quadro + desenho(colorida), mascara(false)),
  'icone-cheio.svg': svg('BarChop', quadroCheio + desenho(colorida), mascara(false)),
  // favicon redesenhado na grade de 16: sem friso, corte e brilho; cabo e lâmina mais grossos
  'favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
<rect width="16" height="16" rx="3.5" fill="${COR.escuro}"/>
<path d="M6 3.5H8.6A2.2 2.2 0 0 1 8.6 7.9H6M6 7.9H9A2.65 2.65 0 0 1 9 13.2H6" fill="none" stroke="${COR.aco}" stroke-width="2.1" transform="translate(-.5 0) rotate(-11 4.6 4.3)"/>
<rect x="2.5" y="2.4" width="3.2" height="11.6" rx="1.6" fill="${COR.ouro}"/>
<circle cx="4.1" cy="4.3" r=".85" fill="${COR.escuro}"/>
</svg>
`,
};

const pngs = [
  ['favicon-32.png', 'favicon.svg', 32],
  ['apple-touch-icon.png', 'icone-cheio.svg', 180],
  ['icone-192.png', 'icone.svg', 192],
  ['icone-512.png', 'icone.svg', 512],
];

mkdirSync(SAIDA, { recursive: true });
for (const [nome, conteudo] of Object.entries(arquivos)) {
  writeFileSync(join(SAIDA, nome), conteudo);
}
for (const [nome, origem, lado] of pngs) {
  const png = new Resvg(arquivos[origem], { fitTo: { mode: 'width', value: lado } }).render().asPng();
  writeFileSync(join(SAIDA, nome), png);
}
console.log(`marca: ${Object.keys(arquivos).length} svg + ${pngs.length} png em ${SAIDA}`);
