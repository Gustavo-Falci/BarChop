import type { FormatoDaLogo } from "@barchop/types";

// A logo da barbearia antes do envio: reduzida e com a transparência
// preservada (o redimensionarImagem da capa e das fotos regrava em JPEG,
// que pinta o fundo transparente de preto), e com a moldura sugerida
// pelos pixels do próprio arquivo — lido aqui, no navegador, porque é o
// arquivo local: a imagem já no bucket não deixaria ler os pixels sem
// CORS. A sugestão é só o ponto de partida; o dono confirma na tela.

export interface PixelsDaImagem {
  width: number;
  height: number;
  // RGBA, 4 bytes por pixel, linha a linha — o formato do ImageData.
  data: Uint8ClampedArray;
}

// Até 1,2 de proporção ainda é "quadrada o bastante" pra moldura redonda
// ou quadrada; daí pra fora, a logo é larga (ou alta) e fica sem moldura.
const PROPORCAO_MAXIMA = 1.2;
const TRANSPARENTE = 32;
const OPACO = 224;

function alfaMedio(pixels: PixelsDaImagem, x0: number, y0: number, lado: number): number {
  let soma = 0;
  let total = 0;
  for (let y = y0; y < y0 + lado; y++) {
    for (let x = x0; x < x0 + lado; x++) {
      soma += pixels.data[(y * pixels.width + x) * 4 + 3];
      total++;
    }
  }
  return total ? soma / total : 0;
}

// Quantos pontos de um anel (pouco pra dentro do círculo inscrito) estão
// preenchidos: num círculo cheio, quase todos; num desenho solto, poucos.
function preenchimentoDoAnel(pixels: PixelsDaImagem): number {
  const { width, height } = pixels;
  const cx = width / 2;
  const cy = height / 2;
  const raio = (Math.min(width, height) / 2) * 0.88;
  const pontos = 72;
  let cheios = 0;
  for (let i = 0; i < pontos; i++) {
    const angulo = (i / pontos) * 2 * Math.PI;
    const x = Math.min(width - 1, Math.max(0, Math.floor(cx + raio * Math.cos(angulo))));
    const y = Math.min(height - 1, Math.max(0, Math.floor(cy + raio * Math.sin(angulo))));
    if (pixels.data[(y * width + x) * 4 + 3] > 128) cheios++;
  }
  return cheios / pontos;
}

export function sugerirFormatoDaLogo(pixels: PixelsDaImagem): FormatoDaLogo {
  const { width, height } = pixels;
  if (!width || !height) return "livre";
  const proporcao = Math.max(width, height) / Math.min(width, height);
  if (proporcao > PROPORCAO_MAXIMA) return "livre";

  // Os quatro cantos, num quadradinho de 8% do lado: é onde um círculo
  // deixa vazio e um quadrado preenche.
  const lado = Math.max(1, Math.round(Math.min(width, height) * 0.08));
  const cantos = [
    alfaMedio(pixels, 0, 0, lado),
    alfaMedio(pixels, width - lado, 0, lado),
    alfaMedio(pixels, 0, height - lado, lado),
    alfaMedio(pixels, width - lado, height - lado, lado),
  ];
  // Fundo opaco (inclusive o branco de uma logo redonda num PNG sem
  // transparência): o fundo faz parte da imagem, e a moldura quadrada
  // não corta nada dele.
  if (cantos.every((alfa) => alfa >= OPACO)) return "quadrada";
  if (cantos.every((alfa) => alfa <= TRANSPARENTE) && preenchimentoDoAnel(pixels) >= 0.85) {
    return "redonda";
  }
  return "livre";
}

const LADO_DA_LOGO = 512;

// Decodifica uma vez, reduz pra até 512px, sugere o formato e regrava em
// WebP com alfa — quem não codifica WebP (Safari) devolve PNG pelo
// próprio toBlob, que a API também aceita. Regravar pelo canvas ainda
// descarta os metadados do arquivo, como na capa.
//
// Se o navegador não abrir o arquivo, devolve o original como "livre": a
// API recusa com 422 o que não for imagem, e a tela mostra o aviso.
export async function prepararLogo(
  arquivo: Blob
): Promise<{ arquivo: Blob; formato: FormatoDaLogo }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    return { arquivo, formato: "livre" };
  }

  const escala = Math.min(1, LADO_DA_LOGO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const contexto = canvas.getContext("2d");
  if (!contexto) {
    bitmap.close();
    return { arquivo, formato: "livre" };
  }
  contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const formato = sugerirFormatoDaLogo(contexto.getImageData(0, 0, canvas.width, canvas.height));
  const regravado = await new Promise<Blob | null>((pronto) =>
    canvas.toBlob(pronto, "image/webp", 0.9)
  );
  return { arquivo: regravado ?? arquivo, formato };
}
