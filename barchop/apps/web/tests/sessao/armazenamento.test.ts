import { beforeEach, describe, expect, it } from "vitest";
import {
  sessaoDoBarbeiro,
  sessaoDoCliente,
  sessaoDaBarbearia,
  sessaoDoSuporte,
  encerrarSessaoDoBarbeiro,
} from "../../src/sessao/armazenamento";

describe("armazenamento de sessão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // Auditoria de segurança de 15/11, SEC-003: o token mora no cookie
  // httpOnly que a API põe; aqui fica só a marca de que há sessão.
  it("o login grava só a marca de sessão, nunca o token", () => {
    sessaoDoBarbeiro.gravar("jwt-barbeiro");
    sessaoDoCliente("gr-barber").gravar("jwt-gr");

    expect(sessaoDoBarbeiro.ler()).toBe("cookie");
    const tudo = Object.values({ ...localStorage }).join(" ");
    expect(tudo).not.toContain("jwt-barbeiro");
    expect(tudo).not.toContain("jwt-gr");
  });

  it("token guardado antes do cookie sai na primeira leitura", () => {
    localStorage.setItem("sessao.barbeiro", "eyJhbGciOiJIUzI1NiJ9.antigo.assinatura");
    localStorage.setItem("sessao.suporte", "eyJhbGciOiJIUzI1NiJ9.antigo.assinatura");

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(localStorage.getItem("sessao.barbeiro")).toBeNull();
    expect(sessaoDoSuporte.ler()).toBeNull();
    expect(localStorage.getItem("sessao.suporte")).toBeNull();
  });

  it("guarda o token do cliente por barbearia", () => {
    // O login do cliente é POST /barbearias/:slug/auth/cliente/login —
    // o token vale numa barbearia só, e uma chave única faria o token
    // de uma vazar pro fluxo de outra.
    sessaoDoCliente("gr-barber").gravar("jwt-gr");
    sessaoDoCliente("outra").gravar("jwt-outra");

    expect(sessaoDoCliente("gr-barber").ler()).toBe("cookie");
    expect(sessaoDoCliente("outra").ler()).toBe("cookie");
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
