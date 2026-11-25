import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { indiceDaUnica, mensagemDoBanco, sqlstate } from "../../src/lib/erro-do-banco";
import { criarBarbeariaComToken } from "../helpers/barbearia";
import { prepararAgenda } from "../helpers/agenda";

// Os erros saem do banco de verdade, e não montados à mão: o formato é o
// do Prisma 7 com o driver adapter, e é ele que este módulo precisa ler.
async function erroDe(operacao: () => Promise<unknown>): Promise<unknown> {
  try {
    await operacao();
  } catch (erro) {
    return erro;
  }
  throw new Error("a operação devia ter falhado");
}

describe("erro-do-banco", () => {
  it("lê o SQLSTATE e a mensagem da violação da sem_conflito_horario", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const linha = {
      barbeariaId: agenda.barbeariaId,
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      data: new Date(Date.UTC(2026, 8, 10)),
      horaInicio: new Date(Date.UTC(1970, 0, 1, 10, 0)),
      horaFim: new Date(Date.UTC(1970, 0, 1, 10, 45)),
    };
    await prisma.agendamento.create({ data: linha });

    const erro = await erroDe(() => prisma.agendamento.create({ data: linha }));

    expect(sqlstate(erro)).toBe("23P01");
    expect(mensagemDoBanco(erro)).toContain("sem_conflito_horario");
    await app.close();
  });

  it("lê o índice que a unique violou", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    const erro = await erroDe(() =>
      prisma.barbearia.update({ where: { id: dois.barbeariaId }, data: { slug: um.slug } })
    );

    expect(sqlstate(erro)).toBe("23505");
    expect(indiceDaUnica(erro)).toContain("slug");
    await app.close();
  });

  it("lê o SQLSTATE de um id que não é UUID", async () => {
    const erro = await erroDe(() => prisma.servico.findUniqueOrThrow({ where: { id: "nao-e-uuid" } }));

    expect(sqlstate(erro)).toBe("22P02");
  });

  it("não inventa nada pra erro que não veio do banco", () => {
    const erro = new Error("outra coisa");

    expect(sqlstate(erro)).toBeUndefined();
    expect(mensagemDoBanco(erro)).toBeUndefined();
    expect(indiceDaUnica(erro)).toBeUndefined();
    expect(sqlstate("texto")).toBeUndefined();
  });
});
