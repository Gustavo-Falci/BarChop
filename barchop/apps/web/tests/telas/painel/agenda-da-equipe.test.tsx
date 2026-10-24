import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, C3: a vista de dia da agenda com uma coluna por profissional.

// 2026-09-08 é uma terça-feira; oito da manhã, antes de abrir.
const AGORA = new Date("2026-09-08T08:00:00-03:00");

function semear(papel?: "dono" | "profissional" | "recepcao") {
  const falso = criarApiClientFalso({
    papel,
    bloqueios: [
      {
        id: "x1",
        barbeiroId: "m2",
        dataInicio: "2026-09-08",
        dataFim: "2026-09-08",
        horaInicio: "12:00",
        horaFim: "13:00",
        motivo: "Almoço",
      },
    ],
  });
  falso.estado.equipe!.push({
    id: "m2",
    nome: "Ana",
    email: "ana@gr.com",
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
    podeVenderPlanos: false,
  });
  return falso;
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({
    pathname: "/painel/agenda",
    query: { vista: "dia", data: "2026-09-08" },
  });
});

describe("agenda da equipe", () => {
  it("o dia mostra uma coluna por quem atende, com o nome", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const cabecalho = await screen.findByTestId("cabecalho-da-grade");
    await waitFor(() => expect(within(cabecalho).getByText("Ana")).toBeInTheDocument());
    expect(within(cabecalho).getByText("Rafael")).toBeInTheDocument();
  });

  it("o almoço da Ana aparece na coluna dela", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByText(/almoço/i)).toBeInTheDocument();
  });

  it("criar a partir da coluna da Ana leva o profissional", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());
    const cabecalho = await screen.findByTestId("cabecalho-da-grade");
    await waitFor(() => within(cabecalho).getByText("Ana"));

    // Dois "09:00" livres, um por coluna; o segundo é o da Ana.
    const livres = screen.getAllByRole("button", { name: "09:00" });
    await userEvent.click(livres[1]);

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=09%3A00&profissional=m2"
    );
  });

  it("a pausa do Rafael fica sombreada e sem horário livre na coluna dele", async () => {
    // Terça (dia 2) com pausa das 14:00 às 15:00 na jornada do Rafael. A
    // API recusaria marcar ali; a grade não pode oferecer.
    const falso = semear();
    falso.estado.jornadas!.bb1 = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia" as const,
      horaInicio: null,
      horaFim: null,
      pausaInicio: diaSemana === 2 ? "14:00" : null,
      pausaFim: diaSemana === 2 ? "15:00" : null,
    }));
    montarPainel(<Agenda agora={AGORA} />, falso);

    expect(await screen.findByText("Pausa")).toBeInTheDocument();
    // Um "14:00" só: o da Ana.
    expect(screen.getAllByRole("button", { name: "14:00" })).toHaveLength(1);
  });

  it("o profissional vê só a própria agenda: uma coluna, sem divisão", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear("profissional"));

    await screen.findByTestId("cabecalho-da-grade");
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();
  });
});

describe("painel do dia da equipe", () => {
  // 2026-09-08 às 08:00, antes do primeiro horário.
  function comDoisAtendendo() {
    return criarApiClientFalso({
      agendamentos: [
        {
          id: "a1",
          data: "2026-09-08",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "bb1", nome: "Rafael" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
        {
          id: "a2",
          data: "2026-09-08",
          horaInicio: "10:00",
          horaFim: "10:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "m2", nome: "Ana" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
      ],
    });
  }

  it("com mais de um profissional no dia, cada linha diz com quem", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    montarPainel(<DashboardDoDia agora={AGORA} />, comDoisAtendendo());

    expect(await screen.findByRole("button", { name: /10:00.*com ana/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /09:00.*com rafael/i })).toBeInTheDocument();
  });

  it("com um profissional só, a linha não repete o nome", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    // Só o agendamento do Rafael: sem o da Ana, o dia é de uma pessoa.
    const falso = comDoisAtendendo();
    falso.estado.agendamentos = falso.estado.agendamentos.filter((a) => a.id === "a1");
    montarPainel(<DashboardDoDia agora={AGORA} />, falso);

    expect(await screen.findByRole("button", { name: /09:00/ })).toBeInTheDocument();
    expect(screen.queryByText(/com rafael/i)).not.toBeInTheDocument();
  });
});

