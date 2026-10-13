import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { SementeFalsa } from "@barchop/api-client";
import { sessaoDoSuporte } from "../../../src/sessao/armazenamento";
import { ProvedorDoSuporte } from "../../../src/suporte/ProvedorDoSuporte";
import { AvisosDoSuporte } from "../../../src/telas/suporte/AvisosDoSuporte";
import { FilaDoSuporte } from "../../../src/telas/suporte/FilaDoSuporte";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// Plano barra-do-topo, PR D: o dono do BarChop publica avisos que caem
// no sino de todos os membros ativos, na aba Avisos.
const MANUTENCAO = {
  id: "aviso-1",
  titulo: "Manutenção no domingo",
  texto: "O painel fica fora do ar das 2h às 3h.",
  link: null,
  criadoEm: "2026-10-12T12:00:00.000Z",
  destinatarios: 3,
  lidas: 1,
};

function montar(semente: SementeFalsa = { avisosPublicados: [MANUTENCAO] }) {
  const falso = criarApiClientFalso(semente);
  render(
    <ProvedorDoSuporte valor={falso.suporte}>
      <AvisosDoSuporte />
    </ProvedorDoSuporte>
  );
  return falso;
}

describe("avisos do suporte", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/suporte/avisos" });
  });

  it("sem sessão do suporte, manda pro entrar do suporte", async () => {
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/suporte/entrar")
    );
  });

  it("lista os publicados com quantos leram", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();

    const publicado = await screen.findByRole("article", { name: "Manutenção no domingo" });
    expect(within(publicado).getByText("O painel fica fora do ar das 2h às 3h.")).toBeInTheDocument();
    expect(within(publicado).getByText("1 de 3 leram")).toBeInTheDocument();
  });

  it("publicar põe o aviso no topo da lista, diz pra quantos foi e limpa o formulário", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    montar();
    await screen.findByRole("article", { name: "Manutenção no domingo" });

    await userEvent.type(screen.getByLabelText("Título"), "Sino novo no painel");
    await userEvent.type(screen.getByLabelText("Texto"), "Agora as notificações ficam no canto de cima.");
    await userEvent.type(screen.getByLabelText(/Link/), "/painel/ajuda");
    await userEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));

    expect(await screen.findByText(/Aviso publicado para \d+ pessoas?\./)).toBeInTheDocument();
    const artigos = screen.getAllByRole("article");
    expect(artigos[0]).toHaveAccessibleName("Sino novo no painel");
    expect(within(artigos[0]!).getByText(/^0 de \d+ leram$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Título")).toHaveValue("");
    expect(screen.getByLabelText("Texto")).toHaveValue("");
  });

  it("não publica sem título e texto, nem com link que não seja do painel ou https", async () => {
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = montar({ avisosPublicados: [] });
    await screen.findByText("Nenhum aviso publicado ainda.");

    await userEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));
    expect(screen.getByText("Escreva o título.")).toBeInTheDocument();
    expect(screen.getByText("Escreva o texto do aviso.")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Título"), "Golpe");
    await userEvent.type(screen.getByLabelText("Texto"), "Clique aqui.");
    await userEvent.type(screen.getByLabelText(/Link/), "http://site.com");
    await userEvent.click(screen.getByRole("button", { name: "Publicar aviso" }));

    expect(
      screen.getByText("Use um caminho do painel (/painel/…) ou um endereço https://.")
    ).toBeInTheDocument();
    expect(await falso.suporte.avisos()).toHaveLength(0);
  });
});

describe("caminho entre as telas do suporte", () => {
  it("a fila de pedidos leva aos avisos, e os avisos voltam pra fila", async () => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/suporte" });
    sessaoDoSuporte.gravar("jwt-falso-suporte");
    const falso = criarApiClientFalso({});
    const { unmount } = render(
      <ProvedorDoSuporte valor={falso.suporte}>
        <FilaDoSuporte />
      </ProvedorDoSuporte>
    );

    expect(await screen.findByRole("link", { name: "Avisos" })).toHaveAttribute(
      "href",
      "/painel/suporte/avisos"
    );
    unmount();

    montar();
    expect(await screen.findByRole("link", { name: /Pedidos de troca de link/ })).toHaveAttribute(
      "href",
      "/painel/suporte"
    );
  });
});
