import type { TipoDeImagem } from "./armazenamento";

// Tira os metadados de uma imagem antes de ela ir pro bucket público
// (auditoria de segurança de 15/11, SEC-020). Foto de celular leva no
// EXIF as coordenadas de onde foi tirada, a data e o aparelho: uma foto
// de perfil tirada em casa publicava o endereço de quem a tirou.
//
// A tela já regrava a imagem no navegador (canvas), e isso tira o EXIF;
// mas quem chama a API direto pulava a tela. Aqui a regra vale pra
// qualquer um.
//
// Sem reencodar: o arquivo é um contêiner de blocos, e os blocos de
// metadados saem inteiros; os de imagem passam intactos, byte a byte.
// Não há perda de qualidade nem dependência nativa. O que vem depois do
// fim da imagem (lixo, ou uma segunda imagem com EXIF próprio, como nas
// "fotos com movimento") também sai.
//
// Do EXIF fica só uma coisa: a orientação. Sem ela, a foto tirada com o
// celular em pé apareceria deitada. Só no JPEG, que é o que a câmera
// grava; PNG e WebP com orientação no EXIF são raros, e perdem a dela.
//
// Arquivo que não segue o formato do próprio tipo é recusado: se não dá
// pra ler os blocos, não dá pra garantir o que há neles.

export class ImagemInvalida extends Error {
  constructor(motivo: string) {
    super(`imagem inválida: ${motivo}`);
    this.name = "ImagemInvalida";
  }
}

export function semMetadados(bytes: Buffer, tipo: TipoDeImagem): Buffer {
  switch (tipo) {
    case "image/jpeg":
      return jpegSemMetadados(bytes);
    case "image/png":
      return pngSemMetadados(bytes);
    case "image/webp":
      return webpSemMetadados(bytes);
  }
}

// ---------------------------------------------------------------- JPEG

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0; // JFIF
const APP1 = 0xe1; // Exif e XMP
const APP2 = 0xe2; // perfil de cor (ICC)
const APP14 = 0xee; // Adobe: diz como ler as cores de um JPEG CMYK
const COM = 0xfe;

// Os APPn que mudam como a imagem é desenhada ficam; os outros (Exif,
// XMP, IPTC, miniaturas, notas do fabricante) e os comentários saem.
function ficaNoJpeg(marcador: number): boolean {
  if (marcador === COM) return false;
  if (marcador >= 0xe0 && marcador <= 0xef) {
    return marcador === APP0 || marcador === APP2 || marcador === APP14;
  }
  return true;
}

// Marcadores sem tamanho: os RSTn e o TEM.
function semTamanho(marcador: number): boolean {
  return (marcador >= 0xd0 && marcador <= 0xd7) || marcador === 0x01;
}