describe("agenda da equipe na semana", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { vista: "semana", data: "2026-09-08" },
    });
  });

  function comAlmocoDeTodos() {
    const falso = semear();
    const jornada = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia" as const,
      horaInicio: null,
      horaFim: null,
      pausaInicio: diaSemana === 2 ? "14:00" : null,
      pausaFim: diaSemana === 2 ? "15:00" : null,
    }));
    falso.estado.jornadas!.bb1 = jornada;
    falso.estado.jornadas!.m2 = jornada;
    return falso;
  }

  it("a pausa de todos na terça fica sombreada na coluna da terça", async () => {
    montarPainel(<Agenda agora={AGORA} />, comAlmocoDeTodos());

    expect(await screen.findByText("Pausa")).toBeInTheDocument();
    // Seis dias abertos oferecem 14:00 (domingo fecha); a terça não.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "14:00" })).toHaveLength(5));
  });

  it("pede a ocupação dos sete dias da semana", async () => {
    const falso = comAlmocoDeTodos();
    const original = falso.barbeiro.ocupacaoDoDia;
    const pedidas: string[] = [];
    falso.barbeiro.ocupacaoDoDia = async (data: string) => {
      pedidas.push(data);
      return original(data);
    };
    montarPainel(<Agenda agora={AGORA} />, falso);

    await screen.findByText("Pausa");
    expect([...pedidas].sort()).toEqual([
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
    ]);
  });

  it("na pausa só do Rafael, o horário leva ao novo agendamento só com a Ana", async () => {
    const falso = semear();
    falso.estado.jornadas!.bb1 = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia" as const,
      horaInicio: null,
      horaFim: null,
      pausaInicio: diaSemana === 2 ? "14:00" : null,
      pausaFim: diaSemana === 2 ? "15:00" : null,
    }));
    montarPainel(<Agenda agora={AGORA} />, falso);

    // A terça é a terceira coluna (domingo fecha): o 14:00 dela.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "14:00" })).toHaveLength(6));
    await userEvent.click(screen.getAllByRole("button", { name: "14:00" })[1]);

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=14%3A00&profissional=m2&profissionais=m2"
    );
  });

  it("se a ocupação falhar, a semana aparece com o horário da casa", async () => {
    const falso = comAlmocoDeTodos();
    falso.barbeiro.ocupacaoDoDia = async () => {
      throw new Error("fora do ar");
    };
    montarPainel(<Agenda agora={AGORA} />, falso);

    await waitFor(() => expect(screen.getAllByRole("button", { name: "14:00" })).toHaveLength(6));
    expect(screen.queryByText("Pausa")).not.toBeInTheDocument();
  });
});

