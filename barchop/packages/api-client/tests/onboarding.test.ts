import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// Onda 1, F2: a trilha de primeiros passos do dono.
const ESTADO = {
  passos: [
    { id: "horarios", feito: true },
    { id: "servicos", feito: false },
    { id: "equipe", feito: false },
    { id: "link", feito: false },
    { id: "primeira_reserva", feito: false },
  ],
  completo: false,
};

function cliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt-do-barbeiro",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchFalso.mock.calls[0] as [string, RequestInit];
  return { url, init, cabecalhos: init.headers as Record<string, string> };
}

describe("api da trilha", () => {
  it("lê o estado da trilha com o token", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify(ESTADO), { status: 200 }));

    const estado = await cliente(fetchFalso).barbeiro.onboarding();

    const { url, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/onboarding");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-do-barbeiro");
    expect(estado.passos[0]).toEqual({ id: "horarios", feito: true });
  });

  it("marca e desmarca o trabalho sozinho, e devolve o estado novo", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify(ESTADO), { status: 200 }));

    await cliente(fetchFalso).barbeiro.marcarTrabalhoSozinho(true);

    const { url, init } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/onboarding");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ trabalhoSozinho: true });
  });

  it("avisa que o link foi copiado", async () => {
    const fetchFalso = vi.fn(async () => new Response(null, { status: 204 }));

    await cliente(fetchFalso).barbeiro.marcarLinkCopiado();

    const { url, init, cabecalhos } = chamada(fetchFalso);
    expect(url).toBe("https://api.exemplo.br/barbearias/me/link-copiado");
    expect(init.method).toBe("POST");
    expect(cabecalhos.Authorization).toBe("Bearer jwt-do-barbeiro");
  });
});

describe("dublê da trilha", () => {
  it("nasce sem passo feito, e a semente liga os que o teste quiser", async () => {
    expect((await criarApiClientFalso().barbeiro.onboarding()).completo).toBe(false);

    const semeado = criarApiClientFalso({ onboarding: { horarios: true, servicos: true } });
    const estado = await semeado.barbeiro.onboarding();

    expect(estado.passos.filter((p) => p.feito).map((p) => p.id)).toEqual(["horarios", "servicos"]);
  });

  it("trabalho sozinho e link copiado ligam os passos deles", async () => {
    const falso = criarApiClientFalso();

    const depois = await falso.barbeiro.marcarTrabalhoSozinho(true);
    await falso.barbeiro.marcarLinkCopiado();

    expect(depois.passos.find((p) => p.id === "equipe")?.feito).toBe(true);
    expect((await falso.barbeiro.onboarding()).passos.find((p) => p.id === "link")?.feito).toBe(true);
  });

  it("completo com os cinco", async () => {
    const falso = criarApiClientFalso({
      onboarding: { horarios: true, servicos: true, equipe: true, link: true, primeira_reserva: true },
    });

    expect((await falso.barbeiro.onboarding()).completo).toBe(true);
  });

  it("é do dono, como na API", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });

    await expect(falso.barbeiro.onboarding()).rejects.toMatchObject({ status: 403, codigo: "sem_permissao" });
    await expect(falso.barbeiro.marcarTrabalhoSozinho(true)).rejects.toMatchObject({ status: 403 });
    // Copiar o link é de qualquer um.
    await expect(falso.barbeiro.marcarLinkCopiado()).resolves.toBeUndefined();
  });
});
