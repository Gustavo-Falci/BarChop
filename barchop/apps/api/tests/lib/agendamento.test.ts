import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { criarAgendamento } from "../../src/lib/agendamento";
import { dateParaData, dateParaHora } from "../../src/lib/horas";

// Telefone único por cadastro. Deriva de um contador, e não do sufixo:
// `sufixo.length` colidiria entre dois sufixos do mesmo tamanho, e o
// erro só apareceria quando alguém acrescentasse um cenário novo.
let sequenciaDeTelefone = 0;
function proximoTelefone(): string {
  sequenciaDeTelefone += 1;
  return `1199999${String(sequenciaDeTelefone).padStart(4, "0")}`;
}

// Cenário mínimo: uma barbearia aberta de segunda a sábado das 09:00 às
// 18:00, um barbeiro, um cliente e um serviço de 45 minutos.
// 2026-09-10 é uma quinta-feira (diaSemana 4).
async function cenario(sufixo = "um") {
  const barbearia = await prisma.barbearia.create({
    // Mesma forma que o signup exige (`^[a-z0-9-]{3,80}$`) e que o
    // helper da fase 3 gera — escrever direto no banco pula a
    // validação, mas divergir da convenção só confunde depois.
    data: { nome: `Barbearia ${sufixo}`, slug: `barbearia-${sufixo}` },
  });
  const barbeiro = await prisma.barbeiro.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "Barbeiro",
      email: `${sufixo}@exemplo.com`,
      senhaHash: "scrypt$x$y",
    },
  });
  const cliente = await prisma.cliente.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "João",
      telefone: proximoTelefone(),
    },
  });
  const servico = await prisma.servico.create({
    data: {
      barbeariaId: barbearia.id,
      nome: "Corte",
      duracaoMinutos: 45,
      preco: "45.00",
    },
  });

  await prisma.horarioFuncionamento.createMany({
    data: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      barbeariaId: barbearia.id,
      diaSemana,
      horaAbertura: new Date(Date.UTC(1970, 0, 1, 9, 0)),
      horaFechamento: new Date(Date.UTC(1970, 0, 1, 18, 0)),
      fechado: false,
    })),
  });

  return { barbearia, barbeiro, cliente, servico };
}

function params(c: Awaited<ReturnType<typeof cenario>>, extra = {}) {
  return {
    barbeariaId: c.barbearia.id,
    barbeiroId: c.barbeiro.id,
    clienteId: c.cliente.id,
    servicoIds: [c.servico.id],
    data: "2026-09-10",
    horaInicio: "10:00",
    origem: "barbeiro" as const,
    ...extra,
  };
}

