import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDoPainel } from "../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel, usePainel } from "../../src/painel/SessaoDoPainel";
import {
  sessaoDaBarbearia,
  sessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";
import { apiDoPainel } from "../../src/sessao/cliente-da-api";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function Espiao() {
  const { perfil, slug, sair } = usePainel();
  return (
    <div>
      <span>{perfil.nome}</span>
      <span>slug: {slug}</span>
      <button onClick={sair}>Sair</button>
    </div>
  );
}

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <Espiao />
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

describe("sessão do painel", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel" });
  });

  it("sem token, manda pra tela de entrar e não renderiza o conteúdo", async () => {
    montar();

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar")
    );
    expect(screen.queryByText("Rafael")).not.toBeInTheDocument();
  });

  it("com token, carrega o perfil uma vez e o entrega às telas", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");

    montar();

    expect(await screen.findByText("Rafael")).toBeInTheDocument();
    expect(screen.getByText("slug: gr-barber")).toBeInTheDocument();
  });

  it("401 no carregamento do perfil encerra a sessão e volta pra entrar", async () => {
    // 401 no meio da sessão é evento normal, não canto raro: o token
    // vale 7 dias e o hook da API consulta o banco a cada requisição.
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    const falso = criarApiClientFalso();
    falso.barbeiro.meuPerfil = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };

    montar(falso);

    await waitFor(() => expect(sessaoDoBarbeiro.ler()).toBeNull());
    expect(sessaoDaBarbearia.ler()).toBeNull();
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
  });

  it("acompanha a troca do slug sem remontar (link trocado em Configurações)", async () => {
    sessaoDoBarbeiro.gravar("jwt-falso-barbeiro");
    sessaoDaBarbearia.gravar("gr-barber");
    montar();
    expect(await screen.findByText("slug: gr-barber")).toBeInTheDocument();

    act(() => sessaoDaBarbearia.gravar("gr-barber-centro"));

    expect(await screen.findByText("slug: gr-barber-centro")).toBeInTheDocument();
  });

  // F4: o link só muda pelo suporte, longe do painel. A sessão guarda o
  // slug desde o login; sem reler, depois de uma aprovação o Novo
  // agendamento consultaria a disponibilidade pelo link velho (as rotas
  // públicas só aceitam o atual) e a trilha copiaria o link velho.
  it("ao abrir, relê o link da barbearia e grava o atual na sessão", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("link-velho");

    montar();

    expect(await screen.findByText("slug: gr-barber")).toBeInTheDocument();
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
  });

  it("se a releitura do link falhar, o painel abre com o link guardado", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    const falso = criarApiClientFalso();
    falso.barbeiro.minhaBarbearia = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };

    montar(falso);

    expect(await screen.findByText("Rafael")).toBeInTheDocument();
    expect(screen.getByText("slug: gr-barber")).toBeInTheDocument();
    expect(sessaoDoBarbeiro.ler()).toBe("jwt");
  });

  it("sair limpa as duas chaves", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    montar();

    await userEvent.click(await screen.findByRole("button", { name: "Sair" }));

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
  });

  // O teste "401 no carregamento do perfil" acima passa pelo `.catch(sair)`
  // do próprio efeito de guarda — ele não prova nada sobre `apiDoPainel`,
  // porque `montar()` usa o dublê, que nunca aciona o `aoExpirarSessao` de
  // verdade. Este teste cobre o caso que faltava: uma tela JÁ montada (o
  // layout do painel não remonta entre rotas irmãs) recebendo um 401 de
  // uma chamada qualquer, via a fábrica de produção — não o dublê.
  it("um 401 de uma chamada depois do mount (não da guarda) também limpa e navega, pelo mesmo sair", async () => {
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");
    montar();

    // Garante que o efeito de registro (`registrarSaidaDoPainel`) já
    // rodou: ele não depende do perfil, mas esperar o perfil aparecer
    // deixa o teste na mesma posição dos outros deste arquivo.
    await screen.findByText("Rafael");
    navegacaoFalsa.replace.mockClear();

    // Client de produção de verdade, independente do dublê montado
    // acima — simula a chamada que uma tela qualquer faria depois que o
    // token de 7 dias já não vale mais.
    const fetch401 = vi.fn(
      async () =>
        new Response(JSON.stringify({ erro: "nao_autenticado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );
    const apiDeUmaTela = apiDoPainel(fetch401 as unknown as typeof globalThis.fetch);

    await expect(apiDeUmaTela.barbeiro.clientes()).rejects.toThrow();

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
    expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/painel/entrar");
  });
});
