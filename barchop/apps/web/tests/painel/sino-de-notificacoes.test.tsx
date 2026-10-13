import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { Notificacao } from "@barchop/types";
import { BarraDoTopo } from "../../src/painel/BarraDoTopo";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../src/painel/SessaoDoPainel";
import { tempoDesde } from "../../src/painel/notificacoes";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// jsdom não implementa matchMedia. Ver tests/painel/tema.test.ts.
function stubMatchMedia(): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function notificacao(parcial: Partial<Notificacao> & { id: string }): Notificacao {
  return {
    tipo: "agendamento",
    titulo: "Novo agendamento",
    texto: "Maria Souza marcou Corte para 15/10 às 10:00 com Rafael.",
    link: `/painel/agendamentos/a-${parcial.id}`,
    lida: false,
    criadaEm: new Date().toISOString(),
    ...parcial,
  };
}

function montar(notificacoes: Notificacao[] = []) {
  const falso = criarApiClientFalso({ notificacoes });
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <BarraDoTopo />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

async function abrirOSino() {
  await userEvent.click(await screen.findByRole("button", { name: /^Notificações/ }));
  return screen.getByRole("group", { name: "Notificações" });
}

describe("sino de notificações", () => {
  beforeEach(() => {
    localStorage.clear();
    stubMatchMedia();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
  });

  it("diz no nome do botão quantas não lidas há, e mostra o número", async () => {
    montar([notificacao({ id: "1" }), notificacao({ id: "2" }), notificacao({ id: "3", lida: true })]);

    const sino = await screen.findByRole("button", { name: "Notificações, 2 não lidas" });
    expect(sino).toHaveTextContent("2");
  });

  it("sem nada por ler: abre em Não lidas com Tudo em dia, e Ver lidas leva pra Todas", async () => {
    montar([notificacao({ id: "1", lida: true, titulo: "Agendamento cancelado" })]);

    const painel = await abrirOSino();

    expect(within(painel).getByRole("radio", { name: "Não lidas" })).toBeChecked();
    expect(await within(painel).findByText("Tudo em dia")).toBeInTheDocument();

    await userEvent.click(within(painel).getByRole("button", { name: "Ver lidas" }));

    expect(within(painel).getByRole("radio", { name: "Todas" })).toBeChecked();
    expect(await within(painel).findByText("Agendamento cancelado")).toBeInTheDocument();
  });

  it("clicar numa notificação marca como lida e abre o agendamento", async () => {
    montar([notificacao({ id: "1" }), notificacao({ id: "2", titulo: "Presença confirmada" })]);

    const painel = await abrirOSino();
    await userEvent.click(await within(painel).findByText("Presença confirmada"));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agendamentos/a-2");
    expect(
      await screen.findByRole("button", { name: "Notificações, 1 não lida" })
    ).toBeInTheDocument();
  });

  it("Marcar todas como lidas zera o número e mostra Tudo em dia", async () => {
    montar([notificacao({ id: "1" }), notificacao({ id: "2" })]);

    const painel = await abrirOSino();
    await userEvent.click(await within(painel).findByRole("button", { name: "Marcar todas como lidas" }));

    expect(await within(painel).findByText("Tudo em dia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notificações" })).not.toHaveTextContent(/\d/);
  });

  it("Avisos mostra só os da plataforma, e link de fora abre em outra aba", async () => {
    montar([
      notificacao({ id: "1" }),
      notificacao({
        id: "2",
        tipo: "plataforma",
        titulo: "Manutenção no domingo",
        link: "https://status.barchop.com.br",
      }),
    ]);

    const painel = await abrirOSino();
    await userEvent.click(within(painel).getByRole("radio", { name: "Avisos" }));

    await waitFor(() => expect(within(painel).queryByText("Novo agendamento")).toBeNull());
    const aviso = await within(painel).findByRole("link", { name: /Manutenção no domingo/ });
    expect(aviso).toHaveAttribute("href", "https://status.barchop.com.br");
    expect(aviso).toHaveAttribute("target", "_blank");
  });

  it("Avisos vazio diz que não há aviso do BarChop", async () => {
    montar([notificacao({ id: "1" })]);

    const painel = await abrirOSino();
    await userEvent.click(within(painel).getByRole("radio", { name: "Avisos" }));

    expect(await within(painel).findByText("Nenhum aviso do BarChop por aqui.")).toBeInTheDocument();
  });
});

describe("tempoDesde", () => {
  const agora = new Date("2026-10-13T15:00:00-03:00");

  it("fala em minutos e horas no mesmo dia, ontem, e data depois disso", () => {
    expect(tempoDesde("2026-10-13T14:59:40-03:00", agora)).toBe("agora");
    expect(tempoDesde("2026-10-13T14:55:00-03:00", agora)).toBe("há 5 min");
    expect(tempoDesde("2026-10-13T12:00:00-03:00", agora)).toBe("há 3 h");
    expect(tempoDesde("2026-10-12T09:00:00-03:00", agora)).toBe("ontem");
    expect(tempoDesde("2026-10-02T09:00:00-03:00", agora)).toBe("02/10");
  });
});
