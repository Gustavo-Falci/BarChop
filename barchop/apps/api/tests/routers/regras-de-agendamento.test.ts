import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import {
  ANTECEDENCIAS_MINUTOS,
  INTERVALOS_MINUTOS,
  JANELAS_DIAS,
  PRAZOS_HORAS,
} from "@barchop/formato";
import { buildApp } from "../../src/app";
import { assinarTokenDoLembrete, instanteNaBarbearia } from "../../src/lib/lembrete";
import type { App } from "../../src/tipos";
import { marcarPeloPainel, prepararAgenda, type Agenda } from "../helpers/agenda";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// Regras de agendamento (painel v2, marco 3, 3e): o dono decide como o
// cliente marca pelo link. Valem só pro cliente — o painel encaixa
// livre —, e os padrões reproduzem o comportamento de antes.
//
// As regras de "hoje" (mesmo dia, antecedência, prazos) dependem do
// relógio. Em vez de fixar o relógio do processo (mexeria nos timeouts
// do pool do Postgres), só o `agoraNaBarbearia` sem argumento vira um
// relógio de teste: "agora" é a QUINTA futura às 10:00. A versão com
// instante (a conversão do lembrete) segue a original.
const relogio = vi.hoisted(() => ({ agora: null as { data: string; hora: string } | null }));

vi.mock("../../src/lib/horas", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/lib/horas")>();
  return {
    ...original,
    agoraNaBarbearia: (instante?: Date) =>
      instante || !relogio.agora ? original.agoraNaBarbearia(instante) : relogio.agora,
  };
});

beforeEach(() => {
  relogio.agora = { data: QUINTA, hora: "10:00" };
});

function somarDias(data: string, dias: number): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

// Sexta logo depois da QUINTA: dia aberto, e "amanhã" pro relógio.
const SEXTA = somarDias(QUINTA, 1);

type Regras = Partial<{
  intervaloMinutos: number;
  antecedenciaMinutos: number;
  aceitaMesmoDia: boolean;
  janelaDias: number | null;
  cabeAntesDeFechar: boolean;
  prazoRemarcarHoras: number;
  prazoCancelarHoras: number;
}>;

async function definirRegras(agenda: Agenda, regras: Regras) {
  await prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: regras });
}

function urlDoDia(agenda: Agenda, data: string) {
  const params = new URLSearchParams({ data, barbeiroId: agenda.barbeiroId });
  params.append("servicoIds", agenda.servico.id);
  return `/barbearias/${agenda.slug}/disponibilidade?${params}`;
}

async function horariosDoDia(
  app: App,
  agenda: Agenda,
  data: string,
  headers: Record<string, string> = {}
): Promise<string[]> {
  const resposta = await app.inject({ method: "GET", url: urlDoDia(agenda, data), headers });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().horarios;
}