function jpegSemMetadados(bytes: Buffer): Buffer {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) throw new ImagemInvalida("não começa como JPEG");

  const partes: Buffer[] = [];
  let orientacao: number | null = null;
  let posicao = 2;
  let terminou = false;

  while (posicao < bytes.length) {
    if (bytes[posicao] !== 0xff) throw new ImagemInvalida("bloco do JPEG fora do lugar");
    // FF repetido é preenchimento.
    while (posicao < bytes.length && bytes[posicao + 1] === 0xff) posicao += 1;
    const marcador = bytes[posicao + 1];
    if (marcador === undefined) throw new ImagemInvalida("JPEG cortado");

    if (marcador === EOI) {
      partes.push(bytes.subarray(posicao, posicao + 2));
      terminou = true;
      break;
    }
    if (semTamanho(marcador)) {
      partes.push(bytes.subarray(posicao, posicao + 2));
      posicao += 2;
      continue;
    }

    if (posicao + 4 > bytes.length) throw new ImagemInvalida("JPEG cortado");
    const tamanho = bytes.readUInt16BE(posicao + 2);
    const fim = posicao + 2 + tamanho;
    if (tamanho < 2 || fim > bytes.length) throw new ImagemInvalida("bloco do JPEG com tamanho errado");

    if (marcador === APP1 && orientacao === null) {
      orientacao = orientacaoDoExif(bytes.subarray(posicao + 4, fim));
    }
    if (ficaNoJpeg(marcador)) partes.push(bytes.subarray(posicao, fim));
    posicao = fim;

    if (marcador === SOS) {
      // Os dados da imagem: vão até o próximo marcador de verdade. Lá
      // dentro, FF só aparece seguido de 00 (escape), de RSTn ou de
      // outro FF (preenchimento).
      const inicio = posicao;
      while (posicao < bytes.length) {
        if (bytes[posicao] === 0xff) {
          const proximo = bytes[posicao + 1];
          if (proximo !== 0x00 && proximo !== 0xff && !(proximo !== undefined && proximo >= 0xd0 && proximo <= 0xd7)) break;
          posicao += proximo === 0xff ? 1 : 2;
        } else {
          posicao += 1;
        }
      }
      partes.push(bytes.subarray(inicio, posicao));
    }
  }
  if (!terminou) throw new ImagemInvalida("JPEG sem fim");

  // A orientação volta num Exif mínimo, logo depois do começo (e do
  // JFIF, quando ele abre o arquivo, que é onde os leitores o esperam).
  const cabeca: Buffer[] = [bytes.subarray(0, 2)];
  if (orientacao !== null && orientacao !== 1) {
    const primeiroEhJfif = partes[0]?.[1] === APP0;
    if (primeiroEhJfif) cabeca.push(partes.shift()!);
    cabeca.push(exifSoComOrientacao(orientacao));
  }
  return Buffer.concat([...cabeca, ...partes]);
}

const ROTULO_DO_EXIF = Buffer.from("Exif\0\0", "latin1");
const ETIQUETA_DA_ORIENTACAO = 0x0112;

// Lê só a etiqueta de orientação do primeiro diretório do Exif. Qualquer
// coisa fora do esperado é "sem orientação": o Exif vai embora de todo
// jeito, e não vale recusar a foto por causa dele.
function orientacaoDoExif(app1: Buffer): number | null {
  if (app1.length < 14 || !app1.subarray(0, 6).equals(ROTULO_DO_EXIF)) return null;
  const tiff = app1.subarray(6);
  const ordem = tiff.toString("latin1", 0, 2);
  if (ordem !== "II" && ordem !== "MM") return null;
  const pequeno = ordem === "II";
  const u16 = (em: number) => (pequeno ? tiff.readUInt16LE(em) : tiff.readUInt16BE(em));
  const u32 = (em: number) => (pequeno ? tiff.readUInt32LE(em) : tiff.readUInt32BE(em));

  try {
    const diretorio = u32(4);
    const entradas = u16(diretorio);
    for (let indice = 0; indice < entradas; indice += 1) {
      const entrada = diretorio + 2 + indice * 12;
      if (u16(entrada) !== ETIQUETA_DA_ORIENTACAO) continue;
      const valor = u16(entrada + 8);
      return valor >= 1 && valor <= 8 ? valor : null;
    }
  } catch {
    // Diretório apontando pra fora do bloco.
  }
  return null;
}

function exifSoComOrientacao(orientacao: number): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // o diretório começa logo depois do cabeçalho
  tiff.writeUInt16LE(1, 8); // uma entrada
  tiff.writeUInt16LE(ETIQUETA_DA_ORIENTACAO, 10);
  tiff.writeUInt16LE(3, 12); // tipo SHORT
  tiff.writeUInt32LE(1, 14); // um valor
  tiff.writeUInt16LE(orientacao, 18);
  // 20..21 completam os 4 bytes do valor; 22..25: não há outro diretório.
  const corpo = Buffer.concat([ROTULO_DO_EXIF, tiff]);
  const cabecalho = Buffer.alloc(4);
  cabecalho[0] = 0xff;
  cabecalho[1] = APP1;
  cabecalho.writeUInt16BE(corpo.length + 2, 2);
  return Buffer.concat([cabecalho, corpo]);
}

