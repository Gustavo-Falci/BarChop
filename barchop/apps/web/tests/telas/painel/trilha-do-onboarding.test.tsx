import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DashboardDoDia } from "../../../src/telas/painel/DashboardDoDia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, F2: a trilha de primeiros passos aparece no painel do dia pro
// dono, até os cinco passos estarem feitos. O estado vem da API; a tela
// só desenha e oferece a ação de cada passo.
const AGORA = new Date("2026-09-08T10:00:00-03:00");

async function trilha() {
  return screen.findByRole("region", { name: /primeiros passos/i });
}

function passo(regiao: HTMLElement, nome: RegExp) {
  return within(regiao).getByRole("listitem", { name: nome });
}

describe("trilha de primeiros passos", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("mostra os cinco passos, quantos faltam e onde resolver cada um", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />, criarApiClientFalso({ onboarding: { horarios: true } }));

    const regiao = await trilha();

    expect(regiao).toHaveTextContent(/1 de 5/);
    expect(within(passo(regiao, /horário/i)).getByText(/feito/i)).toBeInTheDocument();
    expect(within(passo(regiao, /serviço/i)).getByRole("link")).toHaveAttribute(
      "href",
      "/painel/servicos/novo"
    );
    expect(within(passo(regiao, /equipe/i)).getByRole("link")).toHaveAttribute(
      "href",
      "/painel/equipe/novo"
    );
    expect(within(passo(regiao, /primeira reserva/i)).queryByRole("link")).toBeNull();
  });

  it("passo de horário pendente leva pras Configurações", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);

    const regiao = await trilha();

    expect(within(passo(regiao, /horário/i)).getByRole("link")).toHaveAttribute(
      "href",
      "/painel/configuracoes/horarios"
    );
  });

  it("\"Trabalho sozinho\" marca o passo da equipe", async () => {
    montarPainel(<DashboardDoDia agora={AGORA} />);
    const regiao = await trilha();

    await userEvent.click(within(passo(regiao, /equipe/i)).getByRole("button", { name: /trabalho sozinho/i }));

    await waitFor(() => expect(within(passo(regiao, /equipe/i)).getByText(/feito/i)).toBeInTheDocument());
    expect(regiao).toHaveTextContent(/1 de 5/);
  });

  it("some quando os cinco passos estão feitos", async () => {
    montarPainel(
      <DashboardDoDia agora={AGORA} />,
      criarApiClientFalso({
        onboarding: { horarios: true, servicos: true, equipe: true, link: true, primeira_reserva: true },
      })
    );

    await screen.findByText(/agendamentos hoje/i);
    expect(screen.queryByRole("region", { name: /primeiros passos/i })).toBeNull();
  });

  it("não aparece pra quem não é dono, e nem pergunta à API", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });
    let perguntou = false;
    const original = falso.barbeiro.onboarding;
    falso.barbeiro.onboarding = async () => {
      perguntou = true;
      return original();
    };
    montarPainel(<DashboardDoDia agora={AGORA} />, falso);

    await screen.findByText(/agendamentos hoje/i);
    expect(screen.queryByRole("region", { name: /primeiros passos/i })).toBeNull();
    expect(perguntou).toBe(false);
  });

  it("se a trilha não carrega, o painel do dia segue sem ela", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.onboarding = async () => {
      throw new Error("API fora");
    };
    montarPainel(<DashboardDoDia agora={AGORA} />, falso);

    await screen.findByText(/agendamentos hoje/i);
    expect(screen.queryByRole("region", { name: /primeiros passos/i })).toBeNull();
  });
});
