import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiDoBarbeiro, apiDoPainel, registrarSaidaDoPainel } from "../../src/sessao/cliente-da-api";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../src/sessao/armazenamento";

describe("api do barbeiro ligada à sessão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("limpa o token guardado quando a API responde 401", async () => {
    // Token de 7 dias com hook que consulta o banco a cada requisição:
    // 401 no meio da sessão é evento normal, e a tela precisa voltar
    // pro login com o armazenamento já limpo.
    sessaoDoBarbeiro.gravar("jwt-vencido");

    const fetchFalso = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ erro: "nao_autenticado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );

    const api = apiDoBarbeiro(fetchFalso as unknown as typeof globalThis.fetch);

    await expect(api.meuPerfil()).rejects.toThrow();
    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });
});

function respostaDe401() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ erro: "nao_autenticado" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      })
  );
}

// apiDoPainel não tinha teste direto nenhum: o dublê (`criarApiClientFalso`)
// entra no lugar dele em todo teste de tela via `ProvedorDoPainel`'s
// `valor`, e nunca passa pelo `aoExpirarSessao` de verdade. Estes testes
// exercitam a fábrica de produção isoladamente.
describe("api do painel ligada à sessão", () => {
  beforeEach(() => {
    localStorage.clear();
    // Nenhum `sair` registrado: sem isto, um teste anterior que
    // registrasse um `sair` vazaria pra este arquivo, porque
    // `registrarSaidaDoPainel` guarda estado de módulo.
    registrarSaidaDoPainel(null);
  });

  it("um 401 limpa as duas chaves da sessão do barbeiro, não só o token", async () => {
    // Se o handler voltasse a chamar só `sessaoDoBarbeiro.limpar()` (o
    // bug original), esta asserção do slug continuaria vendo o valor
    // antigo — só `encerrarSessaoDoBarbeiro()` limpa os dois.
    sessaoDoBarbeiro.gravar("jwt-vencido");
    sessaoDaBarbearia.gravar("gr-barber");

    const api = apiDoPainel(respostaDe401() as unknown as typeof globalThis.fetch);

    await expect(api.barbeiro.meuPerfil()).rejects.toThrow();

    expect(sessaoDoBarbeiro.ler()).toBeNull();
    expect(sessaoDaBarbearia.ler()).toBeNull();
  });

  it("um 401 aciona o sair registrado por SessaoDoPainel", async () => {
    const sair = vi.fn();
    registrarSaidaDoPainel(sair);

    const api = apiDoPainel(respostaDe401() as unknown as typeof globalThis.fetch);

    await expect(api.barbeiro.meuPerfil()).rejects.toThrow();

    expect(sair).toHaveBeenCalledTimes(1);
  });

  it("sem ninguém registrado, um 401 ainda limpa a sessão — só não navega", async () => {
    sessaoDoBarbeiro.gravar("jwt-vencido");

    const api = apiDoPainel(respostaDe401() as unknown as typeof globalThis.fetch);

    await expect(api.barbeiro.meuPerfil()).rejects.toThrow();

    expect(sessaoDoBarbeiro.ler()).toBeNull();
  });
});
