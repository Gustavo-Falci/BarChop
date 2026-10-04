import { describe, expect, it, vi } from "vitest";
import { criarApiClient, criarApiClientFalso } from "../src/index";

// Onda 1, B4: jornada, serviços de cada membro e bloqueios no client.
// As rotas são as de apps/api/src/routers/equipe.ts e bloqueios.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(corpo === null ? null : JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

function chamada(fetchFalso: ReturnType<typeof vi.fn>) {
  const init = fetchFalso.mock.calls[0][1] as RequestInit;
  return {
    url: fetchFalso.mock.calls[0][0] as string,
    metodo: init.method,
    corpo: init.body === undefined ? undefined : JSON.parse(init.body as string),
  };
}

const SEMANA = [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  diaSemana,
  modo: "barbearia" as const,
  horaInicio: null,
  horaFim: null,
}));

describe("api da jornada, dos serviços e dos bloqueios", () => {
  it("lê e grava a jornada, devolvendo só a lista", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ jornada: SEMANA }));
    const api = client(fetchFalso);

    const lida = await api.barbeiro.jornada("m2");
    expect(chamada(fetchFalso)).toMatchObject({ url: "https://api.exemplo.br/equipe/m2/jornada", metodo: "GET" });
    expect(lida).toEqual(SEMANA);

    fetchFalso.mockClear();
    await api.barbeiro.salvarJornada("m2", SEMANA);
    expect(chamada(fetchFalso)).toMatchObject({ metodo: "PUT", corpo: { jornada: SEMANA } });
  });

  it("lê e troca os serviços do membro", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ servicoIds: ["s1"] }));
    const api = client(fetchFalso);

    expect(await api.barbeiro.servicosDoMembro("m2")).toEqual(["s1"]);
    fetchFalso.mockClear();
    await api.barbeiro.salvarServicosDoMembro("m2", ["s1"]);
    expect(chamada(fetchFalso)).toMatchObject({
      url: "https://api.exemplo.br/equipe/m2/servicos",
      metodo: "PUT",
      corpo: { servicoIds: ["s1"] },
    });
  });

  it("lista bloqueios do período, cria e apaga", async () => {
    const fetchFalso = vi.fn(async () => respostaJson({ bloqueios: [] }));
    const api = client(fetchFalso);

    await api.barbeiro.bloqueios("2037-01-01", "2037-01-31");
    expect(chamada(fetchFalso).url).toBe("https://api.exemplo.br/bloqueios?de=2037-01-01&ate=2037-01-31");

    fetchFalso.mockClear();
    await api.barbeiro.criarBloqueio({ barbeiroId: "m2", dataInicio: "2037-01-05", dataFim: "2037-01-05" });
    expect(chamada(fetchFalso)).toMatchObject({ url: "https://api.exemplo.br/bloqueios", metodo: "POST" });

    const apagar = vi.fn(async () => respostaJson(null, 204));
    await client(apagar).barbeiro.apagarBloqueio("x1");
    expect(chamada(apagar)).toMatchObject({ url: "https://api.exemplo.br/bloqueios/x1", metodo: "DELETE" });
  });
});

// O dublê recusa o que a API recusa: sem isso a tela não tem ramo de
// erro pra testar.
describe("dublê — jornada, serviços e bloqueios", () => {
  it("todo membro nasce acompanhando a barbearia e fazendo todos os serviços", async () => {
    const falso = criarApiClientFalso();

    expect((await falso.barbeiro.jornada("bb1")).every((dia) => dia.modo === "barbearia")).toBe(true);
    expect(await falso.barbeiro.servicosDoMembro("bb1")).toEqual(["s1", "s2"]);
  });

  it("grava a jornada e recusa dia próprio sem hora ou invertido", async () => {
    const falso = criarApiClientFalso();
    const comSegunda = (dia: object) => SEMANA.map((d) => (d.diaSemana === 1 ? { ...d, ...dia } : d));

    await expect(
      falso.barbeiro.salvarJornada("bb1", comSegunda({ modo: "proprio" }))
    ).rejects.toMatchObject({ status: 422, codigo: "horario_incompleto" });
    await expect(
      falso.barbeiro.salvarJornada("bb1", comSegunda({ modo: "proprio", horaInicio: "18:00", horaFim: "09:00" }))
    ).rejects.toMatchObject({ status: 422, codigo: "intervalo_invalido" });

    await falso.barbeiro.salvarJornada("bb1", comSegunda({ modo: "proprio", horaInicio: "13:00", horaFim: "20:00" }));
    expect((await falso.barbeiro.jornada("bb1"))[1]).toEqual({
      diaSemana: 1,
      modo: "proprio",
      horaInicio: "13:00",
      horaFim: "20:00",
    });
  });

  it("cria, lista pelo período e apaga bloqueios; recusa período invertido", async () => {
    const falso = criarApiClientFalso();

    await expect(
      falso.barbeiro.criarBloqueio({ barbeiroId: "bb1", dataInicio: "2037-01-09", dataFim: "2037-01-05" })
    ).rejects.toMatchObject({ status: 422, codigo: "periodo_invalido" });

    const criado = await falso.barbeiro.criarBloqueio({
      barbeiroId: "bb1",
      dataInicio: "2037-01-05",
      dataFim: "2037-01-09",
      motivo: "Férias",
    });
    expect(await falso.barbeiro.bloqueios("2037-01-01", "2037-01-31")).toHaveLength(1);
    expect(await falso.barbeiro.bloqueios("2037-02-01", "2037-02-28")).toHaveLength(0);

    await falso.barbeiro.apagarBloqueio(criado.id);
    expect(await falso.barbeiro.bloqueios("2037-01-01", "2037-01-31")).toHaveLength(0);
  });

  it("o profissional não cria bloqueio pro colega: 403", async () => {
    const falso = criarApiClientFalso({ papel: "profissional" });

    await expect(
      falso.barbeiro.criarBloqueio({ barbeiroId: "bb0", dataInicio: "2037-01-05", dataFim: "2037-01-05" })
    ).rejects.toMatchObject({ status: 403, codigo: "sem_permissao" });
  });
});
