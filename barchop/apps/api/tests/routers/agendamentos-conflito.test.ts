import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";
import type { App } from "../../src/tipos";

async function prepararAgenda(app: App) {
  const barbearia = await criarBarbeariaComToken(app, "um");

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

  return { ...barbearia, servico };
}

function corpoPublico(
  agenda: Awaited<ReturnType<typeof prepararAgenda>>,
  extra = {}
) {
  return {
    barbeiroId: agenda.barbeiroId,
    servicoIds: [agenda.servico.id],
    data: QUINTA,
    horaInicio: "10:00",
    cliente: { nome: "João", telefone: "11999998888" },
    ...extra,
  };
}

const URL_PUBLICA = "/barbearias/barbearia-um/agendamentos";

describe("conflito de horário", () => {
  it("recusa sobreposição com 422 pelo caminho normal", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    const sobreposto = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda, {
        horaInicio: "10:30",
        cliente: { nome: "Maria", telefone: "11922222222" },
      }),
    });

    // 422 e não 409: a checagem por calcularHorariosDisponiveis pega
    // antes de chegar no banco, e é ela que dá a mensagem que a tela
    // mostra. A trava do banco é a rede embaixo — ver o teste da
    // corrida.
    expect(sobreposto.statusCode).toBe(422);
    expect(sobreposto.json().erro).toBe("horario_indisponivel");
    expect(await prisma.agendamento.count()).toBe(1);

    await app.close();
  });

  it("aceita o horário encostado, porque o intervalo é meio-aberto", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // 10:00–10:45 e 10:45–11:30: o tsrange da coluna `periodo` é '[)',
    // então o fim de um e o começo do outro não colidem.
    const encostado = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda, {
        horaInicio: "10:45",
        cliente: { nome: "Maria", telefone: "11922222222" },
      }),
    });

    expect(encostado.statusCode).toBe(201);
    expect(await prisma.agendamento.count()).toBe(2);

    await app.close();
  });

  it("libera o horário quando o agendamento é cancelado", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const primeiro = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // Cancelado direto no banco: a rota PATCH tem teste próprio na Task
    // 8, e aqui o que importa é o estado, não o caminho.
    await prisma.agendamento.update({
      where: { id: primeiro.json().id },
      data: { status: "cancelado" },
    });

    const segundo = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // A constraint é parcial (`WHERE status <> 'cancelado'`) e o cálculo
    // ignora cancelados: as duas regras concordam.
    expect(segundo.statusCode).toBe(201);

    await app.close();
  });

  it("em dois pedidos simultâneos, exatamente um agenda", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    // `fileParallelism: false` no vitest.config.mts serializa ARQUIVOS,
    // não promessas dentro de um caso — este Promise.all dispara os dois
    // pedidos de verdade.
    const [uma, outra] = await Promise.all([
      app.inject({
        method: "POST",
        url: URL_PUBLICA,
        payload: corpoPublico(agenda, {
          cliente: { nome: "João", telefone: "11911111111" },
        }),
      }),
      app.inject({
        method: "POST",
        url: URL_PUBLICA,
        payload: corpoPublico(agenda, {
          cliente: { nome: "Maria", telefone: "11922222222" },
        }),
      }),
    ]);

    const status = [uma.statusCode, outra.statusCode].sort();
    const recusada = uma.statusCode === 201 ? outra : uma;

    // O invariante que importa, e o único determinístico aqui: nunca
    // saem dois agendamentos no mesmo horário.
    expect(status[0]).toBe(201);
    expect(await prisma.agendamento.count()).toBe(1);

    // Qual das duas defesas recusou o perdedor depende de quem leu
    // antes de quem commitou — as duas respostas são corretas. Contra um
    // Postgres local, o mais comum é o pedido de trás já enxergar o da
    // frente e parar no 422; o 409 é a trava do banco pegando o que
    // escapou da checagem. O teste logo abaixo prova a trava sob
    // concorrência real, sem depender desse tempo.
    expect([409, 422]).toContain(recusada.statusCode);
    expect(["horario_ocupado", "horario_indisponivel"]).toContain(
      recusada.json().erro
    );
    // Seja qual for o caminho, a mensagem crua do Postgres — com o
    // caminho do arquivo e o horário alheio — não sai na resposta.
    expect(recusada.body).not.toContain("23P01");
    expect(recusada.body).not.toContain("ConnectorError");

    await app.close();
  });

  it("a trava do banco recusa um dos dois inserts concorrentes", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const cliente = await prisma.cliente.create({
      data: {
        barbeariaId: agenda.barbeariaId,
        nome: "João",
        telefone: "11933333333",
      },
    });

    const linha = {
      barbeariaId: agenda.barbeariaId,
      barbeiroId: agenda.barbeiroId,
      clienteId: cliente.id,
      data: new Date(Date.UTC(2026, 8, 10)),
      horaInicio: new Date(Date.UTC(1970, 0, 1, 10, 0)),
      horaFim: new Date(Date.UTC(1970, 0, 1, 10, 45)),
    };

    // Sem passar pela checagem de disponibilidade: as duas transações
    // leem antes de qualquer uma commitar, que é exatamente a janela que
    // a aplicação sozinha não fecha. É aqui que a EXCLUDE USING gist
    // prova que existe — e este caso não depende de tempo, porque
    // nenhuma das duas consegue ver a outra antes do commit.
    const resultados = await Promise.allSettled([
      prisma.$transaction(async (tx) => {
        await tx.agendamento.findMany({ where: { barbeiroId: agenda.barbeiroId } });
        return tx.agendamento.create({ data: linha });
      }),
      prisma.$transaction(async (tx) => {
        await tx.agendamento.findMany({ where: { barbeiroId: agenda.barbeiroId } });
        return tx.agendamento.create({ data: linha });
      }),
    ]);

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.agendamento.count()).toBe(1);

    const recusado = resultados.find((r) => r.status === "rejected");
    const erro = (recusado as PromiseRejectedResult).reason as Error;

    // O Postgres resolve isto de duas formas, e qual delas sai depende
    // de tempo — medido: em ~1 de cada 6 rodadas sai a segunda.
    //
    // 23P01: uma transação chegou primeiro, a outra bateu na
    // `sem_conflito_horario`. É o caminho que o tratador de erros
    // traduz em 409.
    //
    // 40P01: impasse. Cada transação gravou a própria tupla antes de a
    // constraint conferir a outra, e aí cada uma ficou esperando a
    // transação da outra; o Postgres mata uma das duas. É por causa
    // deste caminho que as rotas de criação repetem a transação uma vez
    // (`comRetryDeDeadlock`) — sem isso ele viraria 500.
    const violouAExclusao =
      erro.message.includes("23P01") &&
      erro.message.includes("sem_conflito_horario");
    const deuImpasse = erro.message.includes("40P01");

    expect(violouAExclusao || deuImpasse).toBe(true);

    await app.close();
  });

  it("grava a hora no fuso certo nas colunas do agendamento", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const criado = await app.inject({
      method: "POST",
      url: URL_PUBLICA,
      payload: corpoPublico(agenda),
    });

    // A coluna `periodo` é gerada de `data + hora_inicio`. Um erro de
    // fuso aqui corromperia a trava de conflito junto, em silêncio: o
    // banco travaria 13:00 enquanto a API mostra 10:00.
    const linhas = await prisma.$queryRaw<
      { dia: string; inicio: string; fim: string; periodo: string }[]
    >`
      SELECT to_char(data, 'YYYY-MM-DD') AS dia,
             to_char(hora_inicio, 'HH24:MI') AS inicio,
             to_char(hora_fim, 'HH24:MI') AS fim,
             periodo::text AS periodo
      FROM agendamento
      WHERE id = ${criado.json().id}::uuid
    `;

    expect(linhas[0].dia).toBe(QUINTA);
    expect(linhas[0].inicio).toBe("10:00");
    expect(linhas[0].fim).toBe("10:45");
    expect(linhas[0].periodo).toContain(`${QUINTA} 10:00:00`);

    await app.close();
  });
});
