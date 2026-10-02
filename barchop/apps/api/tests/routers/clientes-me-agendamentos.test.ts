import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// A fase 4 é quem cria agendamento por HTTP. Aqui o registro é semeado
// direto no banco, com as datas passando por lib/horas.ts — o mesmo
// caminho que a rota usa.
async function semear(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  data: string;
}) {
  const servico = await prisma.servico.create({
    data: {
      barbeariaId: params.barbeariaId,
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    },
  });

  return prisma.agendamento.create({
    data: {
      barbeariaId: params.barbeariaId,
      barbeiroId: params.barbeiroId,
      clienteId: params.clienteId,
      data: dataParaDate(params.data),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      servicos: {
        create: [
          { servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 45 },
        ],
      },
    },
  });
}

describe("GET /clientes/me/agendamentos", () => {
  it("devolve os agendamentos do cliente, com os serviços", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-09-10" });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamentos).toHaveLength(1);
    expect(resposta.json().agendamentos[0]).toMatchObject({
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
    });
    expect(resposta.json().agendamentos[0].servicos[0]).toMatchObject({
      nome: "Corte",
      precoNoMomento: "45.00",
    });
  });

  it("não devolve agendamento de outro cliente", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const meu = await criarClienteComToken(app, slug, "11999998888");
    const outro = await criarClienteComToken(app, slug, "11888887777");
    await semear({
      barbeariaId,
      barbeiroId,
      clienteId: outro.clienteId,
      data: "2026-09-10",
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos",
      headers: auth(meu.token),
    });

    expect(resposta.json().agendamentos).toEqual([]);
  });

  it("filtra por intervalo com de e ate", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-09-10" });
    await semear({ barbeariaId, barbeiroId, clienteId, data: "2026-10-20" });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos?de=2026-10-01&ate=2026-10-31",
      headers: auth(token),
    });

    expect(resposta.json().agendamentos).toHaveLength(1);
    expect(resposta.json().agendamentos[0].data).toBe("2026-10-20");
  });

  it("400 em data com forma errada (barra no schema)", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos?de=10-2026",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(400);
  });

  // Este caso é diferente do de cima: "2026-02-31" tem a forma
  // "YYYY-MM-DD" e passa pelo PADRAO_DATA do schema — quem barra é o
  // dataDoFiltro, no try/catch que traduz o RangeError do dataParaDate
  // em ErroDeNegocio. Sem esse try/catch a resposta seria 500. Por isso
  // a asserção olha o código do erro, não só a faixa do status: um 4xx
  // genérico também passaria se a requisição estivesse caindo na barra
  // do schema em vez de aqui.
  it("422 em data que não existe no calendário", async () => {
    const app = buildApp();
    const { slug } = await criarBarbeariaComToken(app);
    const { token } = await criarClienteComToken(app, slug);

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos?de=2026-02-31",
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("data_invalida");
  });
});
