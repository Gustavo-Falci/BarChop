import { TelefoneInvalido } from "./erros";

// A coluna é VARCHAR e o par [barbeariaId, telefone] é único, então o
// Postgres compara caractere a caractere: sem normalizar,
// "11999998888", "(11) 99999-8888" e "+55 11 99999-8888" viram três
// clientes distintos da mesma pessoa na mesma barbearia. Isso furava a
// proteção do signup ("só define senha quem ainda não tem"), porque
// bastava reformatar o número pra ganhar outro cadastro reivindicável.
//
// Mesma função na gravação e na busca — igual ao normalizarEmail. Se só
// uma das pontas normalizar, ninguém acha o que a outra guardou. Agora
// vale também pras telas, que escrevem no mesmo campo.
const FORMATO_GUARDADO = "(AA) NNNNN-NNNN";

// 55 na frente de 12 ou 13 dígitos é o código do país, e sai. Em 10
// dígitos ele é DDD de verdade (Santa Maria, RS) e fica — por isso a
// checagem olha o comprimento, não só o prefixo.
function semCodigoDoPais(digitos: string): string {
  return (digitos.length === 12 || digitos.length === 13) &&
    digitos.startsWith("55")
    ? digitos.slice(2)
    : digitos;
}

export function normalizarTelefone(
  telefone: string | null | undefined
): string | null {
  if (!telefone) return null;

  const semPais = semCodigoDoPais(telefone.replace(/\D/g, ""));
  const ddd = semPais.slice(0, 2);
  const assinante = semPais.slice(2);

  // 9 dígitos é celular, 8 é fixo. Qualquer outra contagem não vira
  // `${FORMATO_GUARDADO}`, e gravar assim mesmo daria à chave única um
  // valor que nenhuma outra ponta consegue reproduzir.
  if (assinante.length !== 9 && assinante.length !== 8) {
    throw new TelefoneInvalido(
      `o telefone ${telefone} não tem DDD e número no formato brasileiro`
    );
  }

  const corte = assinante.length - 4;
  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

// Onde o schema já exige o campo, o `null` acima é inalcançável. Este
// wrapper torna isso um fato de tipo, em vez de um `!` no chamador com
// a prova escondida num comentário.
export function normalizarTelefoneObrigatorio(telefone: string): string {
  const normalizado = normalizarTelefone(telefone);

  if (!normalizado) {
    throw new TelefoneInvalido("o telefone é obrigatório");
  }

  return normalizado;
}

// Chamada a cada tecla digitada, e por isso nunca lança: um erro no
// meio da digitação apagaria o que a pessoa está escrevendo. Quem
// recusa é o normalizarTelefone, no envio.
export function formatarTelefoneParcial(valor: string): string {
  const digitos = semCodigoDoPais(valor.replace(/\D/g, "")).slice(0, 11);

  if (digitos.length === 0) return "";
  if (digitos.length === 1) return `(${digitos}`;
  if (digitos.length === 2) return `(${digitos})`;

  const ddd = digitos.slice(0, 2);
  const assinante = digitos.slice(2);

  // Onde cai o traço depende de o número ser fixo (8 dígitos, 4+4) ou
  // celular (9, 5+4), e no meio da digitação não dá pra saber qual dos
  // dois está sendo digitado. A regra: até 5 dígitos não há traço,
  // porque nenhum dos dois formatos tem traço aí; com exatamente 8 o
  // número é um fixo completo e ganha 4+4; qualquer outra contagem é
  // tratada como celular, que é a esmagadora maioria do que os clientes
  // digitam. O efeito colateral é um fixo pela metade aparecer como
  // "(11) 33334-44" até o oitavo dígito — transitório, e o alternativo
  // seria assumir fixo e piscar o traço no celular, que é o caso comum.
  if (assinante.length <= 5) return `(${ddd}) ${assinante}`;

  const corte = assinante.length === 8 ? 4 : 5;
  return `(${ddd}) ${assinante.slice(0, corte)}-${assinante.slice(corte)}`;
}

// Só os dígitos, pra comparar com o que o barbeiro digitou na busca. A
// coluna guarda pontuação, então procurar "999998888" cru nunca casaria
// com "(11) 99999-8888" — é preciso tirar a pontuação dos dois lados.
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}
