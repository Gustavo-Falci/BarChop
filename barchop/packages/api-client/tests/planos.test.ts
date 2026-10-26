import { describe, expect, it, vi } from "vitest";
import type { MembroDaEquipe, PlanoDoPainel } from "@barchop/types";
import { ErroDaApi, criarApiClient, criarApiClientFalso } from "../src/index";

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3, PR 7a do plano planos-de-assinatura). Rotas de
// apps/api/src/routers/planos.ts e o desativar de equipe.ts.

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cliente(fetchFalso: ReturnType<typeof vi.fn>) {
  return criarApiClient({
    baseUrl: "https://api.exemplo.br",
    obterToken: () => "jwt",
    fetch: fetchFalso as unknown as typeof globalThis.fetch,
  });
}

describe("api dos planos", () => {
  it("lista, cria, edita e liga a vitrine nas rotas da API", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ vitrine: false, podeCriarDaCasa: true, podeCriarProprio: true, planos: [] }))
      .mockResolvedValueOnce(respostaJson({ id: "pl1" }, 201))
      .mockResolvedValueOnce(respostaJson({ id: "pl1" }))
      .mockResolvedValueOnce(respostaJson({ ligada: true }));
    const api = cliente(fetchFalso);
    const novo = {
      daCasa: true,
      nome: "Corte ilimitado",
      ciclo: "mensal" as const,
      precoCentavos: 12000,
      fixoPorAtendimentoCentavos: 2500,
      aceitaOnline: false,
      aceitaNoBalcao: true,
      servicos: [{ servicoId: "s1", usosPorCiclo: null }],
    };

    await api.barbeiro.planos();
    await api.barbeiro.criarPlano(novo);
    await api.barbeiro.editarPlano("pl1", { ativo: false });
    expect(await api.barbeiro.ligarVitrine(true)).toEqual({ ligada: true });

    const chamadas = fetchFalso.mock.calls.map(([url, init]) => [url, (init as RequestInit).method ?? "GET"]);
    expect(chamadas).toEqual([
      ["https://api.exemplo.br/barbearias/me/planos", "GET"],
      ["https://api.exemplo.br/barbearias/me/planos", "POST"],
      ["https://api.exemplo.br/barbearias/me/planos/pl1", "PATCH"],
      ["https://api.exemplo.br/barbearias/me/vitrine-de-planos", "PUT"],
    ]);
    expect(JSON.parse((fetchFalso.mock.calls[1][1] as RequestInit).body as string)).toEqual(novo);
    expect(JSON.parse((fetchFalso.mock.calls[3][1] as RequestInit).body as string)).toEqual({ ligada: true });
  });
});

const membro = (
  id: string,
  nome: string,
  papel: "dono" | "profissional" | "recepcao",
  extra: Partial<MembroDaEquipe> = {}
): MembroDaEquipe => ({
  id,
  nome,
  email: `${id}@gr.com`,
  telefone: null,
  papel,
  atende: papel !== "recepcao",
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: false,
  ...extra,
});

const planoDoGustavo: PlanoDoPainel = {
  id: "pl9",
  daCasa: false,
  vendedor: { id: "bb0", nome: "Gustavo" },
  nome: "2 cortes",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 9000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: null,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
  assinantes: 3,
};

function semear(papel: "dono" | "profissional" | "recepcao" = "dono", extra: Partial<MembroDaEquipe> = {}) {
  return criarApiClientFalso({
    papel,
    equipe: [
      membro("bb1", "Rafael", papel, extra),
      membro("bb0", "Gustavo", papel === "dono" ? "profissional" : "dono", { podeVenderPlanos: true }),
    ],
    planos: [planoDoGustavo],
  });
}

const novoDaCasa = {
  daCasa: true,
  nome: "Corte ilimitado",
  ciclo: "mensal" as const,
  precoCentavos: 12000,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  servicos: [{ servicoId: "s1", usosPorCiclo: null }],
};

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaApi> {
  try {
    await promessa;
  } catch (erro) {
    return erro as ErroDaApi;
  }
  throw new Error("esperava um erro");
}

