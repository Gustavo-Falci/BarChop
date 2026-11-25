import { prisma } from "@barchop/database";
import { chaveDeCifra, cifrar, decifrar } from "./cifra";

// O CPF do cliente, guardado cifrado (auditoria de 15/11, SEC-009). Em
// claro ele ia junto em todo backup do banco; cifrado com a
// CHAVE_DE_CIFRA — a mesma das chaves de pagamento —, quem lê só o banco
// não lê CPF nenhum.
//
// Duas colunas enquanto durar a passagem: `cpfCifrado` (a que vale) e
// `cpf` (em claro, de antes de 15/11). Todo CPF novo vai cifrado; os
// antigos a faxina diária converte. Quando não sobrar nenhum em claro,
// a coluna antiga sai numa migration.

interface CpfGuardado {
  cpf: string | null;
  cpfCifrado: Uint8Array | null;
}

// O CPF de um cadastro, venha da coluna que vier.
export function lerCpf(cliente: CpfGuardado): string | null {
  if (cliente.cpfCifrado) return decifrar(cliente.cpfCifrado, chaveDeCifra());
  return cliente.cpf;
}

// O `data` de um update: cifrado na coluna nova, e a antiga limpa.
export function cpfParaGravar(cpf: string): { cpf: null; cpfCifrado: Buffer<ArrayBuffer> } {
  return { cpf: null, cpfCifrado: cifrar(cpf, chaveDeCifra()) };
}

// A passagem dos antigos. Um de cada vez, com o claro no WHERE: se uma
// assinatura gravar o CPF do mesmo cliente no meio, o update daqui não
// acha mais a linha e não pisa no dado novo. Rodar de novo não faz mal.
export async function cifrarCpfsEmClaro(): Promise<number> {
  const emClaro = await prisma.cliente.findMany({
    where: { cpf: { not: null } },
    select: { id: true, cpf: true },
    take: 1000,
  });
  // Sem nada a fazer, a chave nem é lida: em desenvolvimento ela pode
  // não existir, e a faxina não tem por que reclamar disso toda noite.
  if (emClaro.length === 0) return 0;

  let cifrados = 0;
  for (const { id, cpf } of emClaro) {
    const { count } = await prisma.cliente.updateMany({
      where: { id, cpf },
      data: cpfParaGravar(cpf!),
    });
    cifrados += count;
  }
  return cifrados;
}
