import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria } from "../../src/lib/canal";
import { agoraNaBarbearia, dataParaDate, horaParaDate } from "../../src/lib/horas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";
import { auth, criarMembroComToken } from "../helpers/barbearia";
import { QUINTA, quintaPassada } from "../helpers/datas";

// Mudar os serviços de um agendamento (pedido do dono, 22/11/2026):
// GET /agendamentos/:id/servicos/previa e PUT /agendamentos/:id/servicos.
// O corpo é a lista final. Cabe: o fim anda. Não cabe: sem a marca
// `aceitaSemTempo`, 409 com a prévia; com ela, o fim estica até o
// próximo compromisso e o agendamento vira encaixe.
//
// Cenário: aberta 09:00–18:00, Corte de 45 min (R$ 45,00) às 10:00 com
// e-mail, e outro atendimento às 11:00. Entre os dois sobram 15 min:
// Sobrancelha (10 min) cabe, Barba (20 min) não.

async function cenario({ email = "joao@exemplo.com" }: { email?: string } = {}) {
  const app = buildApp();
  const agenda = await prepararAgenda(app, { email });
  const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
  await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "11:00" });
  const barba = await criarServico(app, agenda.token, { nome: "Barba", duracaoMinutos: 20, preco: "25.00" });
  const sobrancelha = await criarServico(app, agenda.token, { nome: "Sobrancelha", duracaoMinutos: 10, preco: "15.00" });
  return { app, agenda, agendamento, barba, sobrancelha, corte: agenda.servico as { id: string } };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

async function criarServico(
  app: Cenario["app"],
  token: string,
  payload: { nome: string; duracaoMinutos: number; preco: string }
): Promise<{ id: string }> {
  const resposta = await app.inject({ method: "POST", url: "/servicos", headers: auth(token), payload });
  if (resposta.statusCode !== 201) throw new Error(`serviço falhou: ${resposta.statusCode} ${resposta.body}`);
  return resposta.json();
}

function mudar(
  c: Cenario,
  corpo: Record<string, unknown>,
  { token = c.agenda.token, id = c.agendamento.id }: { token?: string; id?: string } = {}
) {
  return c.app.inject({
    method: "PUT",
    url: `/agendamentos/${id}/servicos`,
    headers: auth(token),
    payload: corpo,
  });
}

function previa(c: Cenario, servicoIds: string[], { token = c.agenda.token, id = c.agendamento.id } = {}) {
  const query = servicoIds.map((servicoId) => `servicoIds=${servicoId}`).join("&");
  return c.app.inject({
    method: "GET",
    url: `/agendamentos/${id}/servicos/previa?${query}`,
    headers: auth(token),
  });
}

function emailsPara(c: Cenario, para: string) {
  return (c.app.canal as CanalDeMemoria).enviadas.filter((mensagem) => mensagem.para === para);
}

async function linha(id: string) {
  return prisma.agendamento.findUniqueOrThrow({
    where: { id },
    include: { servicos: { include: { servico: { select: { nome: true } } } } },
  });
}

// Direto no banco: as rotas de criar recusam o passado, e estes testes
// precisam de um agendamento que já começou ou que já passou.
async function criarDireto(c: Cenario, data: string, horaInicio: string, horaFim: string) {
  return prisma.agendamento.create({
    data: {
      barbeariaId: c.agenda.barbeariaId,
      barbeiroId: c.agenda.barbeiroId,
      clienteId: c.agenda.cliente.id,
      data: dataParaDate(data),
      horaInicio: horaParaDate(horaInicio),
      horaFim: horaParaDate(horaFim),
      status: "confirmado",
      origem: "barbeiro",
      servicos: { create: [{ servicoId: c.corte.id, precoNoMomento: "45.00", duracaoNoMomento: 45 }] },
    },
  });
}

describe("GET /agendamentos/:id/servicos/previa", () => {
  it("cabe: diz o previsto, onde termina e o total novo", async () => {
    const c = await cenario();

    const resposta = await previa(c, [c.corte.id, c.sobrancelha.id]);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      cabe: true,
      previstoMinutos: 55,
      terminaPrevisto: "10:55",
      horaFim: "10:55",
      limite: "11:00",
      encaixe: false,
      totalAntes: "45.00",
      totalDepois: "60.00",
    });
    expect(resposta.json().entram.map((s: { nome: string }) => s.nome)).toEqual(["Sobrancelha"]);
    expect(resposta.json().saem).toEqual([]);
  });

  it("não cabe: diz até onde tem tempo e com quem bate", async () => {
    const c = await cenario();

    const resposta = await previa(c, [c.corte.id, c.barba.id]);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({
      cabe: false,
      previstoMinutos: 65,
      terminaPrevisto: "11:05",
      horaFim: "11:00",
      limite: "11:00",
      encaixe: true,
      proximo: { tipo: "atendimento", cliente: "João da Silva", horaInicio: "11:00" },
    });
  });

  it("um serviço só na query: tirar volta pra soma dos que ficam", async () => {
    const c = await cenario();
    await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    const resposta = await previa(c, [c.corte.id]);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ cabe: true, previstoMinutos: 45, horaFim: "10:45", totalDepois: "45.00" });
    expect(resposta.json().saem.map((s: { nome: string }) => s.nome)).toEqual(["Sobrancelha"]);
  });

  it("não grava nada", async () => {
    const c = await cenario();

    await previa(c, [c.corte.id, c.barba.id]);

    const depois = await linha(c.agendamento.id);
    expect(depois.servicos).toHaveLength(1);
  });
});

