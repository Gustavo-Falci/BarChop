import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { dataParaDate, horaParaDate, somarDias } from "../../src/lib/horas";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";
import { QUINTA } from "../helpers/datas";

// A marca "Corte pelo plano" nos horários marcados da Minha conta. É uma
// previsão: quem decide é o balcão, no pagamento (conferirOPlano). A
// rota marca o que o balcão vai aceitar: assinatura valendo, dia no
// ciclo, plano de barbeiro só com quem vende, e os usos do ciclo, dos
// horários mais cedo pros mais tarde.

async function cenario() {
  const app = buildApp();
  const { slug, barbeariaId, barbeiroId } = await criarBarbeariaComToken(app);
  const { token, clienteId } = await criarClienteComToken(app, slug);
  const rafael = await criarMembroComToken(app, barbeariaId, "profissional", "rafael");
  const servico = (nome: string) =>
    prisma.servico.create({ data: { barbeariaId, nome, duracaoMinutos: 30, preco: "40.00" } });
  const corte = await servico("Corte");
  const barba = await servico("Barba");
  return { app, token, barbeariaId, barbeiroId, clienteId, rafael, corte, barba };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

// O ciclo em volta da QUINTA dos testes, que é sempre no futuro.
async function assinar(
  c: Cenario,
  plano: { vendedorId?: string; servicos: { servicoId: string; usosPorCiclo: number | null }[] },
  situacao = "ativa"
) {
  const criado = await prisma.planoDeAssinatura.create({
    data: {
      barbeariaId: c.barbeariaId,
      vendedorId: plano.vendedorId ?? null,
      nome: "Plano",
      ciclo: "mensal",
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: plano.vendedorId ? null : 2500,
      aceitaNoBalcao: true,
      servicos: { create: plano.servicos },
    },
  });
  return prisma.assinaturaDoCliente.create({
    data: {
      barbeariaId: c.barbeariaId,
      planoId: criado.id,
      clienteId: c.clienteId,
      situacao,
      forma: "no_balcao",
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: dataParaDate(somarDias(QUINTA, -10)),
      cicloTerminaEm: dataParaDate(somarDias(QUINTA, 20)),
    },
  });
}

let vez = 0;
function marcar(
  c: Cenario,
  servicoIds: string[],
  { data = QUINTA, barbeiroId = c.barbeiroId, status = "confirmado" }: { data?: string; barbeiroId?: string; status?: string } = {}
) {
  vez += 1;
  const hora = `${String(8 + (vez % 10)).padStart(2, "0")}:00`;
  return prisma.agendamento.create({
    data: {
      barbeariaId: c.barbeariaId,
      barbeiroId,
      clienteId: c.clienteId,
      data: dataParaDate(data),
      horaInicio: horaParaDate(hora),
      horaFim: horaParaDate(hora.replace(":00", ":30")),
      status,
      servicos: {
        create: servicoIds.map((servicoId) => ({ servicoId, precoNoMomento: "40.00", duracaoNoMomento: 30 })),
      },
    },
  });
}

async function peloPlano(c: Cenario, query = ""): Promise<Record<string, string[]>> {
  const resposta = await c.app.inject({
    method: "GET",
    url: `/clientes/me/agendamentos${query}`,
    headers: auth(c.token),
  });
  expect(resposta.statusCode).toBe(200);
  const { agendamentos } = resposta.json() as { agendamentos: { id: string; peloPlano: string[] }[] };
  return Object.fromEntries(agendamentos.map((a) => [a.id, a.peloPlano]));
}

describe("GET /clientes/me/agendamentos — a marca do plano", () => {
  it("o horário marcado diz o que o plano cobre; o resto é avulso", async () => {
    const c = await cenario();
    await assinar(c, { servicos: [{ servicoId: c.corte.id, usosPorCiclo: null }] });
    const ambos = await marcar(c, [c.corte.id, c.barba.id]);
    const soBarba = await marcar(c, [c.barba.id]);

    expect(await peloPlano(c)).toEqual({ [ambos.id]: [c.corte.id], [soBarba.id]: [] });
  });

  it("sem assinatura valendo, nada leva a marca", async () => {
    const c = await cenario();
    await assinar(c, { servicos: [{ servicoId: c.corte.id, usosPorCiclo: null }] }, "em_atraso");
    const horario = await marcar(c, [c.corte.id]);

    expect(await peloPlano(c)).toEqual({ [horario.id]: [] });
  });

  it("só os marcados: o concluído e o cancelado ficam sem marca e não gastam uso", async () => {
    const c = await cenario();
    await assinar(c, { servicos: [{ servicoId: c.corte.id, usosPorCiclo: 1 }] });
    const cancelado = await marcar(c, [c.corte.id], { data: somarDias(QUINTA, -1), status: "cancelado" });
    const marcado = await marcar(c, [c.corte.id]);

    expect(await peloPlano(c)).toEqual({ [cancelado.id]: [], [marcado.id]: [c.corte.id] });
  });

  it("o plano de barbeiro só nos horários com quem vende", async () => {
    const c = await cenario();
    await assinar(c, { vendedorId: c.barbeiroId, servicos: [{ servicoId: c.corte.id, usosPorCiclo: null }] });
    const comQuemVende = await marcar(c, [c.corte.id]);
    const comRafael = await marcar(c, [c.corte.id], { barbeiroId: c.rafael.barbeiroId });

    expect(await peloPlano(c)).toEqual({ [comQuemVende.id]: [c.corte.id], [comRafael.id]: [] });
  });

  it("o último uso fica com o horário mais cedo, mesmo filtrando só o outro", async () => {
    const c = await cenario();
    await assinar(c, { servicos: [{ servicoId: c.corte.id, usosPorCiclo: 1 }] });
    const cedo = await marcar(c, [c.corte.id]);
    const depois = await marcar(c, [c.corte.id], { data: somarDias(QUINTA, 1) });

    expect(await peloPlano(c)).toEqual({ [cedo.id]: [c.corte.id], [depois.id]: [] });
    expect(await peloPlano(c, `?de=${somarDias(QUINTA, 1)}`)).toEqual({ [depois.id]: [] });
  });

  it("fora do ciclo pago, o horário fica sem marca", async () => {
    const c = await cenario();
    await assinar(c, { servicos: [{ servicoId: c.corte.id, usosPorCiclo: null }] });
    const depoisDaRenovacao = await marcar(c, [c.corte.id], { data: somarDias(QUINTA, 20) });

    expect(await peloPlano(c)).toEqual({ [depoisDaRenovacao.id]: [] });
  });
});
