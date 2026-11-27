import { prisma } from "@barchop/database";
import { agoraNaBarbearia, dataParaDate } from "../../src/lib/horas";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "./barbearia";

let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1198888${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

// Barbearia pronta pra agendar: aberta de segunda a sábado, 09:00–18:00,
// com um serviço "Corte" de 45 minutos e um cliente cadastrado pelo
// painel — com e-mail quando o teste pede, que é o que o lembrete usa.
export async function prepararAgenda(
  app: App,
  { sufixo = "um", email }: { sufixo?: string; email?: string } = {}
) {
  const barbearia = await criarBarbeariaComToken(app, sufixo);

  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });

  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();

  const telefone = proximoTelefone();
  const resposta = await app.inject({
    method: "POST",
    url: "/clientes",
    headers: auth(barbearia.token),
    payload: { nome: "João da Silva", telefone, ...(email ? { email } : {}) },
  });
  if (resposta.statusCode !== 201) {
    throw new Error(`cliente falhou no helper: ${resposta.statusCode} ${resposta.body}`);
  }

  return { ...barbearia, servico, cliente: resposta.json(), telefone };
}

export type Agenda = Awaited<ReturnType<typeof prepararAgenda>>;

// Marca pelo painel e devolve o agendamento criado.
export async function marcarPeloPainel(
  app: App,
  agenda: Agenda,
  { data, horaInicio }: { data: string; horaInicio: string }
) {
  const resposta = await app.inject({
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
  if (resposta.statusCode !== 201) {
    throw new Error(`agendamento falhou no helper: ${resposta.statusCode} ${resposta.body}`);
  }
  return resposta.json() as { id: string; data: string; horaInicio: string };
}

// A agenda cheia (PRD agenda-cheia): uma barbearia pequena de encher,
// aberta todo dia só das 9 às 10, com a janela de 7 dias. O Corte de
// 45 min do prepararAgenda cabe às 09:00 e às 09:15.
export const JANELA_CURTA = 7;

const UM_DIA = 24 * 60 * 60 * 1000;
const hora = (hhmm: string) => new Date(`1970-01-01T${hhmm}:00Z`);

// Os dias a partir de hoje (São Paulo). O padrão é a janela inteira, de
// hoje até hoje + JANELA_CURTA: o último ainda entra (regraQueRecusa só
// recusa depois dele).
export function diasDaJanela(quantos = JANELA_CURTA + 1): Date[] {
  const hoje = dataParaDate(agoraNaBarbearia().data);
  return Array.from({ length: quantos }, (_, i) => new Date(hoje.getTime() + i * UM_DIA));
}

export async function prepararJanelaCurta(app: App, opcoes: { sufixo?: string } = {}): Promise<Agenda> {
  const agenda = await prepararAgenda(app, opcoes);
  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(agenda.token),
    payload: {
      horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "10:00",
      })),
    },
  });
  await prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { janelaDias: JANELA_CURTA } });
  return agenda;
}

// Ocupa a hora inteira de cada dia (direto no banco, sem passar pelas
// regras do link). `exceto` deixa o fim de um dia livre (o atendimento
// acaba antes das 10); `dias` passa da janela, pra quando o teste anda
// o relógio.
export async function encher(
  agenda: Agenda,
  { exceto, dias = JANELA_CURTA + 1 }: { exceto?: { dia: Date; ate: string }; dias?: number } = {}
): Promise<{ id: string; data: Date }[]> {
  const criados: { id: string; data: Date }[] = [];
  for (const dia of diasDaJanela(dias)) {
    const fim = exceto && exceto.dia.getTime() === dia.getTime() ? exceto.ate : "10:00";
    criados.push(
      await prisma.agendamento.create({
        data: {
          barbeariaId: agenda.barbeariaId,
          barbeiroId: agenda.barbeiroId,
          clienteId: agenda.cliente.id,
          data: dia,
          horaInicio: hora("09:00"),
          horaFim: hora(fim),
          status: "confirmado",
          origem: "barbeiro",
        },
        select: { id: true, data: true },
      })
    );
  }
  return criados;
}