describe("PUT /agendamentos/:id/servicos", () => {
  it("adicionar o que cabe: o fim anda e o serviço entra com o preço de hoje", async () => {
    const c = await cenario();

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ horaInicio: "10:00", horaFim: "10:55" });
    const depois = await linha(c.agendamento.id);
    expect(depois.servicos.map((s) => s.servico.nome).sort()).toEqual(["Corte", "Sobrancelha"]);
    const sobrancelha = depois.servicos.find((s) => s.servicoId === c.sobrancelha.id)!;
    expect(sobrancelha.precoNoMomento.toFixed(2)).toBe("15.00");
    expect(sobrancelha.duracaoNoMomento).toBe(10);
  });

  it("não cabe e sem a marca: 409 sem_tempo com a prévia, e nada muda", async () => {
    const c = await cenario();

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.barba.id] });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("sem_tempo");
    expect(resposta.json().previa).toMatchObject({ cabe: false, previstoMinutos: 65, limite: "11:00" });
    const depois = await linha(c.agendamento.id);
    expect(depois.servicos).toHaveLength(1);
  });

  it("não cabe e com a marca: estica até o próximo e vira encaixe", async () => {
    const c = await cenario();

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ horaInicio: "10:00", horaFim: "11:00" });
    const depois = await linha(c.agendamento.id);
    const dosServicos = depois.servicos.reduce((soma, s) => soma + s.duracaoNoMomento, 0);
    expect(dosServicos).toBe(65);
  });

  it("tirar: o horário encurta pra soma dos que ficam", async () => {
    const c = await cenario();
    await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    const resposta = await mudar(c, { servicoIds: [c.corte.id] });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horaFim).toBe("10:45");
  });

  it("tirar de um encaixe: fica a menor das duas durações", async () => {
    const c = await cenario();
    await mudar(c, { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true });

    const soBarba = await mudar(c, { servicoIds: [c.barba.id] });

    expect(soBarba.statusCode).toBe(200);
    expect(soBarba.json().horaFim).toBe("10:20");
  });

  it("tirar e adicionar juntos", async () => {
    const c = await cenario();

    const resposta = await mudar(c, { servicoIds: [c.sobrancelha.id, c.barba.id] });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().horaFim).toBe("10:30");
  });

  it("o que fica mantém o preço combinado, mesmo com o preço novo do serviço", async () => {
    const c = await cenario();
    await prisma.servico.update({ where: { id: c.corte.id }, data: { preco: "60.00" } });

    await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    const depois = await linha(c.agendamento.id);
    expect(depois.servicos.find((s) => s.servicoId === c.corte.id)!.precoNoMomento.toFixed(2)).toBe("45.00");
  });

  it("o que fica pode estar inativo hoje; o novo não", async () => {
    const c = await cenario();
    await prisma.servico.update({ where: { id: c.corte.id }, data: { ativo: false } });
    await prisma.servico.update({ where: { id: c.barba.id }, data: { ativo: false } });

    const comCorte = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });
    const comBarba = await mudar(c, { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true });

    expect(comCorte.statusCode).toBe(200);
    expect(comBarba.statusCode).toBe(422);
    expect(comBarba.json().erro).toBe("servico_inativo");
  });

  it("serviço novo que o profissional não faz: 422", async () => {
    const c = await cenario();
    await prisma.profissionalServico.delete({
      where: { barbeiroId_servicoId: { barbeiroId: c.agenda.barbeiroId, servicoId: c.sobrancelha.id } },
    });

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_fora_do_profissional");
  });

  it("serviço de outra barbearia: 422 servico_invalido", async () => {
    const c = await cenario();
    const outra = await prepararAgenda(c.app, { sufixo: "outra" });

    const resposta = await mudar(c, { servicoIds: [c.corte.id, outra.servico.id] });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("servico_invalido");
  });

  it("serviço repetido ou lista vazia: 400", async () => {
    const c = await cenario();

    const repetido = await mudar(c, { servicoIds: [c.corte.id, c.corte.id] });
    const vazia = await mudar(c, { servicoIds: [] });

    expect(repetido.statusCode).toBe(400);
    expect(vazia.statusCode).toBe(400);
  });

  it("de hoje, já começado: muda (sem tempo, com a marca)", async () => {
    const c = await cenario();
    const hoje = agoraNaBarbearia().data;
    const agora = await criarDireto(c, hoje, "00:00", "00:45");

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true }, { id: agora.id });

    expect(resposta.statusCode).toBe(200);
  });

  it("de um dia que passou: 422 agendamento_passado", async () => {
    const c = await cenario();
    const passado = await criarDireto(c, quintaPassada(), "10:00", "10:45");

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }, { id: passado.id });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("agendamento_passado");
  });

  it("concluído sem pagamento: muda", async () => {
    const c = await cenario();
    await prisma.agendamento.update({ where: { id: c.agendamento.id }, data: { status: "concluido" } });

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(200);
  });

  it("cancelado ou falta: 422 status_nao_permite", async () => {
    const c = await cenario();
    await prisma.agendamento.update({ where: { id: c.agendamento.id }, data: { status: "cancelado" } });

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("status_nao_permite");
  });

  it("com pagamento no caixa: 409 com_pagamento", async () => {
    const c = await cenario();
    const pago = await c.app.inject({
      method: "PUT",
      url: `/agendamentos/${c.agendamento.id}/pagamento`,
      headers: auth(c.agenda.token),
      payload: { forma: "pix" },
    });
    expect(pago.statusCode).toBeLessThan(300);

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("com_pagamento");
  });

  it("dia fechado no caixa: 409 dia_fechado", async () => {
    const c = await cenario();
    await prisma.fechamentoDoDia.create({
      data: { barbeariaId: c.agenda.barbeariaId, data: dataParaDate(QUINTA), fechadoPorId: c.agenda.barbeiroId, acerto: {} },
    });

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("dia_fechado");
  });

  it("o profissional não vê o do colega: 404", async () => {
    const c = await cenario();
    const parceiro = await criarMembroComToken(c.app, c.agenda.barbeariaId, "profissional", "parceiro");

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }, { token: parceiro.token });

    expect(resposta.statusCode).toBe(404);
  });

  it("a recepção muda o de qualquer um", async () => {
    const c = await cenario();
    const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");

    const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }, { token: recepcao.token });

    expect(resposta.statusCode).toBe(200);
  });

  it("dois iguais ao mesmo tempo: o serviço entra uma vez só", async () => {
    const c = await cenario();

    const respostas = await Promise.all([
      mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }),
      mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }),
    ]);

    expect(respostas.map((r) => r.statusCode)).toEqual([200, 200]);
    const depois = await linha(c.agendamento.id);
    expect(depois.servicos).toHaveLength(2);
  });

  describe("e-mails", () => {
    it("o cliente recebe os serviços e o total, sem horário de término nem encaixe", async () => {
      const c = await cenario();

      await mudar(c, { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true });

      const [aviso] = emailsPara(c, "joao@exemplo.com");
      expect(aviso).toBeDefined();
      expect(aviso!.assunto).toBe("Os serviços do seu horário mudaram");
      expect(aviso!.texto).toContain("Entrou: Barba (R$ 25,00).");
      expect(aviso!.texto).toContain("Agora: Corte + Barba.");
      expect(aviso!.texto).toContain("Total: R$ 70,00.");
      expect(aviso!.texto).not.toMatch(/encaixe/i);
      expect(aviso!.texto).not.toContain("11:00");
    });

    it("tirar entra como Saiu", async () => {
      const c = await cenario();
      await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id], avisarCliente: false });

      await mudar(c, { servicoIds: [c.corte.id] });

      const [aviso] = emailsPara(c, "joao@exemplo.com");
      expect(aviso!.texto).toContain("Saiu: Sobrancelha (R$ 15,00).");
    });

    it("com avisarCliente: false, o cliente não recebe", async () => {
      const c = await cenario();

      await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id], avisarCliente: false });

      expect(emailsPara(c, "joao@exemplo.com")).toHaveLength(0);
    });

    it("quem atende mudou o próprio: o barbeiro não recebe", async () => {
      const c = await cenario();

      await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] });

      expect(emailsPara(c, "um@exemplo.com")).toHaveLength(0);
    });

    it("outro mudou: o barbeiro do atendimento recebe, com o horário e o encaixe", async () => {
      const c = await cenario();
      const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");

      await mudar(
        c,
        { servicoIds: [c.corte.id, c.barba.id], aceitaSemTempo: true, avisarCliente: false },
        { token: recepcao.token }
      );

      const [aviso] = emailsPara(c, "um@exemplo.com");
      expect(aviso).toBeDefined();
      expect(aviso!.assunto).toBe("Mudaram os serviços de um atendimento seu");
      expect(aviso!.texto).toContain("Membro balcao");
      expect(aviso!.texto).toContain("João da Silva");
      expect(aviso!.texto).toContain("Entrou: Barba (R$ 25,00).");
      expect(aviso!.texto).toContain("Na sua agenda: 10:00 – 11:00, como encaixe (os serviços têm 65 min).");
    });

    it("barbeiro sem e-mail no cadastro: nada", async () => {
      const c = await cenario();
      const recepcao = await criarMembroComToken(c.app, c.agenda.barbeariaId, "recepcao", "balcao");
      await prisma.barbeiro.update({ where: { id: c.agenda.barbeiroId }, data: { email: null } });

      const resposta = await mudar(c, { servicoIds: [c.corte.id, c.sobrancelha.id] }, { token: recepcao.token });

      expect(resposta.statusCode).toBe(200);
      expect(emailsPara(c, "um@exemplo.com")).toHaveLength(0);
    });
  });
});
