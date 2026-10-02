import { normalizarEmail } from "@barchop/formato";

// Os limites abaixo ESPELHAM o schema de apps/api/src/routers/clientes.ts
// (`corpoNovoCliente` e `corpoPatchCliente`) e o PADRAO_EMAIL de
// apps/api/src/lib/padroes.ts. Mesmo motivo que levou CadastroDeServico
// a duplicar os dele: o que a guarda da tela deixa passar volta como 400
// de schema, com uma frase de ajv ("must NOT have fewer than 2
// characters") que o barbeiro não tem como agir. Mexer no schema da API
// sem mexer aqui reabre o buraco em silêncio — nada liga os dois
// arquivos além deste comentário.
//
// Mora em src/formato/ e não dentro da tela porque o cadastro e o
// detalhe do cliente validam os mesmos três campos, e porque uma função
// exportada pode ser testada direto: o dublê da API aceita o que a API
// recusa, então um teste que só passa pela tela passaria com a guarda
// errada.
export const NOME_MIN = 2;
export const NOME_MAX = 120;
export const EMAIL_MAX = 160;

// Cópia literal do PADRAO_EMAIL da API. Deliberadamente frouxo: a tela
// não é o lugar de decidir que endereço existe, só de barrar o que a
// API recusaria sem explicar.
const PADRAO_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Um resultado, e não `T | null`: com null a tela teria uma mensagem só
// por campo, e "vazio" e "longo demais" precisam dizer coisas
// diferentes. Mesma forma do Validado de CadastroDeServico.
export type Validado<T> = { valor: T } | { erro: string };

export function validarNomeDeCliente(digitado: string): Validado<string> {
  const limpo = digitado.trim();
  if (limpo.length < NOME_MIN) return { erro: "Escreva o nome do cliente." };
  if (limpo.length > NOME_MAX)
    return { erro: `No máximo ${NOME_MAX} caracteres.` };
  return { valor: limpo };
}

// O e-mail é opcional: vazio vira null, que é o que a API espera pra
// "não tem". Só o que foi digitado é conferido.
//
// O normalizarEmail no fim é a MESMA função que a API roda na gravação
// (routers/clientes.ts): sem ela a tela mandaria "Ana@Exemplo.com" e o
// banco guardaria "ana@exemplo.com", e quem comparasse o que digitou com
// o que voltou veria duas coisas diferentes.
export function validarEmailDeCliente(digitado: string): Validado<string | null> {
  const limpo = digitado.trim();
  if (!limpo) return { valor: null };
  if (limpo.length > EMAIL_MAX)
    return { erro: `No máximo ${EMAIL_MAX} caracteres.` };
  if (!PADRAO_EMAIL.test(limpo))
    return { erro: "Use um endereço como ana@exemplo.com" };
  return { valor: normalizarEmail(limpo) };
}
