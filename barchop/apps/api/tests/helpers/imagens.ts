// Imagens sintéticas pros testes: não desenham nada, mas têm os blocos
// no lugar certo, que é o que a API confere (lib/metadados-de-imagem.ts).
// Antes bastavam os primeiros bytes de cada formato; desde 15/11 a API lê
// os blocos pra tirar os metadados e recusa arquivo fora do formato.

// ---------------------------------------------------------------- JPEG

function bloco(marcador: number, corpo: Buffer): Buffer {
  const cabecalho = Buffer.alloc(4);
  cabecalho[0] = 0xff;
  cabecalho[1] = marcador;
  cabecalho.writeUInt16BE(corpo.length + 2, 2);
  return Buffer.concat([cabecalho, corpo]);
}

const JFIF = bloco(0xe0, Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0", "latin1"));
const TABELA = bloco(0xdb, Buffer.alloc(65, 1));
// O cabeçalho do trecho e os dados dele, com um escape (FF00) e um
// reinício (FFD0) no meio, como num JPEG de verdade.
const DADOS = Buffer.concat([
  bloco(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
  Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a]),
]);
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

export function jpeg(extras: Buffer[] = [], sobra: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([SOI, JFIF, ...extras, TABELA, DADOS, EOI, sobra]);
}

// Um Exif com orientação e um endereço de GPS em texto (o que não pode
// sobrar). `orientacao` 6 = foto tirada com o celular em pé.
export function exif(orientacao = 6, segredo = "GPS -23.5505,-46.6333"): Buffer {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "latin1");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientacao, 18);
  return bloco(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff, Buffer.from(segredo, "latin1")]));
}

export function comentario(texto: string): Buffer {
  return bloco(0xfe, Buffer.from(texto, "latin1"));
}

export function blocoDoJpeg(marcador: number, texto: string): Buffer {
  return bloco(marcador, Buffer.from(texto, "latin1"));
}

// ----------------------------------------------------------------- PNG

const ASSINATURA_DO_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function blocoDoPng(nome: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length, 0);
  // A conferência (CRC) não é validada pela API: quatro bytes quaisquer.
  return Buffer.concat([tamanho, Buffer.from(nome, "latin1"), dados, Buffer.alloc(4, 9)]);
}

export function png(extras: Buffer[] = [], sobra: Buffer = Buffer.alloc(0)): Buffer {
  return Buffer.concat([
    ASSINATURA_DO_PNG,
    blocoDoPng("IHDR", Buffer.alloc(13, 1)),
    ...extras,
    blocoDoPng("IDAT", Buffer.alloc(32, 2)),
    blocoDoPng("IEND", Buffer.alloc(0)),
    sobra,
  ]);
}

// ---------------------------------------------------------------- WebP

export function blocoDoWebp(nome: string, dados: Buffer): Buffer {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32LE(dados.length, 0);
  const enchimento = dados.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([Buffer.from(nome, "latin1"), tamanho, dados, enchimento]);
}

export function webp(blocos: Buffer[] = [blocoDoWebp("VP8 ", Buffer.alloc(32, 3))], sobra: Buffer = Buffer.alloc(0)): Buffer {
  const corpo = Buffer.concat(blocos);
  const cabecalho = Buffer.alloc(12);
  cabecalho.write("RIFF", 0, "latin1");
  cabecalho.writeUInt32LE(corpo.length + 4, 4);
  cabecalho.write("WEBP", 8, "latin1");
  return Buffer.concat([cabecalho, corpo, sobra]);
}
