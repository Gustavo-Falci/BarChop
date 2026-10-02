import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// 2026-09-08 é uma terça-feira.
const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear() {
  return criarApiClientFalso({
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "11:00",
        horaFim: "11:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        servicos: [
          { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
        ],
      },
    ],
  });
}

describe("agenda", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08" },
    });
  });

  it("sem ?vista= na URL, abre na semana", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    // Sete colunas: a semana de 2026-09-08 vai de domingo 06 a sábado 12.
    expect(screen.getByRole("button", { name: "6 de setembro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "12 de setembro" })).toBeInTheDocument();
  });

  it("pede largura cheia, em vez da medida das telas de leitura", async () => {
    // A agenda é grade, não texto: a medida de 1180px do container serve
    // lista e formulário, e aqui só espreme as sete colunas. O atributo
    // é o que o container lê para abrir mão do limite — sem ele a tela
    // volta a estreitar sem nada quebrar.
    montarPainel(<Agenda agora={AGORA} />, semear());

    await screen.findByRole("button", { name: "Semana" });

    expect(screen.getByTestId("agenda").dataset.largura).toBe("cheia");
  });

  it("sem ?data= na URL, mostra hoje", async () => {
    // Herdado da tela antiga: a data padrão sai do relógio, não de uma
    // constante — e `agora` é parâmetro justamente pra isso ser testável.
    navegacaoFalsa.redefinir({ pathname: "/painel/agenda" });

    montarPainel(<Agenda agora={AGORA} />, semear());

    // A semana de hoje (08/09) começa no domingo 06.
    expect(
      await screen.findByRole("button", { name: "6 de setembro" })
    ).toBeInTheDocument();
  });

  it("mostra o agendamento na vista de dia", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "dia" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: /João Silva/ })).toBeInTheDocument();
  });

  it("clicar numa faixa livre leva ao novo agendamento com data e hora", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "dia" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "14:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agendamentos/novo?data=2026-09-08&hora=14%3A00"
    );
  });

  it("trocar de vista preserva a data", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Mês" }));

    // Setembro, não o mês corrente do relógio da máquina.
    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=mes&data=2026-09-08"
    );
  });

  it("andar na vista de semana pula sete dias", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "Próximo período" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=semana&data=2026-09-15"
    );
  });

  it("andar na vista de mês pula um mês", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "mes" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "Período anterior" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=mes&data=2026-08-08"
    );
  });

  it("clicar num dia do mês abre aquele dia", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "mes" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "15 de setembro" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=dia&data=2026-09-15"
    );
  });

  it("clicar no cabeçalho de um dia da semana abre aquele dia", async () => {
    // Herdado da faixa de dias da tela antiga, que trocava a data na URL:
    // a coluna da semana faz o mesmo papel, indo para a vista de dia.
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(
      await screen.findByRole("button", { name: "9 de setembro" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/painel/agenda?vista=dia&data=2026-09-09"
    );
  });

  it("vista inválida na URL cai na semana, sem quebrar", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08", vista: "banana" },
    });

    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Semana" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("erro ao carregar horários avisa, em vez de ficar carregando pra sempre", async () => {
    const falso = semear();
    falso.barbeiro.horarios = async () => {
      throw new ErroDaApi(500, "erro_interno", "Falha ao buscar horários.");
    };

    montarPainel(<Agenda agora={AGORA} />, falso);

    expect(await screen.findByText("Falha ao buscar horários.")).toBeInTheDocument();
  });
});

// O resto da suíte passa `agora` fixo e nunca toca o relógio. Aqui o
// assunto É o relógio: a régua tem que andar sozinha com a aba aberta,
// e isso só se prova com tempo que passa. Fake timers ficam presos a
// este bloco; `shouldAdvanceTime` deixa as promessas do dublê da API
// resolverem sem que cada teste precise empurrar o tempo à mão.
describe("agenda — régua do agora com o relógio de verdade", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({
      pathname: "/painel/agenda",
      query: { data: "2026-09-08" },
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-09-08T10:02:30-03:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("anda a cada minuto, sem recarregar a tela", async () => {
    montarPainel(<Agenda />, semear());

    const regua = await screen.findByTestId("regua-do-agora");
    expect(regua.style.getPropertyValue("--linha")).toBe("13");
    expect(regua.style.getPropertyValue("--fracao")).toBe("0.4");

    // 10:02:30 + 3 min = 10:05:30: a régua cruza para a linha seguinte.
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });

    const depois = screen.getByTestId("regua-do-agora");
    expect(depois.style.getPropertyValue("--linha")).toBe("14");
    expect(depois.style.getPropertyValue("--fracao")).toBe("0");
  });
});
