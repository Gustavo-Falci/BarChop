// A cadeira parada do topo da home (home nova, marco 2): um quadro da cena 3D
// do protótipo, na pose de repouso, com fundo transparente. No marco 3 ela
// fica por baixo do 3D, que entra por cima quando carrega.
//
// Como tirar o quadro (uma vez, e de novo só se a cena mudar):
//   1. no protótipo (Documents/barchop-prototipo, `npx vite --port 4318`),
//      abrir em 1440×900 com DPR 2 e "reduzir movimento" (pula a abertura);
//   2. zerar a poeira (`__bc.cena.e.poeira = 0`) e, num requestAnimationFrame,
//      ler `document.querySelector('.hero__gl').toDataURL('image/png')`;
//   3. salvar o PNG (2880×1800) e rodar este script com o caminho dele.
//
// Escreve, em apps/web/public/home/:
//   cadeira-{1280,2200}.{avif,webp}         o quadro inteiro (cadeira + poça
//                                           de luz no chão), pro computador
//   cadeira-celular-{640,1280}.{avif,webp}  o miolo do mesmo quadro, com as
//                                           bordas esmaecidas, pro celular
//
// A posição no CSS (TopoDaHome.module.css) sai das medidas que este script
// imprime: tudo em % da altura do topo, porque a câmera do 3D tem campo de
// visão vertical fixo — a cadeira acompanha a altura da tela.
//
// Uso (de barchop/): pnpm foto-da-cadeira <quadro.png>
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SAIDA = join(REPO, "apps/web/public/home");

// Alfa mínimo do que conta como imagem: abaixo disso a poça de luz já é
// invisível sobre o escuro do topo.
const ALFA_DA_POCA = 4;
// O couro e o cromo são opacos: acima disso é a cadeira, sem a poça.
const ALFA_DA_CADEIRA = 200;
// O miolo do celular: a fração do quadro em volta da cadeira. A tela do
// celular mostra uns 54% da largura; o resto da poça fica de fora.
const MIOLO = 0.6;
// A faixa de cada lado do miolo que esmaece até sumir (sem corte reto da
// poça em tela de 600 a 760 px).
const ESMAECER = 0.18;

type Caixa = { x0: number; y0: number; x1: number; y1: number };

function caixaDoAlfa(dados: Buffer, largura: number, altura: number, limite: number): Caixa {
  const caixa = { x0: largura, y0: altura, x1: -1, y1: -1 };
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      if (dados[(y * largura + x) * 4 + 3] <= limite) continue;
      if (x < caixa.x0) caixa.x0 = x;
      if (x > caixa.x1) caixa.x1 = x;
      if (y < caixa.y0) caixa.y0 = y;
      if (y > caixa.y1) caixa.y1 = y;
    }
  }
  if (caixa.x1 < 0) throw new Error("o quadro está vazio: o canvas foi lido fora do quadro?");
  return caixa;
}

async function gravar(imagem: sharp.Sharp, nome: string, larguras: number[]) {
  for (const largura of larguras) {
    const base = imagem.clone().resize({ width: largura });
    const avif = join(SAIDA, `${nome}-${largura}.avif`);
    const webp = join(SAIDA, `${nome}-${largura}.webp`);
    const [a, w] = await Promise.all([
      base.clone().avif({ quality: 55, effort: 9 }).toFile(avif),
      base.clone().webp({ quality: 78, alphaQuality: 80, effort: 6 }).toFile(webp),
    ]);
    console.log(`${nome}-${largura}: avif ${(a.size / 1024).toFixed(1)} kB, webp ${(w.size / 1024).toFixed(1)} kB`);
  }
}

async function principal() {
  const quadro = process.argv[2];
  if (!quadro) throw new Error("uso: pnpm foto-da-cadeira <quadro.png>");
  mkdirSync(SAIDA, { recursive: true });

  const { data, info } = await sharp(quadro).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const tudo = caixaDoAlfa(data, W, H, ALFA_DA_POCA);
  const cadeira = caixaDoAlfa(data, W, H, ALFA_DA_CADEIRA);

  const recorte = { left: tudo.x0, top: tudo.y0, width: tudo.x1 - tudo.x0 + 1, height: tudo.y1 - tudo.y0 + 1 };
  const larga = sharp(quadro).extract(recorte);
  await gravar(larga, "cadeira", [1280, 2200]);

  // O miolo: centrado na cadeira, com as bordas esmaecidas no próprio alfa.
  const centro = (cadeira.x0 + cadeira.x1) / 2 - recorte.left;
  const larguraDoMiolo = Math.round(recorte.width * MIOLO);
  const esquerda = Math.max(0, Math.round(centro - larguraDoMiolo / 2));
  const miolo = await sharp(quadro)
    .extract(recorte)
    .extract({ left: esquerda, top: 0, width: larguraDoMiolo, height: recorte.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const faixa = larguraDoMiolo * ESMAECER;
  for (let y = 0; y < miolo.info.height; y++) {
    for (let x = 0; x < miolo.info.width; x++) {
      const borda = Math.min(x, miolo.info.width - 1 - x);
      if (borda >= faixa) continue;
      const t = borda / faixa;
      const i = (y * miolo.info.width + x) * 4 + 3;
      miolo.data[i] = Math.round(miolo.data[i] * t * t * (3 - 2 * t));
    }
  }
  const imagemDoMiolo = sharp(miolo.data, {
    raw: { width: miolo.info.width, height: miolo.info.height, channels: 4 },
  });
  await gravar(imagemDoMiolo, "cadeira-celular", [640, 1280]);

  // As medidas pro CSS, em fração do quadro e do recorte.
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  console.log({
    quadro: `${W}×${H}`,
    recorte: `${recorte.width}×${recorte.height} em (${recorte.left}, ${recorte.top})`,
    topoDoRecorte: pct(recorte.top / H),
    alturaDoRecorte: pct(recorte.height / H),
    centroDoRecorteX: pct((recorte.left + recorte.width / 2) / W),
    cadeiraNaAlturaDoRecorte: pct((cadeira.y1 - cadeira.y0 + 1) / recorte.height),
    cadeiraNoCentroX: pct((cadeira.x0 + cadeira.x1) / 2 / W),
    miolo: `${larguraDoMiolo}×${recorte.height}, a partir de x=${esquerda} do recorte`,
  });
}

await principal();
