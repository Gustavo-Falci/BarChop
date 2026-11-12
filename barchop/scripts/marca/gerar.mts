// Gera os ícones do BarChop a partir da marca "Navalha em B" (versão C: a
// lâmina abrindo no pino). Um desenho só, num quadro de 200: o cabo dourado
// é a haste do B e a lâmina de aço faz as duas barrigas, girada 11° no pino.
// Abaixo de 24 px entra o favicon redesenhado na grade de 16 (sem friso, corte
// e brilho, que somem nesse tamanho).
//
// Escreve:
//   apps/web/app/icon.svg          aba do navegador (Next gera o <link>)
//   apps/web/app/apple-icon.png    tela de início do iPhone, 180
//   apps/mobile/assets/icon.png    ícone do app, 1024 (o iOS arredonda)
//   apps/mobile/assets/android-icon-*.png  ícone adaptativo do Android
//   apps/mobile/assets/favicon.png Expo web, 48
//
// Uso (de barchop/): pnpm marca
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_APP = join(REPO, "apps/web/app");
const MOBILE = join(REPO, "apps/mobile/assets");

const COR = {
  ouro: "#E8C547",
  escuro: "#1A1A1A",
  aco: "#ECE6DA",
  fio: "#B8B0A2",
};

const GIRO = "rotate(-11 69 52)"; // a lâmina abre no pino
const CENTRO = "translate(-16 4)"; // com a lâmina aberta o desenho pende pra direita: volta pro meio

// Pino, friso do cabo e corte são vazados de verdade (máscara): a marca serve
// sobre qualquer fundo, inclusive o transparente do ícone adaptativo.
function mascara(fioVazado: boolean): string {
  return `<mask id="furos" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">
<rect width="200" height="200" fill="#fff"/>
<circle cx="69" cy="52" r="6.5" fill="#000"/>
<circle cx="69" cy="52" r="2.6" fill="#fff"/>
<rect x="60.5" y="72" width="2" height="84" rx="1" fill="#000"/>
<g transform="${GIRO}">
<path d="M128 112 160 92 164 98 132 118Z" fill="#000"/>${
    fioVazado
      ? `
<path d="M90 52H110A24 24 0 0 1 110 100M90 100H116A33 33 0 0 1 116 166" fill="none" stroke="#000" stroke-width="2.4"/>`
      : ""
  }
</g>
</mask>`;
}

type Cores = { cabo: string; aco: string; fio?: string; brilho?: string };

// Sem fio/brilho = versão de uma cor: friso vazado, sem brilho e uma fresta
// entre o cabo e a lâmina (senão as duas viram uma mancha só).
function desenho({ cabo, aco, fio, brilho }: Cores): string {
  const umaCor = !fio;
  const inicio = umaCor ? 88 : 80;
  const detalhes = umaCor
    ? ""
    : `
<path d="M84 52H110A24 24 0 0 1 110 100M84 100H116A33 33 0 0 1 116 166" fill="none" stroke="${fio}" stroke-width="2"/>
<path d="M140 136 168 119" fill="none" stroke="${brilho}" stroke-width="3" stroke-linecap="round"/>`;
  return `<g transform="${CENTRO}"><g mask="url(#furos)">
<path d="M70 36Q70 22 86 22" fill="none" stroke="${aco}" stroke-width="7" stroke-linecap="round"/>
<g transform="${GIRO}">
<path d="M${inicio} 52H110A24 24 0 0 1 110 100H${inicio}M${inicio} 100H116A33 33 0 0 1 116 166H${inicio}" fill="none" stroke="${aco}" stroke-width="19"/>${detalhes}
</g>
<rect x="55" y="36" width="28" height="134" rx="14" fill="${cabo}"/>
</g></g>`;
}

const colorida: Cores = { cabo: COR.ouro, aco: COR.aco, fio: COR.fio, brilho: COR.ouro };

// `lado` dá width/height ao <svg>: é o tamanho em que o sharp rasteriza.
// `escala` encolhe o desenho no meio do quadro; `fundo` fica de fora dela.
function svg({ desenho, defs = "", lado, escala = 1, fundo = "" }: {
  desenho: string;
  defs?: string;
  lado: number;
  escala?: number;
  fundo?: string;
}): string {
  const margem = (200 * (1 - escala)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${lado}" height="${lado}">
<defs>${defs}</defs>
${fundo}<g transform="translate(${margem} ${margem}) scale(${escala})">${desenho}</g>
</svg>
`;
}

// O quadro escuro de canto cheio: o iOS e o Android cortam a forma sozinhos.
const quadroCheio = `<rect width="200" height="200" fill="${COR.escuro}"/>`;

// Favicon redesenhado na grade de 16: cabo e lâmina mais grossos, só o pino de furo.
function favicon(lado?: number): string {
  const tamanho = lado ? ` width="${lado}" height="${lado}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"${tamanho}>
<rect width="16" height="16" rx="3.5" fill="${COR.escuro}"/>
<path d="M6 3.5H8.6A2.2 2.2 0 0 1 8.6 7.9H6M6 7.9H9A2.65 2.65 0 0 1 9 13.2H6" fill="none" stroke="${COR.aco}" stroke-width="2.1" transform="translate(-.5 0) rotate(-11 4.6 4.3)"/>
<rect x="2.5" y="2.4" width="3.2" height="11.6" rx="1.6" fill="${COR.ouro}"/>
<circle cx="4.1" cy="4.3" r=".85" fill="${COR.escuro}"/>
</svg>
`;
}

async function png(destino: string, conteudo: string): Promise<void> {
  await sharp(Buffer.from(conteudo)).png({ compressionLevel: 9 }).toFile(destino);
}

// O ícone adaptativo do Android recorta um círculo (ou gota, ou quadrado) de
// 66 dos 108 dp: o desenho cabe em ~62% do quadro pra nada encostar na borda.
const ZONA_SEGURA = 0.62;
// No ícone de canto cheio (iPhone, loja) o desenho respira: ~80% do quadro,
// longe do arredondado que o sistema corta.
const MIOLO = 0.8;

const cheio = (lado: number) =>
  svg({ desenho: desenho(colorida), defs: mascara(false), lado, escala: MIOLO, fundo: quadroCheio });

writeFileSync(join(WEB_APP, "icon.svg"), favicon());
await png(join(WEB_APP, "apple-icon.png"), cheio(180));

await png(join(MOBILE, "icon.png"), cheio(1024));
await png(join(MOBILE, "android-icon-background.png"), svg({ desenho: "", lado: 1024, fundo: quadroCheio }));
await png(
  join(MOBILE, "android-icon-foreground.png"),
  svg({ desenho: desenho(colorida), defs: mascara(false), lado: 1024, escala: ZONA_SEGURA })
);
// Ícone temático (Android 13+): o sistema pinta a silhueta; vale só o alfa.
await png(
  join(MOBILE, "android-icon-monochrome.png"),
  svg({ desenho: desenho({ cabo: "#FFFFFF", aco: "#FFFFFF" }), defs: mascara(true), lado: 1024, escala: ZONA_SEGURA })
);
await png(join(MOBILE, "favicon.png"), favicon(48));

console.log("marca: icon.svg e apple-icon.png no web; icon, android-icon-* e favicon no mobile");
