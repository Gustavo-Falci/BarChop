import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { RegrasDeAgendamento } from "../../../src/telas/painel/configuracoes/RegrasDeAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 3 (3f): a área Regras de agendamento. O dono decide
// como o cliente marca pelo link, e cada escolha diz numa frase o que o
// cliente vai ver. Os padrões são o comportamento de antes das regras.

function grupo(nome: RegExp) {
  return within(screen.getByRole("group", { name: nome }));
}

// Um Salvar só (17/10): a barra no pé da tela aparece quando algo muda
// (ou enquanto a área não foi decidida) e diz o que mudou.
function barra() {
  return screen.getByRole("region", { name: "Mudanças" });
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/regras-de-agendamento" });
});

describe("regras de agendamento", () => {
  it("abre nos padrões, com o efeito de cada um", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    expect(grupo(/intervalo entre horários/i).getByRole("radio", { name: "15 min" })).toBeChecked();
    expect(grupo(/antecedência mínima/i).getByRole("radio", { name: "Nenhuma" })).toBeChecked();
    expect(grupo(/mesmo dia/i).getByRole("radio", { name: "Sim" })).toBeChecked();
    expect(grupo(/até quando a agenda abre/i).getByRole("radio", { name: "Sem limite" })).toBeChecked();
    expect(grupo(/caber antes de fechar/i).getByRole("radio", { name: "Sim" })).toBeChecked();
    expect(grupo(/cliente remarca/i).getByRole("radio", { name: "Até começar" })).toBeChecked();
    expect(grupo(/cliente cancela/i).getByRole("radio", { name: "Até começar" })).toBeChecked();
    expect(screen.getByRole("banner")).toHaveTextContent("Faltando");
  });

  it("cada escolha diz o que o cliente vai ver", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    await userEvent.click(grupo(/intervalo entre horários/i).getByRole("radio", { name: "30 min" }));
    await userEvent.click(grupo(/antecedência mínima/i).getByRole("radio", { name: "2 h" }));
    await userEvent.click(grupo(/mesmo dia/i).getByRole("radio", { name: "Não" }));
    await userEvent.click(grupo(/até quando a agenda abre/i).getByRole("radio", { name: "30 dias" }));
    await userEvent.click(grupo(/cliente cancela/i).getByRole("radio", { name: "24 h" }));

    expect(grupo(/intervalo entre horários/i).getByText(/de 30 em 30 minutos/i)).toBeInTheDocument();
    expect(grupo(/antecedência mínima/i).getByText(/pelo menos 2 h antes/i)).toBeInTheDocument();
    expect(grupo(/mesmo dia/i).getByText(/a partir de amanhã/i)).toBeInTheDocument();
    expect(grupo(/até quando a agenda abre/i).getByText(/até 30 dias à frente/i)).toBeInTheDocument();
    expect(grupo(/cliente cancela/i).getByText(/até 24 h antes/i)).toBeInTheDocument();
  });

  it("salvar como o cliente marca grava as cinco regras e decide a área", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    await userEvent.click(grupo(/intervalo entre horários/i).getByRole("radio", { name: "1 h" }));
    await userEvent.click(grupo(/caber antes de fechar/i).getByRole("radio", { name: "Não" }));
    await userEvent.click(grupo(/até quando a agenda abre/i).getByRole("radio", { name: "14 dias" }));
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("Configurado"));
    expect(falso.estado.perfil).toMatchObject({
      intervaloMinutos: 60,
      antecedenciaMinutos: 0,
      aceitaMesmoDia: true,
      janelaDias: 14,
      cabeAntesDeFechar: false,
    });
  });

  it("salvar os prazos grava os dois", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("group", { name: /cliente remarca/i });
    await userEvent.click(grupo(/cliente remarca/i).getByRole("radio", { name: "6 h" }));
    await userEvent.click(grupo(/cliente cancela/i).getByRole("radio", { name: "12 h" }));
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(falso.estado.perfil).toMatchObject({ prazoRemarcarHoras: 6, prazoCancelarHoras: 12 }));
  });

  it("a barra diz o que mudou, e Descartar volta ao que estava", async () => {
    const falso = criarApiClientFalso({ areasDecididas: ["regras_de_agendamento"] });
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    await userEvent.click(grupo(/intervalo entre horários/i).getByRole("radio", { name: "30 min" }));

    expect(barra()).toHaveTextContent("1 mudança");
    expect(barra()).toHaveTextContent("Intervalo entre horários: 15 min → 30 min");

    await userEvent.click(within(barra()).getByRole("button", { name: "Descartar" }));

    expect(grupo(/intervalo entre horários/i).getByRole("radio", { name: "15 min" })).toBeChecked();
  });

  it("um Salvar só grava as sete regras de uma vez", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    await userEvent.click(grupo(/intervalo entre horários/i).getByRole("radio", { name: "30 min" }));
    await userEvent.click(grupo(/cliente cancela/i).getByRole("radio", { name: "24 h" }));

    expect(barra()).toHaveTextContent("2 mudanças");
    expect(screen.getAllByRole("button", { name: /salvar/i })).toHaveLength(1);
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(falso.estado.perfil).toMatchObject({ intervaloMinutos: 30, prazoCancelarHoras: 24 })
    );
  });

  it("ainda não decidida, sem mudança, a barra oferece salvar assim", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await screen.findByRole("group", { name: /intervalo entre horários/i });
    expect(barra()).toHaveTextContent(/ainda não decidid/i);
    expect(within(barra()).queryByRole("button", { name: "Descartar" })).toBeNull();
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("Configurado"));
  });

  it("abre no que a barbearia já decidiu", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.atualizarMinhaBarbearia({ janelaDias: 90, prazoCancelarHoras: 48 });
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("group", { name: /até quando a agenda abre/i });
    expect(grupo(/até quando a agenda abre/i).getByRole("radio", { name: "90 dias" })).toBeChecked();
    expect(grupo(/cliente cancela/i).getByRole("radio", { name: "48 h" })).toBeChecked();
    expect(screen.getByRole("banner")).toHaveTextContent("Configurado");
  });

  it("quem não é dono não edita as regras", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByText(/só o dono/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /salvar/i })).not.toBeInTheDocument();
  });

  it("depois de Horários, a próxima área faltando é Regras de agendamento", async () => {
    montarPainel(<HorariosDaBarbearia />, criarApiClientFalso());

    expect(
      await screen.findByRole("link", { name: /próxima área faltando: regras de agendamento/i })
    ).toHaveAttribute("href", "/painel/configuracoes/regras-de-agendamento");
  });
});
