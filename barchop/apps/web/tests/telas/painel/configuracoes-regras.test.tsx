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

    await userEvent.click(await screen.findByRole("radio", { name: "30 min" }));
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

    await userEvent.click(await screen.findByRole("radio", { name: "1 h" }));
    await userEvent.click(grupo(/caber antes de fechar/i).getByRole("radio", { name: "Não" }));
    await userEvent.click(grupo(/até quando a agenda abre/i).getByRole("radio", { name: "14 dias" }));
    await userEvent.click(screen.getByRole("button", { name: /salvar regras de marcar/i }));

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

    await userEvent.click(grupo(/cliente remarca/i).getByRole("radio", { name: "6 h" }));
    await userEvent.click(grupo(/cliente cancela/i).getByRole("radio", { name: "12 h" }));
    await userEvent.click(screen.getByRole("button", { name: /salvar prazos/i }));

    await waitFor(() => expect(falso.estado.perfil).toMatchObject({ prazoRemarcarHoras: 6, prazoCancelarHoras: 12 }));
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