async function diasDoMes(app: App, agenda: Agenda, mes: string): Promise<Record<string, boolean>> {
  const params = new URLSearchParams({ mes, barbeiroId: agenda.barbeiroId });
  params.append("servicoIds", agenda.servico.id);
  const resposta = await app.inject({
    method: "GET",
    url: `/barbearias/${agenda.slug}/disponibilidade/mes?${params}`,
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().dias;
}

async function proximos(app: App, agenda: Agenda) {
  const resposta = await app.inject({
    method: "GET",
    url: `/barbearias/${agenda.slug}/proximos-horarios`,
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json().servicos[0].horarios as { data: string; horaInicio: string }[];
}

function agendarPeloLink(
  app: App,
  agenda: Agenda,
  { data, horaInicio, barbeiro = true }: { data: string; horaInicio: string; barbeiro?: boolean }
) {
  return app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    payload: {
      ...(barbeiro ? { barbeiroId: agenda.barbeiroId } : {}),
      servicoIds: [agenda.servico.id],
      data,
      horaInicio,
      cliente: { nome: "Maria", telefone: "11977776666" },
    },
  });
}

function agendarPeloPainel(app: App, agenda: Agenda, { data, horaInicio }: { data: string; horaInicio: string }) {
  return app.inject({
    method: "POST",
    url: "/agendamentos",
    headers: auth(agenda.token),
    payload: {
      barbeiroId: agenda.barbeiroId,
      clienteId: agenda.cliente.id,
      servicoIds: [agenda.servico.id],
      data,
      horaInicio,
    },
  });
}

describe("as regras na barbearia", () => {
  const PADROES = {
    intervaloMinutos: 15,
    antecedenciaMinutos: 0,
    aceitaMesmoDia: true,
    janelaDias: null,
    cabeAntesDeFechar: true,
    prazoRemarcarHoras: 0,
    prazoCancelarHoras: 0,
  };

  it("barbearia nova nasce com os padrões, no painel e na página pública", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);

    const painel = await app.inject({ method: "GET", url: "/barbearias/me", headers: auth(barbearia.token) });
    const publica = await app.inject({ method: "GET", url: `/barbearias/${barbearia.slug}` });

    expect(painel.json()).toMatchObject(PADROES);
    expect(publica.json()).toMatchObject(PADROES);
    await app.close();
  });

  it("o PATCH do dono grava as sete e as duas leituras devolvem", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    const regras = {
      intervaloMinutos: 30,
      antecedenciaMinutos: 120,
      aceitaMesmoDia: false,
      janelaDias: 30,
      cabeAntesDeFechar: false,
      prazoRemarcarHoras: 12,
      prazoCancelarHoras: 24,
    };

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(barbearia.token),
      payload: regras,
    });
    const publica = await app.inject({ method: "GET", url: `/barbearias/${barbearia.slug}` });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject(regras);
    expect(publica.json()).toMatchObject(regras);
    await app.close();
  });

  it("janela null volta a ser sem limite", async () => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);
    const patch = (janelaDias: number | null) =>
      app.inject({ method: "PATCH", url: "/barbearias/me", headers: auth(barbearia.token), payload: { janelaDias } });

    await patch(14);
    const resposta = await patch(null);

    expect(resposta.json().janelaDias).toBeNull();
    await app.close();
  });

  it.each([
    ["intervaloMinutos", 20],
    ["antecedenciaMinutos", 45],
    ["aceitaMesmoDia", "sim"],
    ["janelaDias", 10],
    ["cabeAntesDeFechar", 1],
    ["prazoRemarcarHoras", 3],
    ["prazoCancelarHoras", -1],
  ])("%s fora das opções dá 400", async (campo, valor) => {
    const app = buildApp();
    const barbearia = await criarBarbeariaComToken(app);

    const resposta = await app.inject({
      method: "PATCH",
      url: "/barbearias/me",
      headers: auth(barbearia.token),
      payload: { [campo]: valor },
    });

    expect(resposta.statusCode).toBe(400);
    await app.close();
  });

  it("o banco aceita toda opção do código, e nada fora dela", async () => {
    // As listas moram no @barchop/formato e o CHECK na migration: este
    // teste é o que impede os dois de divergirem.
    const app = buildApp();
    const { barbeariaId } = await criarBarbeariaComToken(app);
    const gravar = (data: Regras) => prisma.barbearia.update({ where: { id: barbeariaId }, data });

    for (const intervaloMinutos of INTERVALOS_MINUTOS) await gravar({ intervaloMinutos });
    for (const antecedenciaMinutos of ANTECEDENCIAS_MINUTOS) await gravar({ antecedenciaMinutos });
    for (const janelaDias of [...JANELAS_DIAS, null]) await gravar({ janelaDias });
    for (const horas of PRAZOS_HORAS) await gravar({ prazoRemarcarHoras: horas, prazoCancelarHoras: horas });

    await expect(gravar({ intervaloMinutos: 20 })).rejects.toThrow();
    await expect(gravar({ antecedenciaMinutos: 45 })).rejects.toThrow();
    await expect(gravar({ janelaDias: 10 })).rejects.toThrow();
    await expect(gravar({ prazoRemarcarHoras: 3 })).rejects.toThrow();
    await expect(gravar({ prazoCancelarHoras: 5 })).rejects.toThrow();
    await app.close();
  });
});

