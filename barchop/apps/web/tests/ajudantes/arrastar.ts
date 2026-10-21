import { act, fireEvent } from "@testing-library/react";

// Arrastar pelo teclado no jsdom (ListaReordenavel e as telas que a usam).
//
// O jsdom não mede layout: todo elemento tem 0×0, e o teclado do dnd-kit
// procura o vizinho pela posição. `medirLinhas` dá a cada linha 50px de
// altura, na ordem em que ela está na lista, e à lista a soma delas — o
// `restrictToParentElement` não deixa a linha sair da lista, e uma lista
// de 50px prenderia tudo no lugar. Devolve quem desfaz.
const ALTURA = 50;

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

export function medirLinhas(): () => void {
  const original = HTMLElement.prototype.getBoundingClientRect;
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.tagName === "UL") return retangulo(0, this.children.length * ALTURA);
    const linha = this.closest("li");
    if (!linha?.parentElement) return retangulo(0);
    return retangulo([...linha.parentElement.children].indexOf(linha) * ALTURA);
  };
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original;
  };
}

// O sensor de teclado só passa a ouvir as teclas seguintes num
// setTimeout(0) depois de pegar: sem esperar um tick, a seta chegaria
// antes de ele escutar.
export async function tecla(elemento: HTMLElement, codigo: string) {
  await act(async () => {
    fireEvent.keyDown(elemento, { code: codigo, key: codigo === "Space" ? " " : codigo });
    await new Promise((pronto) => setTimeout(pronto, 0));
  });
}

// Pega pela alça, desce uma posição e solta.
export async function descerUm(alca: HTMLElement) {
  alca.focus();
  await tecla(alca, "Space");
  await tecla(alca, "ArrowDown");
  await tecla(alca, "Space");
}
