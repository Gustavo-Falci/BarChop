import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, type Prisma } from "@barchop/database";

// O código de verificação que vai pro telefone (cliente) ou pro e-mail
// (barbeiro) e volta pra provar posse do destino — no primeiro acesso e
// na recuperação de senha.
//
// Pro cliente, primeiro acesso e esqueci a senha são a mesma coisa —
// provar o telefone e definir a senha —, então são uma finalidade só.
// O convite do membro da equipe é outra: vale mais tempo, e por isso
// não pode servir de redefinição de senha (nem o contrário). O cadastro
// do dono é outra ainda: prova o e-mail antes de a conta existir.
export type Finalidade =
  | "senha_cliente"
  | "senha_barbeiro"
  | "convite_profissional"
  | "cadastro_dono";

export interface AlvoDoCodigo {
  finalidade: Finalidade;
  // Já normalizado (telefone ou e-mail): é o mesmo valor que a busca usa,
  // senão "(11) 99999-8888" e "11999998888" seriam dois alvos.
  destino: string;
  // Nulo no barbeiro, cujo e-mail é único na plataforma.
  barbeariaId: string | null;
}

export const VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000;

// O convite espera o convidado abrir o e-mail — o dono convida na
// segunda, o profissional olha no fim de semana. Continua seguro pelo
// mesmo teto de tentativas, e só o dono emite um novo.
export const VALIDADE_DO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

function validade(finalidade: Finalidade): number {
  return finalidade === "convite_profissional" ? VALIDADE_DO_CONVITE_MS : VALIDADE_DO_CODIGO_MS;
}

// Seis dígitos são um milhão de combinações: com 5 tentativas por código
// e um código novo custando um envio (que tem limite próprio por
// destino), adivinhar deixa de ser viável.
export const MAX_TENTATIVAS = 5;

// HMAC com o segredo do servidor, e não scrypt como a senha: o código
// vive dez minutos e tem só um milhão de valores, então o que protege é
// o segredo — sem ele, o hash vazado num backup não se testa offline. E
// é rápido, o que importa numa rota que qualquer um chama.
function hashDoCodigo(codigo: string): string {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) throw new Error("JWT_SECRET não definido");
  return createHmac("sha256", segredo).update(codigo).digest("hex");
}

function confere(codigo: string, hash: string): boolean {
  const calculado = Buffer.from(hashDoCodigo(codigo), "hex");
  const guardado = Buffer.from(hash, "hex");
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

function ondeEstaOAlvo(alvo: AlvoDoCodigo) {
  return {
    finalidade: alvo.finalidade,
    destino: alvo.destino,
    barbeariaId: alvo.barbeariaId,
  };
}

// Gera, guarda o hash e devolve o código em texto — que só existe na
// memória até o canal de mensagem o entregar.
//
// Invalida os anteriores do mesmo alvo: senão cada reenvio somaria mais
// um código válido no ar, e mais MAX_TENTATIVAS chances pra quem chuta.
export async function emitirCodigo(
  alvo: AlvoDoCodigo,
  agora: Date = new Date()
): Promise<string> {
  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await prisma.$transaction([
    prisma.codigoVerificacao.updateMany({
      where: { ...ondeEstaOAlvo(alvo), usadoEm: null },
      data: { usadoEm: agora },
    }),
    prisma.codigoVerificacao.create({
      data: {
        ...ondeEstaOAlvo(alvo),
        codigoHash: hashDoCodigo(codigo),
        expiraEm: new Date(agora.getTime() + validade(alvo.finalidade)),
      },
    }),
  ]);

  return codigo;
}

// true uma vez só por código. Errar gasta tentativa; vencido, esgotado
// ou já usado é sempre false — quem chama não precisa (e não deve)
// distinguir os casos pra quem está do outro lado.
//
// `db` deixa consumir dentro da transação de quem cria algo com o
// código (o signup): se a criação falha, o código volta a valer. Quem
// passa a transação NÃO pode lançar quando o código não confere — o
// rollback desfaria a tentativa gasta, e o código se chutaria sem fim.
export async function consumirCodigo(
  alvo: AlvoDoCodigo,
  codigo: string,
  agora: Date = new Date(),
  db: Prisma.TransactionClient = prisma
): Promise<boolean> {
  const ativo = await db.codigoVerificacao.findFirst({
    where: {
      ...ondeEstaOAlvo(alvo),
      usadoEm: null,
      expiraEm: { gt: agora },
      tentativas: { lt: MAX_TENTATIVAS },
    },
    orderBy: { criadoEm: "desc" },
  });
  if (!ativo) return false;

  if (!confere(codigo, ativo.codigoHash)) {
    // Predicado no próprio update: duas tentativas erradas simultâneas
    // não podem, as duas, ler 4 e gravar 5.
    await db.codigoVerificacao.updateMany({
      where: { id: ativo.id, tentativas: { lt: MAX_TENTATIVAS } },
      data: { tentativas: { increment: 1 } },
    });
    return false;
  }

  // Marcar usado com `usadoEm: null` no predicado é o que decide a
  // corrida entre dois consumos do mesmo código: só um update encontra a
  // linha ainda livre.
  const marcado = await db.codigoVerificacao.updateMany({
    where: { id: ativo.id, usadoEm: null },
    data: { usadoEm: agora },
  });
  return marcado.count === 1;
}
