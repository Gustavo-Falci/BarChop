// Antes de enviar a imagem: reduz o lado maior pra no máximo `ladoMaximo`
// e regrava em JPEG. Três motivos, todos do celular: a foto de 4 a 8 MB
// cai pra algumas centenas de KB (abaixo do teto da API e rápida no 4G);
// regravar pelo canvas descarta os metadados EXIF, inclusive o GPS —
// a foto do profissional tirada em casa publicaria onde ele mora; e um
// HEIC que o navegador consegue abrir sai como JPEG, que a API aceita.
//
// Se o navegador não conseguir abrir o arquivo, devolve o original: a API
// recusa com 422 o que não for imagem, e a tela mostra o aviso.
export async function redimensionarImagem(arquivo: Blob, ladoMaximo = 1600): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    return arquivo;
  }

  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const contexto = canvas.getContext("2d");
  if (!contexto) return arquivo;
  contexto.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const regravado = await new Promise<Blob | null>((pronto) =>
    canvas.toBlob(pronto, "image/jpeg", 0.85)
  );
  return regravado ?? arquivo;
}
