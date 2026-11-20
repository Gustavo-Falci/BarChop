// Nomes escritos por terceiros dentro dos e-mails do domínio (auditoria
// de 15/11, SEC-012).
//
// O nome da barbearia, do serviço, do plano e do cliente é texto livre de
// quem cadastra, e vários e-mails vão pra endereços que ninguém provou (o
// código de acesso, o lembrete, o convite). Sem limpeza, bastava chamar a
// barbearia de "Seu banco: confirme em https://…" e pedir códigos pros
// e-mails das vítimas: a isca chegava assinada pelo BarChop.
//
// Duas regras, e as duas valem pra todo e-mail com nome de terceiro:
//   - o ASSUNTO é fixo, escrito aqui no código, sem nome nenhum;
//   - no CORPO o nome passa por `nomeParaEmail`, que não deixa sobrar
//     nada que um leitor de e-mail transforme em link.

const TAMANHO_MAXIMO = 60;

// "palavra.palavra": o que o leitor de e-mail liga sozinho, mesmo sem
// http. Exige letra depois do ponto, e duas — "Barbearia 2.0" e "Cia."
// não entram.
const PARECE_DOMINIO = /[\p{L}\p{N}]\.\p{L}{2,}/u;

function limparPedaco(pedaco: string): string {
  // Endereço web ou de e-mail: sai inteiro. Não há pedaço dele que
  // valha ficar num nome.
  if (/:\/\//.test(pedaco) || /^www\./i.test(pedaco) || pedaco.includes("@")) return "";
  // "Dr.Barba" e "banco.com/x" caem aqui: o ponto e a barra viram
  // espaço. O nome honesto continua legível; o endereço deixa de ser um.
  if (PARECE_DOMINIO.test(pedaco)) return pedaco.replace(/[./]+/g, " ");
  return pedaco;
}

// `reserva`: o que entra no lugar quando não sobra nada (o nome era só
// um endereço). Melhor um texto neutro que um buraco na frase.
export function nomeParaEmail(nome: string, reserva = "a barbearia"): string {
  const limpo = nome
    // Quebra de linha e caractere de controle viram espaço: o nome ocupa
    // um lugar numa frase, não abre parágrafo nem cabeçalho.
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
    .replace(/[<>]/g, "")
    .split(/\s+/)
    .map(limparPedaco)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TAMANHO_MAXIMO)
    .trim();
  return limpo || reserva;
}

// O primeiro nome de alguém, já limpo, pro "Olá, Fulano!".
export function primeiroNomeParaEmail(nome: string): string {
  return nomeParaEmail(nome, "tudo bem").split(" ")[0]!;
}