describe("dublê — planos", () => {
  it("o dono vê todos, cria os dois tipos e liga a vitrine", async () => {
    const api = semear("dono");
    const antes = await api.barbeiro.planos();
    expect(antes).toMatchObject({ vitrine: false, podeCriarDaCasa: true, podeCriarProprio: true });
    expect(antes.planos.map((p) => p.id)).toEqual(["pl9"]);

    const criado = await api.barbeiro.criarPlano(novoDaCasa);
    expect(criado).toMatchObject({ daCasa: true, vendedor: null, assinantes: 0, ativo: true });
    expect(criado.servicos).toEqual([{ servicoId: "s1", nome: expect.any(String), usosPorCiclo: null }]);
    const meu = await api.barbeiro.criarPlano({ ...novoDaCasa, daCasa: false, fixoPorAtendimentoCentavos: null });
    expect(meu.vendedor).toEqual({ id: "bb1", nome: "Rafael" });

    expect(await api.barbeiro.ligarVitrine(true)).toEqual({ ligada: true });
    expect((await api.barbeiro.planos()).vitrine).toBe(true);
  });

  it("recusa como a API: o problema do plano, serviço repetido, da casa fora do dono", async () => {
    const api = semear("dono");
    expect((await erroDe(api.barbeiro.criarPlano({ ...novoDaCasa, precoCentavos: 0 }))).codigo).toBe("plano_preco");
    expect((await erroDe(api.barbeiro.criarPlano({ ...novoDaCasa, fixoPorAtendimentoCentavos: null }))).codigo).toBe(
      "plano_fixo"
    );
    const repetido = { ...novoDaCasa, servicos: [novoDaCasa.servicos[0], novoDaCasa.servicos[0]] };
    expect((await erroDe(api.barbeiro.criarPlano(repetido))).codigo).toBe("servico_repetido");

    const profissional = semear("profissional", { podeVenderPlanos: true });
    expect((await erroDe(profissional.barbeiro.criarPlano(novoDaCasa))).status).toBe(403);
  });

  it("editar junta com o que já tem e confere; o plano do colega é 404", async () => {
    const api = semear("dono");
    const editado = await api.barbeiro.editarPlano("pl9", { precoCentavos: 9900, ativo: false });
    expect(editado).toMatchObject({ precoCentavos: 9900, ativo: false, nome: "2 cortes" });
    expect((await erroDe(api.barbeiro.editarPlano("pl9", { fixoPorAtendimentoCentavos: 100 }))).codigo).toBe(
      "plano_fixo"
    );

    const profissional = semear("profissional", { podeVenderPlanos: true });
    expect((await erroDe(profissional.barbeiro.editarPlano("pl9", { nome: "Meu" }))).status).toBe(404);
  });

  it("o profissional vê só os dele; sem a liberação não cria; a recepção vê todos e não cria", async () => {
    const liberado = semear("profissional", { podeVenderPlanos: true });
    expect(await liberado.barbeiro.planos()).toMatchObject({ podeCriarDaCasa: false, podeCriarProprio: true, planos: [] });

    const semLiberar = semear("profissional");
    expect((await semLiberar.barbeiro.planos()).podeCriarProprio).toBe(false);
    expect((await erroDe(semLiberar.barbeiro.criarPlano({ ...novoDaCasa, daCasa: false }))).status).toBe(403);

    const recepcao = semear("recepcao");
    expect(await recepcao.barbeiro.planos()).toMatchObject({ podeCriarDaCasa: false, podeCriarProprio: false });
    expect((await recepcao.barbeiro.planos()).planos).toHaveLength(1);
    expect((await erroDe(recepcao.barbeiro.ligarVitrine(true))).status).toBe(403);
  });

  it("fora do Completo, 403 recurso_do_plano", async () => {
    const api = semear("dono");
    api.estado.assinatura = { ...api.estado.assinatura!, situacao: "ativa", plano: "essencial", planoEfetivo: "essencial" };
    expect((await erroDe(api.barbeiro.planos())).codigo).toBe("recurso_do_plano");
  });

  it("desativar quem tem assinante pede confirmação; com ela, as assinaturas caem", async () => {
    const api = semear("dono");
    const erro = await erroDe(api.barbeiro.atualizarMembro("bb0", { ativo: false }));
    expect(erro.codigo).toBe("assinaturas_ativas");
    expect(erro.status).toBe(422);

    const desativado = await api.barbeiro.atualizarMembro("bb0", { ativo: false, cancelarAssinaturas: true });
    expect(desativado.ativo).toBe(false);
    expect(desativado).not.toHaveProperty("cancelarAssinaturas");
    expect((await api.barbeiro.planos()).planos[0].assinantes).toBe(0);
  });

  it("o dono libera o membro pra vender planos", async () => {
    const api = semear("dono");
    const liberado = await api.barbeiro.atualizarMembro("bb0", { podeVenderPlanos: false });
    expect(liberado.podeVenderPlanos).toBe(false);
  });
});
