import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// Datas relativas ao dia de hoje, nunca fixas: "passado" e "futuro"
// precisam continuar significando isso daqui a um ano, e a alternativa
// (fixar o relógio com vi.setSystemTime) mexeria nos timeouts do pool
// do Postgres, que esta suíte usa de verdade.
//
// A margem de 30 dias é o que faz a diferença de fuso entre este UTC e o
// America/Sao_Paulo da API não importar: nenhuma das duas pontas chega
// perto de virar o dia.
function diaRelativo(dias: number): string {
  const dia = new Date();
  dia.setUTCDate(dia.getUTCDate() + dias);
  return dia.toISOString().slice(0, 10);
}

const FUTURO = diaRelativo(30);
const PASSADO = diaRelativo(-30);

async function semear(params: {
  barbeariaId: string;
  barbeiroId: string;
  clienteId: string;
  data: string;
  status?: "confirmado" | "concluido" | "cancelado";
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
      status: params.status ?? "confirmado",
      servicos: {
        create: [
          { servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 45 },
        ],
      },
    },
  });
}

describe("POST /clientes/me/agendamentos/:id/cancelar", () => {
  it("cancela um agendamento futuro", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: FUTURO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().agendamento.status).toBe("cancelado");
  });

  it("422 num agendamento que já passou", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: PASSADO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("agendamento_passado");
  });

  it("422 num agendamento já concluído", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const { token, clienteId } = await criarClienteComToken(app, slug);
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId,
      data: FUTURO,
      status: "concluido",
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("status_nao_permite");
  });

  it("404 no agendamento de outro cliente", async () => {
    const app = buildApp();
    const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
    const meu = await criarClienteComToken(app, slug, "11999998888");
    const outro = await criarClienteComToken(app, slug, "11888887777");
    const agendamento = await semear({
      barbeariaId,
      barbeiroId,
      clienteId: outro.clienteId,
      data: FUTURO,
    });

    const resposta = await app.inject({
      method: "POST",
      url: `/clientes/me/agendamentos/${agendamento.id}/cancelar`,
      headers: auth(meu.token),
    });

    // 404 e não 403: um 403 confirmaria que o id existe em algum lugar
    // da plataforma.
    expect(resposta.statusCode).toBe(404);
  });
});