describe("o que o link oferece", () => {
  it("com os padrões, nada muda: grade de 15, termina até fechar, hoje depois de agora", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const hoje = await horariosDoDia(app, agenda, QUINTA);

    expect(hoje[0]).toBe("10:15");
    expect(hoje[hoje.length - 1]).toBe("17:15");
    await app.close();
  });

  it("grade de 30: dia, próximos e o POST seguem a mesma grade", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { intervaloMinutos: 30 });

    const amanha = await horariosDoDia(app, agenda, SEXTA);
    const primeiros = await proximos(app, agenda);
    const foraDaGrade = await agendarPeloLink(app, agenda, { data: SEXTA, horaInicio: "09:15" });
    const qualquerUm = await agendarPeloLink(app, agenda, { data: SEXTA, horaInicio: "09:15", barbeiro: false });
    const naGrade = await agendarPeloLink(app, agenda, { data: SEXTA, horaInicio: "09:30" });

    expect(amanha.slice(0, 3)).toEqual(["09:00", "09:30", "10:00"]);
    expect(primeiros).toEqual([
      { data: QUINTA, horaInicio: "10:30" },
      { data: QUINTA, horaInicio: "11:00" },
      { data: QUINTA, horaInicio: "11:30" },
    ]);
    expect(foraDaGrade.statusCode).toBe(422);
    expect(foraDaGrade.json().erro).toBe("horario_indisponivel");
    expect(qualquerUm.json().erro).toBe("horario_indisponivel");
    expect(naGrade.statusCode).toBe(201);
    await app.close();
  });

  it("sem precisar caber antes de fechar, o último começa antes do fechamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { cabeAntesDeFechar: false });

    const amanha = await horariosDoDia(app, agenda, SEXTA);
    const marcado = await agendarPeloLink(app, agenda, { data: SEXTA, horaInicio: "17:45" });

    expect(amanha[amanha.length - 1]).toBe("17:45");
    expect(marcado.statusCode).toBe(201);
    await app.close();
  });

  it("sem marcar no mesmo dia: hoje some do dia, do mês e dos próximos, e o POST recusa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { aceitaMesmoDia: false });

    const hoje = await horariosDoDia(app, agenda, QUINTA);
    const mes = await diasDoMes(app, agenda, QUINTA.slice(0, 7));
    const primeiros = await proximos(app, agenda);
    const recusado = await agendarPeloLink(app, agenda, { data: QUINTA, horaInicio: "15:00" });

    expect(hoje).toEqual([]);
    expect(mes[QUINTA]).toBe(false);
    expect(primeiros[0]).toEqual({ data: SEXTA, horaInicio: "09:00" });
    expect(recusado.statusCode).toBe(422);
    expect(recusado.json().erro).toBe("mesmo_dia_fechado");
    await app.close();
  });

  it("antecedência de 2 horas: o primeiro horário de hoje é agora + 2h, e o POST recusa antes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { antecedenciaMinutos: 120 });

    const hoje = await horariosDoDia(app, agenda, QUINTA);
    const primeiros = await proximos(app, agenda);
    const cedo = await agendarPeloLink(app, agenda, { data: QUINTA, horaInicio: "11:45" });
    const noLimite = await agendarPeloLink(app, agenda, { data: QUINTA, horaInicio: "12:00" });

    expect(hoje[0]).toBe("12:00");
    expect(primeiros[0]).toEqual({ data: QUINTA, horaInicio: "12:00" });
    expect(cedo.statusCode).toBe(422);
    expect(cedo.json().erro).toBe("fora_da_antecedencia");
    expect(noLimite.statusCode).toBe(201);
    await app.close();
  });

  it("janela de 7 dias: o oitavo dia some do dia e do mês, e o POST recusa", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { janelaDias: 7 });
    // QUINTA + 7 é quinta (aberta); + 8 é sexta (aberta, mas fora).
    const dentro = somarDias(QUINTA, 7);
    const fora = somarDias(QUINTA, 8);

    const ultimoDia = await horariosDoDia(app, agenda, dentro);
    const depois = await horariosDoDia(app, agenda, fora);
    const mes = await diasDoMes(app, agenda, fora.slice(0, 7));
    const recusado = await agendarPeloLink(app, agenda, { data: fora, horaInicio: "10:00" });

    expect(ultimoDia.length).toBeGreaterThan(0);
    expect(depois).toEqual([]);
    expect(mes[fora]).toBe(false);
    expect(recusado.statusCode).toBe(422);
    expect(recusado.json().erro).toBe("fora_da_janela");
    await app.close();
  });
});

