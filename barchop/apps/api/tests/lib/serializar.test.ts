import { describe, expect, it } from "vitest";
import { Prisma } from "@barchop/database";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import {
  serializarAgendamento,
  serializarBarbearia,
  serializarCliente,
  serializarHorario,
  serializarServico,
} from "../../src/lib/serializar";

describe("serializarServico", () => {
  it("devolve o preço como string de duas casas", () => {
    const servico = serializarServico({
      id: "s1",
      nome: "Corte",
      duracaoMinutos: 45,
      preco: new Prisma.Decimal("45"),
      ativo: true,
    });

    // O motivo de existir deste módulo: `new Prisma.Decimal("45")` sai
    // como `{}` no JSON.stringify, e o preço sumiria da resposta sem
    // erro nenhum.
    expect(servico.preco).toBe("45.00");
    expect(JSON.parse(JSON.stringify(servico)).preco).toBe("45.00");
  });

  it("completa a segunda casa decimal", () => {
    expect(
      serializarServico({
        id: "s1",
        nome: "Barba",
        duracaoMinutos: 20,
        preco: new Prisma.Decimal("30.5"),
        ativo: true,
      }).preco
    ).toBe("30.50");
  });

  it("mantém ativo, que a listagem do barbeiro precisa ver", () => {
    expect(
      serializarServico({
        id: "s1",
        nome: "Antigo",
        duracaoMinutos: 30,
        preco: new Prisma.Decimal("10"),
        ativo: false,
      }).ativo
    ).toBe(false);
  });
});

describe("serializarHorario", () => {
  it("converte as colunas @db.Time pra HH:mm", () => {
    const horario = serializarHorario({
      diaSemana: 1,
      horaAbertura: horaParaDate("09:00"),
      horaFechamento: horaParaDate("18:30"),
      fechado: false,
    });

    expect(horario).toEqual({
      diaSemana: 1,
      horaAbertura: "09:00",
      horaFechamento: "18:30",
      fechado: false,
    });
  });

  it("mantém null quando o dia está fechado", () => {
    expect(
      serializarHorario({
        diaSemana: 0,
        horaAbertura: null,
        horaFechamento: null,
        fechado: true,
      })
    ).toEqual({
      diaSemana: 0,
      horaAbertura: null,
      horaFechamento: null,
      fechado: true,
    });
  });
});

describe("serializarCliente", () => {
  it("troca senhaHash por temConta e nunca deixa o hash sair", () => {
    const cliente = serializarCliente({
      id: "c1",
      nome: "João",
      telefone: "11999998888",
      email: null,
      senhaHash: "scrypt$abc$def",
    });

    expect(cliente).toEqual({
      id: "c1",
      nome: "João",
      telefone: "11999998888",
      email: null,
      temConta: true,
    });
    expect(JSON.stringify(cliente)).not.toContain("scrypt$");
  });

  it("marca temConta como false quando o cliente não tem senha", () => {
    expect(
      serializarCliente({
        id: "c1",
        nome: "Maria",
        telefone: "11888887777",
        email: "maria@exemplo.com",
        senhaHash: null,
      }).temConta
    ).toBe(false);
  });
});

describe("serializarBarbearia", () => {
  it("devolve só os campos públicos", () => {
    expect(
      serializarBarbearia({
        id: "b1",
        nome: "Barbearia do Gu",
        slug: "barbearia-do-gu",
        telefone: null,
        endereco: null,
        logoUrl: null,
        sobre: "Corte na tesoura e barba na navalha.",
      })
    ).toEqual({
      id: "b1",
      nome: "Barbearia do Gu",
      slug: "barbearia-do-gu",
      telefone: null,
      endereco: null,
      logoUrl: null,
      sobre: "Corte na tesoura e barba na navalha.",
    });
  });
});

describe("serializarAgendamento", () => {
  it("converte data, horas e preços dos serviços", () => {
    const agendamento = serializarAgendamento({
      id: "a1",
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:45"),
      status: "confirmado",
      origem: "cliente",
      observacoes: null,
      servicos: [
        {
          servicoId: "s1",
          precoNoMomento: new Prisma.Decimal("45"),
          duracaoNoMomento: 45,
          servico: { nome: "Corte" },
        },
      ],
    });

    expect(agendamento).toEqual({
      id: "a1",
      data: "2026-09-10",
      horaInicio: "10:00",
      horaFim: "10:45",
      status: "confirmado",
      origem: "cliente",
      observacoes: null,
      servicos: [
        {
          servicoId: "s1",
          nome: "Corte",
          precoNoMomento: "45.00",
          duracaoNoMomento: 45,
        },
      ],
    });
  });
});