describe("criarAgendamento", () => {
  it("cria o agendamento com hora de fim somada dos serviços", async () => {
    const c = await cenario();

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    expect(dateParaData(agendamento.data)).toBe("2026-09-10");
    expect(dateParaHora(agendamento.horaInicio)).toBe("10:00");
    // 45 minutos de serviço, somados a partir do banco — nunca do corpo.
    expect(dateParaHora(agendamento.horaFim)).toBe("10:45");
    expect(agendamento.status).toBe("confirmado");
    expect(agendamento.origem).toBe("barbeiro");
  });

  it("soma a duração de vários serviços", async () => {
    const c = await cenario();
    const barba = await prisma.servico.create({
      data: {
        barbeariaId: c.barbearia.id,
        nome: "Barba",
        duracaoMinutos: 30,
        preco: "30.00",
      },
    });

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c, { servicoIds: [c.servico.id, barba.id] }))
    );

    expect(dateParaHora(agendamento.horaFim)).toBe("11:15");
    expect(agendamento.servicos).toHaveLength(2);
  });

  it("congela preço e duração do momento", async () => {
    const c = await cenario();

    const agendamento = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    // Preço do serviço sobe depois do agendamento feito.
    await prisma.servico.update({
      where: { id: c.servico.id },
      data: { preco: "60.00", duracaoMinutos: 60 },
    });

    const gravado = await prisma.agendamentoServico.findFirstOrThrow({
      where: { agendamentoId: agendamento.id },
    });

    // O histórico tem que continuar dizendo quanto foi cobrado no dia.
    expect(gravado.precoNoMomento.toFixed(2)).toBe("45.00");
    expect(gravado.duracaoNoMomento).toBe(45);
  });

  it("recusa serviço de outra barbearia com 422", async () => {
    const c = await cenario("um");
    const outra = await cenario("outra");

    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { servicoIds: [outra.servico.id] }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "servico_invalido" });
  });

  it("recusa serviço inativo com 422", async () => {
    const c = await cenario();
    await prisma.servico.update({
      where: { id: c.servico.id },
      data: { ativo: false },
    });

    await expect(
      prisma.$transaction((tx) => criarAgendamento(tx, params(c)))
    ).rejects.toMatchObject({ status: 422, codigo: "servico_inativo" });
  });

  it("recusa barbeiro de outra barbearia com 422", async () => {
    const c = await cenario("um");
    const outra = await cenario("outra");

    // O barbeiroId vem do corpo nos dois fluxos, e no público sem token
    // nenhum. Sem esta checagem dava pra lotar a agenda de um barbeiro
    // de outra barbearia.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { barbeiroId: outra.barbeiro.id }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "barbeiro_invalido" });
  });

  it("recusa barbeiro desativado com 422", async () => {
    const c = await cenario();
    await prisma.barbeiro.update({
      where: { id: c.barbeiro.id },
      data: { ativo: false },
    });

    await expect(
      prisma.$transaction((tx) => criarAgendamento(tx, params(c)))
    ).rejects.toMatchObject({ status: 422, codigo: "barbeiro_invalido" });
  });

  it("recusa dia sem horário de funcionamento com 422", async () => {
    const c = await cenario();
    // 2026-09-13 é um domingo, e o cenário só abre de segunda a sábado.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { data: "2026-09-13" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário antes da abertura com 422", async () => {
    const c = await cenario();

    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "08:00" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário que não cabe antes do fechamento com 422", async () => {
    const c = await cenario();

    // 17:30 + 45min passa das 18:00.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "17:30" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário fora da grade de 15 minutos com 422", async () => {
    const c = await cenario();

    // calcularHorariosDisponiveis alinha os candidatos ao grid a partir
    // da meia-noite: 10:07 nunca está na lista.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "10:07" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa horário já ocupado com 422, antes de chegar no banco", async () => {
    const c = await cenario();
    await prisma.$transaction((tx) => criarAgendamento(tx, params(c)));

    // Este é o passo 4 da spec: mensagem útil. O passo 6 (a trava do
    // banco) é a garantia real, e tem teste próprio na Task 6.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { horaInicio: "10:30" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "horario_indisponivel" });
  });

  it("recusa data que não existe no calendário com 422", async () => {
    const c = await cenario();

    // O pattern do schema aceita a forma; quem sabe que 31 de fevereiro
    // não existe é o dataParaDate.
    await expect(
      prisma.$transaction((tx) =>
        criarAgendamento(tx, params(c, { data: "2026-02-31" }))
      )
    ).rejects.toMatchObject({ status: 422, codigo: "data_invalida" });
  });

  it("libera o horário depois do cancelamento", async () => {
    const c = await cenario();
    const primeiro = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    await prisma.agendamento.update({
      where: { id: primeiro.id },
      data: { status: "cancelado" },
    });

    // A constraint do banco é parcial (`WHERE status <> 'cancelado'`), e
    // o cálculo tem que concordar com ela.
    const segundo = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c))
    );

    expect(dateParaHora(segundo.horaInicio)).toBe("10:00");
  });

  it("aceita o horário encostado no anterior (intervalo meio-aberto)", async () => {
    const c = await cenario();
    await prisma.$transaction((tx) => criarAgendamento(tx, params(c)));

    // 10:00–10:45 e 10:45–11:30 não colidem: o tsrange é '[)'.
    const segundo = await prisma.$transaction((tx) =>
      criarAgendamento(tx, params(c, { horaInicio: "10:45" }))
    );

    expect(dateParaHora(segundo.horaInicio)).toBe("10:45");
  });
});
