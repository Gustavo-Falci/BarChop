import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { gravarDadosDoCliente } from "../../src/fluxo/dadosDoCliente";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// O link do horário (06/11): quem agenda sem conta e sem e-mail não
// tinha como cancelar sozinho. A tela de sucesso entrega o link com as
// instruções, e o Concluir só libera depois de 5 segundos de leitura.
const MANHA = new Date("2026-09-10T08:00:00-03:00");
const QUERY = { servicos: "s1,s2", data: "2026-09-10", hora: "09:00" };

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Confirmacao agora={MANHA} />
    </ProvedorDaApi>
  );
  return falso;
}

async function agendarSemConta(
  falso = criarApiClientFalso(),
  usuario: ReturnType<typeof userEvent.setup> = userEvent.setup()
) {
  gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
  montar(falso);
  await usuario.click(await screen.findByRole("button", { name: /confirmar agendamento/i }));
  await screen.findByText(/agendamento confirmado/i);
  return falso;
}

const cartao = () => screen.getByRole("region", { name: "Pra cancelar ou confirmar depois" });

describe("confirmação: link do horário", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navegacaoFalsa.redefinir({ query: QUERY });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sem conta, mostra o cartão com as instruções numeradas", async () => {
    const falso = criarApiClientFalso();
    falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 2 };
    await agendarSemConta(falso);

    const itens = within(cartao()).getAllByRole("listitem");
    expect(itens).toHaveLength(5);
    expect(itens[0]).toHaveTextContent("Guarde o link do seu horário.");
    expect(itens[1]).toHaveTextContent("Dá até 2 horas antes do horário.");
    expect(itens[2]).toHaveTextContent("Confirmar presença");
    expect(itens[3]).toHaveTextContent("Passou do prazo?");
    expect(itens[4]).toHaveTextContent("Não repasse o link.");
  });

  it("com prazo 0, diz que dá até o horário começar; com 1, no singular", async () => {
    const falso = criarApiClientFalso();
    falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 0 };
    await agendarSemConta(falso);
    expect(cartao()).toHaveTextContent("Dá até o horário começar.");

    cleanup();
    sessionStorage.clear();
    const outro = criarApiClientFalso();
    outro.estado.perfil = { ...outro.estado.perfil, prazoCancelarHoras: 1 };
    await agendarSemConta(outro);
    expect(cartao()).toHaveTextContent("Dá até 1 hora antes do horário.");
  });

  it("passado o prazo, aponta o WhatsApp da casa; sem WhatsApp, o telefone", async () => {
    const falso = criarApiClientFalso();
    falso.estado.perfil = { ...falso.estado.perfil, whatsapp: "(11) 97777-6666" };
    await agendarSemConta(falso);
    expect(within(cartao()).getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/5511977776666"
    );

    cleanup();
    sessionStorage.clear();
    await agendarSemConta();
    expect(within(cartao()).getByRole("link", { name: "(11) 3333-4444" })).toHaveAttribute(
      "href",
      "tel:1133334444"
    );
  });

  it("manda o link pro WhatsApp do próprio cliente", async () => {
    await agendarSemConta();

    const link = within(cartao()).getByRole("link", { name: "Mandar pro meu WhatsApp" });
    const url = new URL(link.getAttribute("href")!);
    expect(`${url.origin}${url.pathname}`).toBe("https://wa.me/5511999998888");
    expect(url.searchParams.get("text")).toMatch(
      /https:\/\/gr-barber\.barchop\.com\.br\/lembrete\/lembrete-/
    );
  });

  it("copia o link e avisa", async () => {
    const usuario = userEvent.setup();
    await agendarSemConta(criarApiClientFalso(), usuario);

    await usuario.click(within(cartao()).getByRole("button", { name: "Copiar o link" }));

    expect(await navigator.clipboard.readText()).toMatch(/\/lembrete\/lembrete-/);
    expect(within(cartao()).getByRole("status")).toHaveTextContent("Link copiado");
    expect(within(cartao()).getByRole("button", { name: "Copiar de novo" })).toBeInTheDocument();
  });

  it("o Concluir fica travado 5 segundos; depois apaga o cartão e volta pra barbearia", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const usuario = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await agendarSemConta(criarApiClientFalso(), usuario);

    expect(within(cartao()).getByRole("button", { name: "Concluir em 5 s" })).toBeDisabled();

    // Segundo a segundo, como a pessoa vê: cada passo agenda o próximo.
    for (let segundo = 4; segundo >= 1; segundo--) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(within(cartao()).getByRole("button", { name: `Concluir em ${segundo} s` })).toBeDisabled();
    }
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const concluir = within(cartao()).getByRole("button", { name: "Concluir" });
    expect(concluir).toBeEnabled();
    await usuario.click(concluir);

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/gr-barber");
    expect(sessionStorage.getItem("agendamento.confirmado")).toBeNull();
  });

  it("recarregar a página traz o cartão de volta, sem agendar de novo", async () => {
    const falso = await agendarSemConta();
    const quantos = falso.estado.agendamentos.length;

    cleanup();
    montar(falso);

    expect(await screen.findByText(/agendamento confirmado/i)).toBeInTheDocument();
    expect(cartao()).toBeInTheDocument();
    expect(falso.estado.agendamentos).toHaveLength(quantos);
  });

  it("outro agendamento na mesma aba mostra o formulário, não o cartão antigo", async () => {
    const falso = await agendarSemConta();

    cleanup();
    navegacaoFalsa.redefinir({ query: { ...QUERY, hora: "10:00" } });
    montar(falso);

    expect(await screen.findByRole("button", { name: /confirmar agendamento/i })).toBeInTheDocument();
    expect(screen.queryByText(/agendamento confirmado/i)).toBeNull();
  });

  it("o link vai junto no arquivo da agenda", async () => {
    const criarUrl = vi.fn((_blob: Blob) => "blob:agendamento");
    Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() });
    const usuario = userEvent.setup();
    await agendarSemConta(criarApiClientFalso(), usuario);

    await usuario.click(screen.getByRole("button", { name: /adicionar à agenda/i }));

    const texto = (await criarUrl.mock.calls[0][0].text()).replace(/\r\n /g, "");
    expect(texto).toMatch(/DESCRIPTION:Pra confirmar ou cancelar: https:\/\/gr-barber\.barchop\.com\.br\/lembrete\//);
  });

  it("logada, não mostra o cartão: tem Minha conta e o Voltar ao início", async () => {
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
    montar();
    await screen.findByText("João Silva");
    await userEvent.click(await screen.findByRole("button", { name: /confirmar agendamento/i }));
    await screen.findByText(/agendamento confirmado/i);

    expect(screen.queryByRole("region", { name: "Pra cancelar ou confirmar depois" })).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toBeInTheDocument();
  });

  it("sem link (API sem endereço), fica a tela de antes", async () => {
    const falso = criarApiClientFalso();
    falso.estado.semLinkDoHorario = true;
    await agendarSemConta(falso);

    expect(screen.queryByRole("region", { name: "Pra cancelar ou confirmar depois" })).toBeNull();
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toBeInTheDocument();
  });
});