// Pedido do dono (2026-10-11): na semana, pílulas "Todos · Rafael · Ana".
// Escolhida uma pessoa, a semana mostra só a agenda dela, com a pausa e
// as folgas dela; o horário livre já leva ela pro Novo agendamento.
describe("semana por profissional", () => {
  function comAgendaDeCadaUm(papel?: "dono" | "profissional" | "recepcao") {
    const falso = criarApiClientFalso({
      papel,
      clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
      bloqueios: [
        {
          id: "x1",
          barbeiroId: "m2",
          dataInicio: "2026-09-08",
          dataFim: "2026-09-08",
          horaInicio: "12:00",
          horaFim: "13:00",
          motivo: "Almoço",
        },
      ],
      agendamentos: [
        {
          id: "a1",
          clienteId: "c1",
          data: "2026-09-09",
          horaInicio: "10:00",
          horaFim: "10:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "bb1", nome: "Rafael" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
        {
          id: "a2",
          clienteId: "c1",
          data: "2026-09-10",
          horaInicio: "15:00",
          horaFim: "15:30",
          status: "confirmado",
          origem: "cliente",
          observacoes: null,
          barbeiro: { id: "m2", nome: "Ana" },
          servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
        },
      ],
    });
    falso.estado.equipe!.push({
      id: "m2",
      nome: "Ana",
      email: "ana@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
      podeVenderPlanos: false,
    });
    // Pausa só do Rafael, na terça das 14 às 15.
    falso.estado.jornadas!.bb1 = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia" as const,
      horaInicio: null,
      horaFim: null,
      pausaInicio: diaSemana === 2 ? "14:00" : null,
      pausaFim: diaSemana === 2 ? "15:00" : null,
    }));
    return falso;
  }

  function naSemana(query: Record<string, string> = {}) {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { vista: "semana", data: "2026-09-08", ...query },
    });
  }

  it("mostra Todos e uma pílula por quem atende, com Todos escolhido", async () => {
    naSemana();
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
    expect(within(grupo).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
    expect(within(grupo).getByRole("button", { name: "Rafael" })).toBeInTheDocument();
    expect(within(grupo).getByRole("button", { name: "Ana" })).toBeInTheDocument();
  });

  it("escolher a Ana vai pra URL, mantendo vista e data", async () => {
    naSemana();
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
    await userEvent.click(within(grupo).getByRole("button", { name: "Ana" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=semana&data=2026-09-08&profissionais=m2");
  });

  it("andar de semana mantém a pessoa escolhida", async () => {
    naSemana({ profissional: "m2" });
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    await userEvent.click(await screen.findByRole("button", { name: "Próximo período" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=semana&data=2026-09-15&profissionais=m2");
  });

  it("com o Rafael, a pausa dele aparece e só os agendamentos dele", async () => {
    naSemana({ profissional: "bb1" });
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    expect(await screen.findByText("Pausa")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /João Silva/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /João Silva/ })).toHaveLength(1);
    expect(screen.getByText("1 agendamento")).toBeInTheDocument();
  });

  it("com a Ana, a folga dela aparece e o horário livre leva ela", async () => {
    naSemana({ profissional: "m2" });
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    expect(await screen.findByText("Almoço")).toBeInTheDocument();
    // Seis dias abertos com 14:00; a terça da Ana não tem pausa.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "14:00" })).toHaveLength(6));
    await userEvent.click(screen.getAllByRole("button", { name: "14:00" })[1]);

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=14%3A00&profissional=m2"
    );
  });

  it("o profissional não vê as pílulas: a agenda já é só dele", async () => {
    naSemana();
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm("profissional"));

    await screen.findByRole("button", { name: "Semana" });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "14:00" }).length).toBeGreaterThan(0));
    expect(screen.queryByRole("group", { name: "Filtrar por profissional" })).not.toBeInTheDocument();
  });

  it("na vista de dia as pílulas aparecem, e o filtro vindo da semana se desfaz nelas", async () => {
    // Filtrou a Ana na semana e tocou num dia: o dia abre só com ela, e
    // Todos volta a mostrar as duas colunas.
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda", query: { vista: "dia", data: "2026-09-08", profissionais: "m2" } });
    montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

    const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
    await waitFor(() => expect(within(grupo).getByRole("button", { name: "Ana" })).toHaveAttribute("aria-pressed", "true"));
    await userEvent.click(within(grupo).getByRole("button", { name: "Todos" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=dia&data=2026-09-08");
  });

  describe("vários de uma vez (agenda no celular, PR 7)", () => {
    // Uma terceira pessoa: com duas, marcar as duas já é "todos".
    function comTres() {
      const falso = comAgendaDeCadaUm();
      falso.estado.equipe!.push({
        id: "m3",
        nome: "Bia",
        email: "bia@gr.com",
        telefone: null,
        papel: "profissional",
        atende: true,
        ativo: true,
        fotoUrl: null,
        convitePendente: false,
        podeVenderPlanos: false,
      });
      return falso;
    }

    it("marcar uma segunda pessoa soma as duas na URL", async () => {
      naSemana({ profissionais: "bb1" });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
      await userEvent.click(within(grupo).getByRole("button", { name: "Ana" }));

      expect(navegacaoFalsa.push).toHaveBeenCalledWith(
        "/painel/agenda?vista=semana&data=2026-09-08&profissionais=bb1,m2"
      );
    });

    it("com duas marcadas, as duas pílulas ficam ligadas e Todos não", async () => {
      naSemana({ profissionais: "bb1,m2" });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
      await waitFor(() =>
        expect(within(grupo).getByRole("button", { name: "Bia" })).toHaveAttribute("aria-pressed", "false")
      );
      expect(within(grupo).getByRole("button", { name: "Rafael" })).toHaveAttribute("aria-pressed", "true");
      expect(within(grupo).getByRole("button", { name: "Ana" })).toHaveAttribute("aria-pressed", "true");
      expect(within(grupo).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "false");
      // Os agendamentos dos dois.
      expect(await screen.findAllByRole("button", { name: /João Silva/ })).toHaveLength(2);
    });

    it("desmarcar a única pessoa volta pra Todos", async () => {
      naSemana({ profissionais: "m2" });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
      await userEvent.click(within(grupo).getByRole("button", { name: "Ana" }));

      expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=semana&data=2026-09-08");
    });

    it("marcar todo mundo é o mesmo que nenhum filtro", async () => {
      naSemana({ profissionais: "bb1" });
      montarPainel(<Agenda agora={AGORA} />, comAgendaDeCadaUm());

      const grupo = await screen.findByRole("group", { name: "Filtrar por profissional" });
      await userEvent.click(within(grupo).getByRole("button", { name: "Ana" }));

      expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=semana&data=2026-09-08");
    });

    it("na vista de dia, o filtro deixa só as colunas de quem ficou", async () => {
      navegacaoFalsa.redefinir({
        pathname: "/painel/agenda",
        query: { vista: "dia", data: "2026-09-08", profissionais: "bb1,m2" },
      });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      const cabecalho = await screen.findByTestId("cabecalho-da-grade");
      await waitFor(() => expect(within(cabecalho).getByText("Ana")).toBeInTheDocument());
      expect(within(cabecalho).getByText("Rafael")).toBeInTheDocument();
      expect(within(cabecalho).queryByText("Bia")).not.toBeInTheDocument();
    });

    it("no mês, as pílulas aparecem e só os agendamentos de quem ficou", async () => {
      navegacaoFalsa.redefinir({
        pathname: "/painel/agenda",
        query: { vista: "mes", data: "2026-09-08", profissionais: "m2" },
      });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      expect(await screen.findByRole("group", { name: "Filtrar por profissional" })).toBeInTheDocument();
      // O agendamento do Rafael (dia 9) sai; o da Ana (dia 10) fica.
      expect(await screen.findByRole("button", { name: "10 de setembro, 1 agendamento" })).toHaveTextContent("15:00 João Silva");
      expect(screen.getByRole("button", { name: "9 de setembro" })).not.toHaveTextContent("João Silva");
    });

    it("na lista, só os agendamentos de quem ficou", async () => {
      navegacaoFalsa.redefinir({
        pathname: "/painel/agenda",
        query: { vista: "lista", data: "2026-09-08", profissionais: "m2" },
      });
      montarPainel(<Agenda agora={AGORA} />, comTres());

      const lista = await screen.findByTestId("lista-da-agenda");
      await waitFor(() =>
        expect(within(lista).getAllByRole("button", { name: /João Silva/ })).toHaveLength(1)
      );
      expect(within(lista).getByRole("region", { name: "10 de setembro" })).toHaveTextContent("João Silva");
    });
  });
});
