import { beforeEach, describe, expect, it } from "vitest";
import {
  gravarDadosDoCliente,
  lerDadosDoCliente,
  limparDadosDoCliente,
} from "../../src/fluxo/dadosDoCliente";

describe("dados do cliente no sessionStorage", () => {
  beforeEach(() => sessionStorage.clear());

  it("guarda e lê nome e telefone", () => {
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    expect(lerDadosDoCliente()).toEqual({
      nome: "João",
      telefone: "(11) 99999-8888",
    });
  });

  it("devolve null quando não há nada guardado", () => {
    expect(lerDadosDoCliente()).toBeNull();
  });

  it("sobrevive a conteúdo corrompido em vez de estourar", () => {
    // Outra aba, extensão, versão antiga: o valor pode não ser o JSON
    // que esta versão grava, e a tela de confirmação não pode quebrar
    // por isso — ela trata como "não tem dados" e volta um passo.
    sessionStorage.setItem("agendamento.cliente", "{ nao é json");
    expect(lerDadosDoCliente()).toBeNull();
  });

  it("limpa depois que o agendamento é criado", () => {
    gravarDadosDoCliente({ nome: "João", telefone: "(11) 99999-8888" });
    limparDadosDoCliente();
    expect(lerDadosDoCliente()).toBeNull();
  });
});
