import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { HorariosDaBarbearia } from "../../../src/telas/painel/configuracoes/HorariosDaBarbearia";
import { RegrasDeAgendamento } from "../../../src/telas/painel/configuracoes/RegrasDeAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 3 (3f): a área Regras de agendamento. O dono decide
// como o cliente marca pelo link, e cada escolha diz numa frase o que o
// cliente vai ver. Os padrões são o comportamento de antes das regras.
//
// Redesenho das Configurações, PR 4 (01/11): cada regra é uma linha com o
// valor à direita; tocar abre a escolha numa folha (rádios e "Usar
// esta"). As de sim/não são um interruptor na própria linha.

// A linha da regra: o nome dela e o valor de agora.
function linha(nome: RegExp) {
  return screen.getByRole("button", { name: nome });
}

function chave(nome: RegExp) {
  return screen.getByRole("switch", { name: nome });
}

function folha() {
  return screen.getByRole("dialog");
}

// Toca a linha, escolhe na folha e usa.
async function escolher(nome: RegExp, opcao: string) {
  await userEvent.click(linha(nome));
  await userEvent.click(within(folha()).getByRole("radio", { name: opcao }));
  await userEvent.click(within(folha()).getByRole("button", { name: "Usar esta" }));
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

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    expect(linha(/intervalo entre horários/i)).toHaveAccessibleName("Intervalo entre horários 15 min");
    expect(linha(/intervalo entre horários/i)).toHaveAccessibleDescription(/de 15 em 15 minutos/i);
    expect(linha(/antecedência mínima/i)).toHaveAccessibleName("Antecedência mínima Nenhuma");
    expect(chave(/mesmo dia/i)).toBeChecked();
    expect(chave(/mesmo dia/i)).toHaveAccessibleDescription(/pode marcar pra hoje/i);
    expect(linha(/até quando a agenda abre/i)).toHaveAccessibleName("Até quando a agenda abre Sem limite");
    expect(chave(/caber antes de fechar/i)).toBeChecked();
    expect(linha(/cliente remarca/i)).toHaveAccessibleName("Cliente remarca até Até começar");
    expect(linha(/cliente cancela/i)).toHaveAccessibleName("Cliente cancela até Até começar");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("banner")).toHaveTextContent("Faltando");
  });

  it("a folha abre na escolha de agora e diz o efeito da que está marcada", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("button", { name: /antecedência mínima/i }));

    expect(folha()).toHaveAccessibleName("Antecedência mínima");
    expect(within(folha()).getByRole("radio", { name: "Nenhuma" })).toBeChecked();
    expect(within(folha()).getAllByRole("radio")).toHaveLength(6);
    expect(within(folha()).getByRole("radio", { name: "Nenhuma" })).toHaveFocus();

    await userEvent.click(within(folha()).getByRole("radio", { name: "2 h" }));
    expect(within(folha()).getByText(/pelo menos 2 h antes/i)).toBeInTheDocument();
  });

  it("cada escolha diz o que o cliente vai ver", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    await escolher(/intervalo entre horários/i, "30 min");
    await escolher(/antecedência mínima/i, "2 h");
    await userEvent.click(chave(/mesmo dia/i));
    await escolher(/até quando a agenda abre/i, "30 dias");
    await escolher(/cliente cancela/i, "24 h");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linha(/intervalo entre horários/i)).toHaveAccessibleName("Intervalo entre horários 30 min");
    expect(linha(/intervalo entre horários/i)).toHaveAccessibleDescription(/de 30 em 30 minutos/i);
    expect(linha(/antecedência mínima/i)).toHaveAccessibleDescription(/pelo menos 2 h antes/i);
    expect(chave(/mesmo dia/i)).not.toBeChecked();
    expect(chave(/mesmo dia/i)).toHaveAccessibleDescription(/a partir de amanhã/i);
    expect(linha(/até quando a agenda abre/i)).toHaveAccessibleDescription(/até 30 dias à frente/i);
    expect(linha(/cliente cancela/i)).toHaveAccessibleDescription(/até 24 h antes/i);
  });

  it("fechar a folha sem usar deixa a regra como estava", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso({ areasDecididas: ["regras_de_agendamento"] }));

    await userEvent.click(await screen.findByRole("button", { name: /intervalo entre horários/i }));
    await userEvent.click(within(folha()).getByRole("radio", { name: "1 h" }));
    await userEvent.click(within(folha()).getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linha(/intervalo entre horários/i)).toHaveAccessibleName("Intervalo entre horários 15 min");
    expect(screen.queryByRole("region", { name: "Mudanças" })).toBeNull();

    // Reabrir mostra a de agora, não a que ficou marcada.
    await userEvent.click(linha(/intervalo entre horários/i));
    expect(within(folha()).getByRole("radio", { name: "15 min" })).toBeChecked();
  });

  it("salvar como o cliente marca grava as cinco regras e decide a área", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    await escolher(/intervalo entre horários/i, "1 h");
    await userEvent.click(chave(/caber antes de fechar/i));
    await escolher(/até quando a agenda abre/i, "14 dias");
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

    await screen.findByRole("button", { name: /cliente remarca/i });
    await escolher(/cliente remarca/i, "6 h");
    await escolher(/cliente cancela/i, "12 h");
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(falso.estado.perfil).toMatchObject({ prazoRemarcarHoras: 6, prazoCancelarHoras: 12 }));
  });

  it("a barra diz o que mudou, e Descartar volta ao que estava", async () => {
    const falso = criarApiClientFalso({ areasDecididas: ["regras_de_agendamento"] });
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    await escolher(/intervalo entre horários/i, "30 min");
    await userEvent.click(chave(/mesmo dia/i));

    expect(barra()).toHaveTextContent("2 mudanças");
    expect(barra()).toHaveTextContent("Intervalo entre horários: 15 min → 30 min");
    expect(barra()).toHaveTextContent("Marcar no mesmo dia: Sim → Não");

    await userEvent.click(within(barra()).getByRole("button", { name: "Descartar" }));

    expect(linha(/intervalo entre horários/i)).toHaveAccessibleName("Intervalo entre horários 15 min");
    expect(chave(/mesmo dia/i)).toBeChecked();
  });

  it("um Salvar só grava as sete regras de uma vez", async () => {
    const falso = criarApiClientFalso();
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    await escolher(/intervalo entre horários/i, "30 min");
    await escolher(/cliente cancela/i, "24 h");

    expect(barra()).toHaveTextContent("2 mudanças");
    expect(screen.getAllByRole("button", { name: /salvar/i })).toHaveLength(1);
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(falso.estado.perfil).toMatchObject({ intervaloMinutos: 30, prazoCancelarHoras: 24 })
    );
  });

  it("ainda não decidida, sem mudança, a barra oferece salvar assim", async () => {
    montarPainel(<RegrasDeAgendamento />, criarApiClientFalso());

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    expect(barra()).toHaveTextContent(/ainda não decidid/i);
    expect(within(barra()).queryByRole("button", { name: "Descartar" })).toBeNull();
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("banner")).toHaveTextContent("Configurado"));
  });

  it("erro ao salvar aparece na própria barra, junto do Salvar", async () => {
    // A barra fica presa no pé; o aviso no topo da página ficaria fora da
    // vista com a página rolada ou no celular.
    const falso = criarApiClientFalso();
    vi.spyOn(falso.barbeiro, "atualizarMinhaBarbearia").mockRejectedValue({ mensagem: "Sem conexão agora." });
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("button", { name: /intervalo entre horários/i });
    await escolher(/intervalo entre horários/i, "30 min");
    await userEvent.click(within(barra()).getByRole("button", { name: "Salvar" }));

    expect(await within(barra()).findByText("Sem conexão agora.")).toBeInTheDocument();
  });

  it("abre no que a barbearia já decidiu", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.atualizarMinhaBarbearia({ janelaDias: 90, prazoCancelarHoras: 48, aceitaMesmoDia: false });
    montarPainel(<RegrasDeAgendamento />, falso);

    await screen.findByRole("button", { name: /até quando a agenda abre/i });
    expect(linha(/até quando a agenda abre/i)).toHaveAccessibleName("Até quando a agenda abre 90 dias");
    expect(linha(/cliente cancela/i)).toHaveAccessibleName("Cliente cancela até 48 h");
    expect(chave(/mesmo dia/i)).not.toBeChecked();
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
