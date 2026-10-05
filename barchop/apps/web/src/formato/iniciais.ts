// Preposição não vira letra: "Barbearia do Zé" é BZ, não BD.
const PREPOSICOES = new Set(["da", "de", "do", "das", "dos", "e"]);

// O monograma de quem não tem imagem — a barbearia sem capa, o membro
// sem foto. Até duas letras: a primeira e a última palavra que contam.
// Palavra que não começa com letra ou número ("@", "&") não conta.
export function iniciais(nome: string): string {
  const palavras = nome
    .trim()
    .split(/\s+/)
    .filter((palavra) => /^[\p{L}\p{N}]/u.test(palavra))
    .filter((palavra) => !PREPOSICOES.has(palavra.toLowerCase()));
  if (palavras.length === 0) return "";
  const primeira = palavras[0]!.charAt(0);
  if (palavras.length === 1) return primeira.toUpperCase();
  return (primeira + palavras[palavras.length - 1]!.charAt(0)).toUpperCase();
}
