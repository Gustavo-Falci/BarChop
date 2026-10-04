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
