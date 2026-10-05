import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import type { SementeFalsa } from "@barchop/api-client";
import { sessaoDoBarbeiro, sessaoDoSuporte } from "../../../src/sessao/armazenamento";
import { ProvedorDoSuporte } from "../../../src/suporte/ProvedorDoSuporte";
import { FilaDoSuporte } from "../../../src/telas/suporte/FilaDoSuporte";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Onda 1, F4d: a fila de pedidos de troca do link. Aprovar troca o link
// na hora; recusar pede uma resposta, que o dono lê em Configurações.
const PEDIDO_DA_GR = {
  id: "pedido-gr",
  slugPedido: "gr-barber-centro",
  motivo: "mudamos de endereço",
  status: "pendente" as const,
  resposta: null,
  criadoEm: "2026-10-04T12:00:00.000Z",
  decididoEm: null,
  barbearia: { id: "b1", nome: "GR Barber", slug: "gr-barber" },
};

const PEDIDO_DA_NAVALHA = {
  ...PEDIDO_DA_GR,
  id: "pedido-navalha",
  slugPedido: "navalha-de-ouro",
  motivo: null,
  criadoEm: "2026-10-03T09:00:00.000Z",
  barbearia: { id: "b2", nome: "Navalha", slug: "navalha" },
};

function montar(semente: SementeFalsa = { solicitacoesDeLink: [PEDIDO_DA_GR, PEDIDO_DA_NAVALHA] }) {
  const falso = criarApiClientFalso(semente);
  render(
    <ProvedorDoSuporte valor={falso.suporte}>
      <FilaDoSuporte />
    </ProvedorDoSuporte>
  );
  return falso;
}

function pedidoDa(barbearia: RegExp) {
  return screen.getByRole("article", { name: barbearia });
}

describe("fila do suporte", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/suporte" });
  });

  it("sem sessão do suporte, manda pro entrar do suporte — a do painel não serve", async () => {
    sessaoDoBarbeiro.gravar("jwt-do-barbeiro");

    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar")
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("lista os pendentes, do mais antigo pro mais novo, com o link atual, o pedido e o motivo", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();

    const pedidos = await screen.findAllByRole("article");
    expect(pedidos.map((p) => p.getAttribute("aria-label"))).toEqual([
      expect.stringMatching(/Navalha/),
      expect.stringMatching(/GR Barber/),
    ]);
    const daGr = pedidoDa(/GR Barber/);
    expect(within(daGr).getByText("gr-barber")).toBeInTheDocument();
    expect(within(daGr).getByText("gr-barber-centro")).toBeInTheDocument();
    expect(within(daGr).getByText(/mudamos de endereço/)).toBeInTheDocument();
  });

  it("sem pedido pendente, diz que a fila está vazia", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar({});

    expect(await screen.findByText(/nenhum pedido/i)).toBeInTheDocument();
  });

  it("aprovar troca o link e tira o pedido da fila", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = montar();

    await screen.findAllByRole("article");
    await userEvent.click(within(pedidoDa(/GR Barber/)).getByRole("button", { name: /aprovar/i }));

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: /GR Barber/ })).not.toBeInTheDocument()
    );
    expect(falso.estado.perfil.slug).toBe("gr-barber-centro");
    expect(screen.getByRole("article", { name: /Navalha/ })).toBeInTheDocument();
  });

  it("link tomado no meio: avisa no pedido, que fica pra ser recusado", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = montar({ solicitacoesDeLink: [PEDIDO_DA_GR], slugsEmUso: ["gr-barber-centro"] });

    await screen.findAllByRole("article");
    await userEvent.click(within(pedidoDa(/GR Barber/)).getByRole("button", { name: /aprovar/i }));

    expect(await within(pedidoDa(/GR Barber/)).findByText(/já está em uso/i)).toBeInTheDocument();
    expect(within(pedidoDa(/GR Barber/)).getByText(/recuse com uma resposta/i)).toBeInTheDocument();
    expect(falso.estado.perfil.slug).toBe("gr-barber");
  });

  it("recusar exige a resposta e tira o pedido da fila", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = montar();

    await screen.findAllByRole("article");
    const daGr = pedidoDa(/GR Barber/);
    await userEvent.click(within(daGr).getByRole("button", { name: /^recusar/i }));
    await userEvent.click(within(daGr).getByRole("button", { name: /confirmar recusa/i }));
    expect(await within(daGr).findByText(/escreva a resposta/i)).toBeInTheDocument();

    await userEvent.type(within(daGr).getByLabelText(/resposta pro dono/i), "Nome de outra marca.");
    await userEvent.click(within(daGr).getByRole("button", { name: /confirmar recusa/i }));

    await waitFor(() =>
      expect(screen.queryByRole("article", { name: /GR Barber/ })).not.toBeInTheDocument()
    );
    expect(falso.estado.solicitacoesDeLink!.find((s) => s.id === "pedido-gr")).toMatchObject({
      status: "recusada",
      resposta: "Nome de outra marca.",
    });
  });

  it("401 na fila encerra a sessão do suporte e volta pro entrar", async () => {
    sessaoDoSuporte.gravar("jwt-vencido");
    const falso = criarApiClientFalso();
    falso.suporte.solicitacoes = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    render(
      <ProvedorDoSuporte valor={falso.suporte}>
        <FilaDoSuporte />
      </ProvedorDoSuporte>
    );

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar")
    );
    expect(sessaoDoSuporte.ler()).toBeNull();
  });

  it("sair limpa só a sessão do suporte", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    sessaoDoBarbeiro.gravar("jwt-do-barbeiro");
    montar();

    await userEvent.click(await screen.findByRole("button", { name: /sair/i }));

    expect(sessaoDoSuporte.ler()).toBeNull();
    expect(sessaoDoBarbeiro.ler()).toBe("jwt-do-barbeiro");
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar");
  });
});
