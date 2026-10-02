import { beforeEach, describe, expect, it } from "vitest";
import {
  sessaoDoBarbeiro,
  sessaoDoCliente,
  sessaoDaBarbearia,
  encerrarSessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";

describe("armazenamento de sessão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("guarda e lê o token do barbeiro", () => {
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    expect(sessaoDoBarbeiro.ler()).toBe("jwt-barbeiro");
  });

  it("guarda o token do cliente por barbearia", () => {
    // O login do cliente é POST /barbearias/:slug/auth/cliente/login —
    // o token vale numa barbearia só, e uma chave única faria o token
    // de uma vazar pro fluxo de outra.
    sessaoDoCliente("gr-barber").gravar("jwt-gr");
    sessaoDoCliente("outra").gravar("jwt-outra");

    expect(sessaoDoCliente("gr-barber").ler()).toBe("jwt-gr");
    expect(sessaoDoCliente("outra").ler()).toBe("jwt-outra");
  });

  it("nunca mistura a identidade do barbeiro com a do cliente", () => {
    // Os dois escopos da API recusam o token um do outro; guardar na
    // mesma chave faria a primeira tela que misturasse as duas receber
    // 401 sem explicação.
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    expect(sessaoDoCliente("gr-barber").ler()).toBeNull();
  });

  it("limpa o token", () => {
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    sessaoDoBarbeiro.limpar();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });

  it("guarda o slug da barbearia numa chave própria", () => {
    sessaoDaBarbearia.gravar("gr-barber");

    expect(localStorage.getItem("sessao.barbearia")).toBe("gr-barber");
    expect(sessaoDaBarbearia.ler()).toBe("gr-barber");
  });

  it("encerrar a sessão do barbeiro limpa token e slug", () => {
    // Duas chaves, um logout: limpar só o token deixaria o slug de uma
    // barbearia sendo lido pela sessão da seguinte.
    sessaoDoBarbeiro.gravar("jwt");
    sessaoDaBarbearia.gravar("gr-barber");

    encerrarSessaoDoBarbeiro();

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
  });
});