describe("o painel encaixa livre", () => {
  it("com o token de membro da barbearia, a disponibilidade sai sem as regras do cliente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { aceitaMesmoDia: false, intervaloMinutos: 60 });

    const hoje = await horariosDoDia(app, agenda, QUINTA, auth(agenda.token));

    expect(hoje.slice(0, 2)).toEqual(["10:15", "10:30"]);
    await app.close();
  });

  it("o painel nunca vê menos que o cliente: sem caber antes de fechar vale pros dois", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { cabeAntesDeFechar: false });

    const amanha = await horariosDoDia(app, agenda, SEXTA, auth(agenda.token));

    expect(amanha[amanha.length - 1]).toBe("17:45");
    await app.close();
  });

  it("token de outra barbearia ou token inválido não desliga nada, e não dá 401", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const outra = await criarBarbeariaComToken(app, "dois");
    await definirRegras(agenda, { aceitaMesmoDia: false });

    const deOutra = await horariosDoDia(app, agenda, QUINTA, auth(outra.token));
    const invalido = await horariosDoDia(app, agenda, QUINTA, auth("lixo"));

    expect(deOutra).toEqual([]);
    expect(invalido).toEqual([]);
    await app.close();
  });

  it("o POST do painel não passa pelas regras do cliente", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await definirRegras(agenda, { aceitaMesmoDia: false, antecedenciaMinutos: 240, intervaloMinutos: 60 });

    const resposta = await agendarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:15" });

    expect(resposta.statusCode).toBe(201);
    await app.close();
  });
});

describe("o cliente remarca e cancela dentro do prazo", () => {
  // Agendamento às 13:00 de hoje: faltam 3 horas.
  async function cenario(regras: Regras) {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "13:00" });
    await definirRegras(agenda, regras);
    const cliente = await criarClienteComToken(app, agenda.slug, agenda.telefone);
    await app.ready();
    const lembrete = assinarTokenDoLembrete(app, {
      agendamentoId: agendamento.id,
      expiraEm: instanteNaBarbearia(QUINTA, "13:00"),
    });
    return { app, agenda, agendamento, cliente, lembrete };
  }

  function cancelar(app: App, token: string, id: string) {
    return app.inject({ method: "POST", url: `/clientes/me/agendamentos/${id}/cancelar`, headers: auth(token) });
  }

  function remarcar(app: App, token: string, id: string, data: string, horaInicio: string) {
    return app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${id}/remarcar`,
      headers: auth(token),
      payload: { data, horaInicio },
    });
  }

  it("prazo de cancelar passado: a conta e o link do lembrete recusam", async () => {
    const { app, agendamento, cliente, lembrete } = await cenario({ prazoCancelarHoras: 6 });

    const pelaConta = await cancelar(app, cliente.token, agendamento.id);
    const peloLembrete = await app.inject({ method: "POST", url: `/lembretes/${lembrete}/cancelar` });

    expect(pelaConta.statusCode).toBe(422);
    expect(pelaConta.json().erro).toBe("prazo_de_cancelar");
    expect(peloLembrete.statusCode).toBe(422);
    expect(peloLembrete.json().erro).toBe("prazo_de_cancelar");
    await app.close();
  });

  it("dentro do prazo de cancelar, cancela", async () => {
    const { app, agendamento, cliente } = await cenario({ prazoCancelarHoras: 2 });

    const resposta = await cancelar(app, cliente.token, agendamento.id);

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it("prazo de remarcar passado recusa o remarcar e deixa o cancelar em paz", async () => {
    const { app, agendamento, cliente } = await cenario({ prazoRemarcarHoras: 6 });

    const remarcado = await remarcar(app, cliente.token, agendamento.id, SEXTA, "10:00");
    const cancelado = await cancelar(app, cliente.token, agendamento.id);

    expect(remarcado.statusCode).toBe(422);
    expect(remarcado.json().erro).toBe("prazo_de_remarcar");
    expect(cancelado.statusCode).toBe(200);
    await app.close();
  });

  it("o destino do remarcar obedece as regras de marcar", async () => {
    const { app, agendamento, cliente } = await cenario({ aceitaMesmoDia: false });

    const resposta = await remarcar(app, cliente.token, agendamento.id, QUINTA, "15:00");

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("mesmo_dia_fechado");
    await app.close();
  });

  it("confirmar presença pelo lembrete não tem prazo", async () => {
    const { app, lembrete } = await cenario({ prazoCancelarHoras: 48, prazoRemarcarHoras: 48 });

    const resposta = await app.inject({ method: "POST", url: `/lembretes/${lembrete}/confirmar` });

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });

  it("o painel cancela fora do prazo do cliente", async () => {
    const { app, agenda, agendamento } = await cenario({ prazoCancelarHoras: 48 });

    const resposta = await app.inject({
      method: "PATCH",
      url: `/agendamentos/${agendamento.id}`,
      headers: auth(agenda.token),
      payload: { status: "cancelado" },
    });

    expect(resposta.statusCode).toBe(200);
    await app.close();
  });
});
