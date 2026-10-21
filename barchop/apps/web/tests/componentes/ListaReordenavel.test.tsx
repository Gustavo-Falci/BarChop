import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListaReordenavel } from "../../src/componentes/ListaReordenavel";
import { descerUm, medirLinhas, tecla } from "../ajudantes/arrastar";

// A lista que o dono reordena arrastando (arrastar e reordenar, PR 3).
// Aqui o caminho do teclado — espaço pega, setas movem, espaço solta,
// Esc cancela —, que é o mesmo motor do mouse e do toque.
//
// O jsdom não mede layout: o dublê de tests/ajudantes/arrastar.ts dá
// altura às linhas.

interface Servico {
  id: string;
  nome: string;
}

const CORTE = { id: "s1", nome: "Corte" };
const BARBA = { id: "s2", nome: "Barba" };
const SOBRANCELHA = { id: "s3", nome: "Sobrancelha" };

function montar(aoReordenar = vi.fn(async (_ids: string[]) => {}), itens: Servico[] = [CORTE, BARBA, SOBRANCELHA]) {
  const arvore = (lista: Servico[]) => (
    <ListaReordenavel
      itens={lista}
      nomeDaLista="Serviços"
      rotulo={(servico) => servico.nome}
      aoReordenar={aoReordenar}
      renderizar={(servico, alca) => (
        <>
          {alca}
          <span>{servico.nome}</span>
        </>
      )}
    />
  );
  const resultado = render(arvore(itens));
  return { ...resultado, aoReordenar, trocarItens: (lista: Servico[]) => resultado.rerender(arvore(lista)) };
}

function nomesNaTela(): string[] {
  const lista = screen.getByRole("list", { name: "Serviços" });
  // Sem o ⋮⋮ da alça: ele é aria-hidden, mas entra no textContent.
  return within(lista)
    .getAllByRole("listitem")
    .map((item) => (item.textContent ?? "").replace("⋮⋮", ""));
}

function alcaDe(nome: string): HTMLElement {
  return screen.getByRole("button", { name: `Arrastar ${nome}` });
}

describe("ListaReordenavel", () => {
  let desfazer: () => void;
  beforeEach(() => {
    desfazer = medirLinhas();
  });

  afterEach(() => {
    desfazer();
  });

  it("mostra os itens na ordem recebida, cada um com a alça que diz o que move", () => {
    montar();

    expect(nomesNaTela()).toEqual(["Corte", "Barba", "Sobrancelha"]);
    expect(alcaDe("Corte")).toBeInTheDocument();
  });

  it("pelo teclado: espaço pega, seta pra baixo move, espaço solta e salva a lista inteira", async () => {
    const { aoReordenar } = montar();
    const alca = alcaDe("Corte");
    alca.focus();

    await tecla(alca, "Space");
    await tecla(alca, "ArrowDown");
    await tecla(alca, "Space");

    await waitFor(() => expect(aoReordenar).toHaveBeenCalledWith(["s2", "s1", "s3"]));
    expect(nomesNaTela()).toEqual(["Barba", "Corte", "Sobrancelha"]);
  });

  it("Esc cancela: nada salva e a ordem fica", async () => {
    const { aoReordenar } = montar();
    const alca = alcaDe("Corte");
    alca.focus();

    await tecla(alca, "Space");
    await tecla(alca, "ArrowDown");
    await tecla(alca, "Escape");

    expect(aoReordenar).not.toHaveBeenCalled();
    expect(nomesNaTela()).toEqual(["Corte", "Barba", "Sobrancelha"]);
  });

  it("avisa o leitor de tela em português", async () => {
    montar();
    const alca = alcaDe("Corte");
    alca.focus();

    await tecla(alca, "Space");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Corte pego. Posição 1 de 3.")
    );
  });

  it("se salvar der erro, a ordem volta e um aviso diz o que houve", async () => {
    const aoReordenar = vi.fn(async (_ids: string[]) => {
      throw new Error("rede caiu");
    });
    montar(aoReordenar);
    const alca = alcaDe("Corte");
    alca.focus();

    await tecla(alca, "Space");
    await tecla(alca, "ArrowDown");
    await tecla(alca, "Space");

    expect(await screen.findByRole("alert")).toHaveTextContent("Não deu pra salvar a ordem");
    expect(nomesNaTela()).toEqual(["Corte", "Barba", "Sobrancelha"]);
  });

  it("itens novos de quem usa a lista substituem a ordem da tela", () => {
    const { trocarItens } = montar();

    trocarItens([SOBRANCELHA, CORTE]);

    expect(nomesNaTela()).toEqual(["Sobrancelha", "Corte"]);
  });

  it("os mesmos itens de novo (outro array, mesma ordem) não desfazem a ordem otimista", async () => {
    // Quem usa a lista recalcula os grupos a cada render; enquanto o
    // salvamento não volta, a tela não pode piscar de volta pra antiga.
    const { trocarItens } = montar(vi.fn(() => new Promise<void>(() => {})));

    await descerUm(alcaDe("Corte"));
    trocarItens([CORTE, BARBA, SOBRANCELHA]);

    expect(nomesNaTela()).toEqual(["Barba", "Corte", "Sobrancelha"]);
  });
});
