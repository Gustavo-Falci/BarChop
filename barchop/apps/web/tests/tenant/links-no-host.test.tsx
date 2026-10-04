import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { BarraDaBarbearia } from "../../src/fluxo/BarraDaBarbearia";
import { ProvedorDoHost } from "../../src/tenant/ProvedorDoHost";
import { EscolhaDoProfissional } from "../../src/telas/EscolhaDoProfissional";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Pelo host da barbearia (gr-barber.barchop.com.br) os links das telas
// saem sem o slug na frente: o proxy reescreve `/agendar` pra
// `/gr-barber/agendar`, e o que aparece na barra de endereço é o limpo.
function montarNoHost(tela: ReactElement, falso = criarApiClientFalso()) {
  render(
    <ProvedorDoHost barbearia="gr-barber">
      <ProvedorDaApi valor={falso}>{tela}</ProvedorDaApi>
    </ProvedorDoHost>
  );
  return falso;
}

describe("links no host da barbearia", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/entrar" }));

  it("a barra leva pra raiz e o Entrar pra /entrar", async () => {
    montarNoHost(<BarraDaBarbearia />);

    expect(await screen.findByRole("link", { name: "GR Barber" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/entrar");
  });

  it("a barra some na página da barbearia, que lá é a raiz", () => {
    // Sob a reescrita o usePathname devolve o caminho do navegador: "/".
    navegacaoFalsa.redefinir({ pathname: "/" });
    const falso = criarApiClientFalso();
    falso.publico.perfilDaBarbearia = async (slug: string) => {
      throw new ErroDaApi(500, "erro_interno", slug);
    };
    montarNoHost(<BarraDaBarbearia />, falso);

    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("os passos do fluxo navegam sem o slug", async () => {
    navegacaoFalsa.redefinir({ pathname: "/agendar/profissional", query: { servicos: "s1" } });
    const falso = criarApiClientFalso({ horariosLivres: ["15:00"] });
    falso.estado.perfil = {
      ...falso.estado.perfil,
      barbeiros: [
        { id: "bb1", nome: "Rafael", servicoIds: ["s1"], fotoUrl: null },
        { id: "bb2", nome: "Ana", servicoIds: ["s1"], fotoUrl: null },
      ],
    };
    montarNoHost(<EscolhaDoProfissional />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /qualquer um/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/agendar/data?servicos=s1");
  });

  it("de outra barbearia no host, os links ficam com o slug", async () => {
    // O cabeçalho do proxy diz uma barbearia e a rota é de outra: nada
    // de cortar o caminho de quem não é dona do host.
    render(
      <ProvedorDoHost barbearia="outra">
        <ProvedorDaApi valor={criarApiClientFalso()}>
          <BarraDaBarbearia />
        </ProvedorDaApi>
      </ProvedorDoHost>
    );

    expect(await screen.findByRole("link", { name: "GR Barber" })).toHaveAttribute(
      "href",
      "/gr-barber"
    );
  });
});
