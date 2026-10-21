import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import type { FilaDeMemoria } from "../../src/lib/fila";
import { dataParaDate } from "../../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA, quintaPassada } from "../helpers/datas";

// Arrastar e reordenar, PR 5: o painel remarca (POST
// /agendamentos/:id/remarcar). Mesmo esqueleto do remarcar do cliente —
// cancela o antigo e cria o novo na mesma transação —, com as regras do
// painel (grade livre, sem antecedência) e as de quem pode o quê. O
// cliente é avisado por e-mail, se tiver um e se a tela não desmarcar.

async function cenario({ email }: { email?: string } = { email: "joao@exemplo.com" }) {
  const app = buildApp();
  const agenda = await prepararAgenda(app, { email });
  const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  return { app, agenda, agendamento };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

function remarcar(c: Cenario, corpo: Record<string, unknown>, { token = c.agenda.token, id = c.agendamento.id } = {}) {
  return c.app.inject({
    method: "POST",
    url: `/agendamentos/${id}/remarcar`,
    headers: auth(token),
    payload: corpo,
  });
}

function emailsPara(c: Cenario, para: string) {
  return (c.app.canal as CanalDeMemoria).enviadas.filter((mensagem) => mensagem.para === para);
}

describe("POST /agendamentos/:id/remarcar", () => {
  it("move pro horário novo: o antigo cancela, o novo herda serviços e cliente", async () => {
    const c = await cenario();

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00" });

    expect(resposta.statusCode).toBe(201);
    const novo = resposta.json();
    expect(novo).toMatchObject({ data: QUINTA, horaInicio: "14:00", status: "confirmado" });
    expect(novo.cliente.id).toBe(c.agenda.cliente.id);
    expect(novo.servicos.map((s: { id: string }) => s.id)).toEqual([c.agenda.servico.id]);
    const antigo = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(antigo.status).toBe("cancelado");
  });

  it("avisa o cliente por e-mail com o horário de antes e o de agora", async () => {
    const c = await cenario();

    await remarcar(c, { data: QUINTA, horaInicio: "14:00" });

    const [aviso] = emailsPara(c, "joao@exemplo.com");
    expect(aviso).toBeDefined();
    expect(aviso!.assunto).toMatch(/horário mudou/i);
    expect(aviso!.texto).toContain("10:00");
    expect(aviso!.texto).toContain("14:00");
  });

  it("com avisarCliente: false, não manda e-mail", async () => {
    const c = await cenario();

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00", avisarCliente: false });

    expect(resposta.statusCode).toBe(201);
    expect(emailsPara(c, "joao@exemplo.com")).toHaveLength(0);
  });

  it("pra um horário que sobrepõe o próprio (10:00 → 10:15), dá certo", async () => {
    const c = await cenario();

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "10:15" });

    expect(resposta.statusCode).toBe(201);
  });

  it("horário ocupado por outro: 409, e o antigo fica de pé", async () => {
    const c = await cenario();
    await marcarPeloPainel(c.app, c.agenda, { data: QUINTA, horaInicio: "14:00" });

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00" });

    expect(resposta.statusCode).toBe(409);
    const antigo = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(antigo.status).toBe("confirmado");
  });

  it("pra um dia que já passou: 422 horario_passado", async () => {
    const c = await cenario();

    const resposta = await remarcar(c, { data: quintaPassada(), horaInicio: "10:00" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("horario_passado");
  });

  it("clique duplo: só um agendamento novo", async () => {
    const c = await cenario();

    const [a, b] = await Promise.all([
      remarcar(c, { data: QUINTA, horaInicio: "14:00" }),
      remarcar(c, { data: QUINTA, horaInicio: "15:00" }),
    ]);

    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 422]);
    const ativos = await prisma.agendamento.count({
      where: { barbeariaId: c.agenda.barbeariaId, status: { in: ["pendente", "confirmado"] } },
    });
    expect(ativos).toBe(1);
  });

  it("o dono pode passar pra outro profissional", async () => {
    const c = await cenario();
    const parceiro = await criarMembroComToken(c.app, c.agenda.barbeariaId, "profissional", "parceiro");

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00", barbeiroId: parceiro.barbeiroId });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().barbeiro.id).toBe(parceiro.barbeiroId);
  });

  it("o profissional não vê o agendamento do colega: 404", async () => {
    const c = await cenario();
    const parceiro = await criarMembroComToken(c.app, c.agenda.barbeariaId, "profissional", "parceiro");

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00" }, { token: parceiro.token });

    expect(resposta.statusCode).toBe(404);
  });

  it("o profissional remarca o próprio, mas não passa pra outro: 403", async () => {
    const c = await cenario();
    const parceiro = await criarMembroComToken(c.app, c.agenda.barbeariaId, "profissional", "parceiro");
    const doParceiro = await prisma.agendamento.create({
      data: {
        barbeariaId: c.agenda.barbeariaId,
        barbeiroId: parceiro.barbeiroId,
        clienteId: c.agenda.cliente.id,
        data: dataParaDate(QUINTA),
        horaInicio: new Date("1970-01-01T16:00:00Z"),
        horaFim: new Date("1970-01-01T16:45:00Z"),
        status: "confirmado",
        origem: "barbeiro",
        servicos: { create: [{ servicoId: c.agenda.servico.id, precoNoMomento: "45.00", duracaoNoMomento: 45 }] },
      },
    });

    const outro = await remarcar(
      c,
      { data: QUINTA, horaInicio: "17:00", barbeiroId: c.agenda.barbeiroId },
      { token: parceiro.token, id: doParceiro.id }
    );
    const proprio = await remarcar(c, { data: QUINTA, horaInicio: "17:00" }, { token: parceiro.token, id: doParceiro.id });

    expect(outro.statusCode).toBe(403);
    expect(proprio.statusCode).toBe(201);
  });

  it("atendimento com pagamento registrado: 409 com_pagamento", async () => {
    const c = await cenario();
    const pago = await c.app.inject({
      method: "PUT",
      url: `/agendamentos/${c.agendamento.id}/pagamento`,
      headers: auth(c.agenda.token),
      payload: { forma: "pix" },
    });
    expect(pago.statusCode).toBeLessThan(300);

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("com_pagamento");
  });

  it("o lembrete do novo entra na fila", async () => {
    const c = await cenario();

    const resposta = await remarcar(c, { data: QUINTA, horaInicio: "14:00" });

    const pendentes = (c.app.fila as FilaDeMemoria).pendentes;
    expect(pendentes.some((trabalho) => trabalho.chave === `lembrete:${resposta.json().id}`)).toBe(true);
  });
});
