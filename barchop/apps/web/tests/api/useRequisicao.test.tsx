import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { useApi } from "../../src/api/ProvedorDaApi";
import { useRequisicao } from "../../src/api/useRequisicao";
import { navegacaoFalsa } from "../ajudantes/navegacao";

function TelaDeProva() {
  const api = useApi();
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.publico.perfilDaBarbearia("gr-barber"),
    []
  );

  if (carregando) return <p>carregando</p>;
  if (erro) return <p>erro: {erro.codigo}</p>;
  return (
    <div>
      <h1>{dados?.nome}</h1>
      <button onClick={recarregar}>recarregar</button>
    </div>
  );
}

describe("useRequisicao", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("mostra carregando e depois os dados", async () => {
    render(
      <ProvedorDaApi valor={criarApiClientFalso()}>
        <TelaDeProva />
      </ProvedorDaApi>
    );

    expect(screen.getByText("carregando")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent("GR Barber")
    );
  });

  it("entrega o ErroDaApi pra tela decidir pelo código", async () => {
    const falso = criarApiClientFalso();
    function TelaQueFalha() {
      const api = useApi();
      const { erro } = useRequisicao(
        () => api.publico.perfilDaBarbearia("nao-existe"),
        []
      );
      return <p>{erro ? `erro: ${erro.codigo}` : "sem erro"}</p>;
    }

    render(
      <ProvedorDaApi valor={falso}>
        <TelaQueFalha />
      </ProvedorDaApi>
    );

    await waitFor(() =>
      expect(screen.getByText("erro: nao_encontrado")).toBeInTheDocument()
    );
  });

  it("recarregar refaz a chamada", async () => {
    const falso = criarApiClientFalso();
    render(
      <ProvedorDaApi valor={falso}>
        <TelaDeProva />
      </ProvedorDaApi>
    );

    await waitFor(() => screen.getByRole("heading"));
    falso.estado.perfil = { ...falso.estado.perfil, nome: "Outro nome" };
    await userEvent.click(screen.getByRole("button", { name: "recarregar" }));

    await waitFor(() =>
      expect(screen.getByRole("heading")).toHaveTextContent("Outro nome")
    );
  });

  it("erro que não é da API não vira erro de código", async () => {
    // Rede caída, bug de tela: precisa aparecer como falha, não como
    // "carregando" pra sempre.
    function TelaQueQuebra() {
      const { erro, carregando } = useRequisicao(() => {
        throw new Error("boom");
      }, []);
      return <p>{carregando ? "carregando" : `erro: ${erro?.codigo}`}</p>;
    }

    render(
      <ProvedorDaApi valor={criarApiClientFalso()}>
        <TelaQueQuebra />
      </ProvedorDaApi>
    );

    await waitFor(() =>
      expect(screen.getByText("erro: erro_interno")).toBeInTheDocument()
    );
    expect(ErroDaApi).toBeDefined();
  });

  it("desmontagem enquanto requisição está em voo não tenta setState", async () => {
    // Quando o cliente toca voltar enquanto a requisição está pendente, a
    // tela sai do DOM. Sem a trava de vivo, o .then tentaria fazer
    // setDados num componente que já saiu — React reclamaria no console.
    let resolver: (value: unknown) => void;
    const promiseControlada = new Promise((resolve) => {
      resolver = resolve;
    });

    function TelaComPromiseControla() {
      const { carregando } = useRequisicao(
        () => promiseControlada,
        []
      );
      return <p>{carregando ? "carregando" : "pronto"}</p>;
    }

    const erroSpy = vi.spyOn(console, "error");
    const { unmount } = render(
      <ProvedorDaApi valor={criarApiClientFalso()}>
        <TelaComPromiseControla />
      </ProvedorDaApi>
    );

    expect(screen.getByText("carregando")).toBeInTheDocument();
    unmount();
    resolver!(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(erroSpy).not.toHaveBeenCalled();
    erroSpy.mockRestore();
  });
});
