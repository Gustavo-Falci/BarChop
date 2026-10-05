import type { Prisma } from "@barchop/database";
import { conflito } from "./erro-http";

type ClientePrisma = Prisma.TransactionClient;

// O link da barbearia é único PRA SEMPRE (bloco F4, decisão do dono,
// 2026-10-04): o slug atual e os antigos de uma barbearia nunca vão pra
// outra — os links velhos já circularam no WhatsApp, no Instagram e nos
// e-mails de lembrete.
//
// Constraint não basta: são duas tabelas (barbearia.slug e
// slug_antigo). Sem trava, o suporte trocando o link da "um" (o antigo
// entra em slug_antigo) e alguém se cadastrando com esse mesmo nome
// leriam, cada um, o banco antes do commit do outro — e o nome ficaria
// das duas. Uma trava só, de chave fixa, em todo caminho que grava slug:
// troca é rara, então serializar não custa nada.
export async function travarSlugs(db: ClientePrisma): Promise<void> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('slugs-das-barbearias'))`;
}

// O slug é de outra barbearia, atual ou antigo? `barbeariaId` nulo no
// cadastro, quando ainda não existe barbearia nenhuma.
//
// Chamar depois de `travarSlugs`, na mesma transação.
export async function slugDeOutra(
  db: ClientePrisma,
  slug: string,
  barbeariaId: string | null
): Promise<boolean> {
  const outra = barbeariaId ? { not: barbeariaId } : undefined;
  const [atual, antigo] = await Promise.all([
    db.barbearia.count({ where: { slug, ...(outra ? { id: outra } : {}) } }),
    db.slugAntigo.count({ where: { slug, ...(outra ? { barbeariaId: outra } : {}) } }),
  ]);
  return atual + antigo > 0;
}

export async function garantirSlugLivre(
  db: ClientePrisma,
  slug: string,
  barbeariaId: string | null
): Promise<void> {
  await travarSlugs(db);
  if (await slugDeOutra(db, slug, barbeariaId)) {
    throw conflito("esse endereço já está em uso");
  }
}

// Troca o link de uma barbearia: o atual vai pra slug_antigo, e um
// antigo DELA pode voltar a ser o atual. Dentro da transação de quem
// chama (a aprovação do suporte marca a solicitação na mesma).
export async function trocarSlug(db: ClientePrisma, barbeariaId: string, novo: string) {
  await garantirSlugLivre(db, novo, barbeariaId);

  const atual = await db.barbearia.findUniqueOrThrow({ where: { id: barbeariaId } });
  if (atual.slug === novo) return atual;

  await db.slugAntigo.deleteMany({ where: { slug: novo, barbeariaId } });
  await db.slugAntigo.create({ data: { slug: atual.slug, barbeariaId } });
  return db.barbearia.update({ where: { id: barbeariaId }, data: { slug: novo } });
}
