import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListaReordenavel } from "../../src/componentes/ListaReordenavel";

// A lista que o dono reordena arrastando (arrastar e reordenar, PR 3).
// Aqui o caminho do teclado — espaço pega, setas movem, espaço solta,
// Esc cancela —, que é o mesmo motor do mouse e do toque.
//
// O jsdom não mede layout: todo elemento tem 0×0, e o teclado do dnd-kit
// procura o vizinho pela posição. O dublê dá a cada linha 50px de altura,
// na ordem em que ela está na lista, e à lista a soma delas — o
// `restrictToParentElement` não deixa a linha sair da lista, e uma lista
// de 50px prenderia tudo no lugar.
const ALTURA = 50;
const medirOriginal = HTMLElement.prototype.getBoundingClientRect;

function retangulo(topo: number, altura = ALTURA): DOMRect {
  return {
    x: 0,
    y: topo,
    top: topo,
    left: 0,
    width: 300,
    height: altura,
    right: 300,
    bottom: topo + altura,
    toJSON: () => ({}),
  } as DOMRect;
}

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

// O sensor de teclado só passa a ouvir as teclas seguintes num
// setTimeout(0) depois de pegar: sem esperar um tick, a seta chegaria
// antes de ele escutar.
async function tecla(elemento: HTMLElement, codigo: string) {
  await act(async () => {
    fireEvent.keyDown(elemento, { code: codigo, key: codigo === "Space" ? " " : codigo });
    await new Promise((pronto) => setTimeout(pronto, 0));
  });
}

describe("ListaReordenavel", () => {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.tagName === "UL") return retangulo(0, this.children.length * ALTURA);
      const linha = this.closest("li");
      if (!linha?.parentElement) return retangulo(0);
      return retangulo([...linha.parentElement.children].indexOf(linha) * ALTURA);
    };
  });

  afterEach(() => {
    HTMLElement.prototype.getBoundingClientRect = medirOriginal;
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
});