// ----------------------------------------------------------------- PNG

const ASSINATURA_DO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Exif, textos (onde programas gravam autor, local e programa) e a data.
const BLOCOS_DE_METADADOS_DO_PNG = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function pngSemMetadados(bytes: Buffer): Buffer {
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(ASSINATURA_DO_PNG)) {
    throw new ImagemInvalida("não começa como PNG");
  }
  const partes: Buffer[] = [bytes.subarray(0, 8)];
  let posicao = 8;
  let terminou = false;

  while (posicao < bytes.length) {
    if (posicao + 12 > bytes.length) throw new ImagemInvalida("PNG cortado");
    const tamanho = bytes.readUInt32BE(posicao);
    const nome = bytes.toString("latin1", posicao + 4, posicao + 8);
    // tamanho (4) + nome (4) + dados + conferência (4)
    const fim = posicao + 12 + tamanho;
    if (fim > bytes.length) throw new ImagemInvalida("bloco do PNG com tamanho errado");

    if (!BLOCOS_DE_METADADOS_DO_PNG.has(nome)) partes.push(bytes.subarray(posicao, fim));
    posicao = fim;
    if (nome === "IEND") {
      terminou = true;
      break;
    }
  }
  if (!terminou) throw new ImagemInvalida("PNG sem fim");
  return Buffer.concat(partes);
}

// ---------------------------------------------------------------- WebP

const BLOCOS_DE_METADADOS_DO_WEBP = new Set(["EXIF", "XMP "]);
// Os avisos do cabeçalho estendido de que o arquivo leva Exif e XMP.
const AVISO_DE_EXIF = 0x08;
const AVISO_DE_XMP = 0x04;

function webpSemMetadados(bytes: Buffer): Buffer {
  if (
    bytes.length < 12 ||
    bytes.toString("latin1", 0, 4) !== "RIFF" ||
    bytes.toString("latin1", 8, 12) !== "WEBP"
  ) {
    throw new ImagemInvalida("não começa como WebP");
  }
  // O tamanho declarado conta do byte 8 em diante. O que passa dele é
  // sobra, e sai.
  const fimDeclarado = 8 + bytes.readUInt32LE(4);
  if (fimDeclarado > bytes.length || fimDeclarado < 12) throw new ImagemInvalida("WebP com tamanho errado");

  const partes: Buffer[] = [];
  let posicao = 12;
  while (posicao < fimDeclarado) {
    if (posicao + 8 > fimDeclarado) throw new ImagemInvalida("WebP cortado");
    const nome = bytes.toString("latin1", posicao, posicao + 4);
    const tamanho = bytes.readUInt32LE(posicao + 4);
    // Bloco de tamanho ímpar leva um byte de enchimento.
    const fim = posicao + 8 + tamanho + (tamanho % 2);
    if (fim > fimDeclarado + 1) throw new ImagemInvalida("bloco do WebP com tamanho errado");
    const bloco = bytes.subarray(posicao, Math.min(fim, bytes.length));

    if (nome === "VP8X" && tamanho >= 1) {
      // Cópia: o aviso muda, e o arquivo de quem chamou não.
      const semAvisos = Buffer.from(bloco);
      semAvisos[8] = semAvisos[8]! & ~(AVISO_DE_EXIF | AVISO_DE_XMP);
      partes.push(semAvisos);
    } else if (!BLOCOS_DE_METADADOS_DO_WEBP.has(nome)) {
      partes.push(bloco);
    }
    posicao = fim;
  }
  if (partes.length === 0) throw new ImagemInvalida("WebP sem imagem");

  const corpo = Buffer.concat(partes);
  const cabecalho = Buffer.alloc(12);
  cabecalho.write("RIFF", 0, "latin1");
  cabecalho.writeUInt32LE(corpo.length + 4, 4);
  cabecalho.write("WEBP", 8, "latin1");
  return Buffer.concat([cabecalho, corpo]);
}
