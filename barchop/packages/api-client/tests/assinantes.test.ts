import { describe, expect, it, vi } from "vitest";
import type { AssinaturaDoPainel, MembroDaEquipe, PlanoDoPainel } from "@barchop/types";
import { ErroDaApi, criarApiClient, criarApiClientFalso } from "../src/index";

// O assinante no balcão (Onda 2, marco 3, PR 7b do plano
// planos-de-assinatura). Rotas de apps/api/src/routers/assinantes.ts.

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

describe("api dos assinantes", () => {
  it("lista, assina, recebe e cancela nas rotas da API", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ assinantes: [] }))
      .mockResolvedValueOnce(respostaJson({ assinantes: [] }))
      .mockResolvedValueOnce(respostaJson({ id: "as1" }, 201))
      .mockResolvedValueOnce(respostaJson({ assinatura: { id: "as1" }, recebimento: { id: "r1" } }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = cliente(fetchFalso);

    await api.barbeiro.assinantes();
    await api.barbeiro.assinantes("c1");
    await api.barbeiro.assinarPlano("c1", "pl1");
    await api.barbeiro.receberMensalidade("as1", "pix");
    await api.barbeiro.cancelarAssinaturaDoPlano("as1");

    const chamadas = fetchFalso.mock.calls.map(([url, init]) => [url, (init as RequestInit).method ?? "GET"]);
    expect(chamadas).toEqual([
      ["https://api.exemplo.br/barbearias/me/assinantes", "GET"],
      ["https://api.exemplo.br/barbearias/me/assinantes?clienteId=c1", "GET"],
      ["https://api.exemplo.br/clientes/c1/assinaturas", "POST"],
      ["https://api.exemplo.br/assinaturas/as1/recebimentos", "POST"],
      ["https://api.exemplo.br/assinaturas/as1", "DELETE"],
    ]);
    expect(JSON.parse((fetchFalso.mock.calls[2][1] as RequestInit).body as string)).toEqual({ planoId: "pl1" });
    expect(JSON.parse((fetchFalso.mock.calls[3][1] as RequestInit).body as string)).toEqual({ forma: "pix" });
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

const daCasa: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 0,
};

const doGustavo: PlanoDoPainel = {
  ...daCasa,
  id: "pl2",
  daCasa: false,
  vendedor: { id: "bb0", nome: "Gustavo" },
  nome: "2 cortes",
  fixoPorAtendimentoCentavos: null,
  diasDeTeste: 7,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
  assinantes: 1,
};

const doGustavoEmDia: AssinaturaDoPainel = {
  id: "as9",
  situacao: "ativa",
  forma: "no_balcao",
  precoCentavos: 12000,
  ciclo: "mensal",
  cicloComecaEm: "2026-10-10",
  cicloTerminaEm: "2026-11-10",
  canceladaEm: null,
  criadoEm: "2026-10-10T12:00:00.000Z",
  cliente: { id: "c9", nome: "Bruno Lima", telefone: "11988887777" },
  plano: { id: "pl2", nome: "2 cortes", daCasa: false, vendedor: { id: "bb0", nome: "Gustavo" } },
};

function semear(papel: "dono" | "profissional" | "recepcao" = "dono", extra: Parameters<typeof criarApiClientFalso>[0] = {}) {
  return criarApiClientFalso({
    papel,
    hoje: "2026-10-24",
    equipe: [
      membro("bb1", "Rafael", papel),
      membro("bb0", "Gustavo", papel === "dono" ? "profissional" : "dono", { podeVenderPlanos: true }),
    ],
    planos: [daCasa, doGustavo],
    assinaturas: [doGustavoEmDia],
    ...extra,
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<ErroDaApi> {
  try {
    await promessa;
  } catch (erro) {
    return erro as ErroDaApi;
  }
  throw new Error("esperava um erro");
}

describe("dublê — assinantes", () => {
  it("assinar sem dias grátis nasce pendente; com dias grátis, em teste a partir de hoje", async () => {
    const api = semear("dono");
    const pendente = await api.barbeiro.assinarPlano("c1", "pl1");
    expect(pendente).toMatchObject({
      situacao: "pendente",
      forma: "no_balcao",
      precoCentavos: 12000,
      cicloComecaEm: null,
      cicloTerminaEm: null,
      plano: { id: "pl1", daCasa: true, vendedor: null },
    });
    expect(pendente.cliente.id).toBe("c1");

    const emTeste = await api.barbeiro.assinarPlano("c1", "pl2");
    expect(emTeste).toMatchObject({ situacao: "teste", cicloComecaEm: "2026-10-24", cicloTerminaEm: "2026-10-31" });

    const planos = (await api.barbeiro.planos()).planos;
    expect(planos.find((p) => p.id === "pl1")!.assinantes).toBe(1);
    expect(planos.find((p) => p.id === "pl2")!.assinantes).toBe(2);
  });

  it("recusa como a API: já assina, plano desativado, sem balcão, fora do Completo", async () => {
    const api = semear("dono");
    await api.barbeiro.assinarPlano("c1", "pl1");
    expect((await erroDe(api.barbeiro.assinarPlano("c1", "pl1"))).codigo).toBe("ja_assina");

    await api.barbeiro.editarPlano("pl2", { ativo: false });
    expect((await erroDe(api.barbeiro.assinarPlano("c1", "pl2"))).codigo).toBe("plano_inativo");

    const semBalcao = semear("dono", { planos: [{ ...daCasa, aceitaOnline: true, aceitaNoBalcao: false }] });
    expect((await erroDe(semBalcao.barbeiro.assinarPlano("c1", "pl1"))).codigo).toBe("plano_sem_balcao");

    const gratis = semear("dono");
    gratis.estado.assinatura = { ...gratis.estado.assinatura!, situacao: "ativa", plano: "essencial", planoEfetivo: "essencial" };
    expect((await erroDe(gratis.barbeiro.assinarPlano("c1", "pl1"))).codigo).toBe("recurso_do_plano");
  });

  it("lista do mais novo, filtra pelo cliente e marca em atraso quem passou da renovação", async () => {
    const atrasada: AssinaturaDoPainel = { ...doGustavoEmDia, id: "as8", cicloComecaEm: "2026-09-20", cicloTerminaEm: "2026-10-20", criadoEm: "2026-09-20T12:00:00.000Z" };
    const api = semear("dono", { assinaturas: [doGustavoEmDia, atrasada] });
    await api.barbeiro.assinarPlano("c1", "pl1");

    const todas = (await api.barbeiro.assinantes()).assinantes;
    expect(todas.map((a) => [a.cliente.id, a.situacao])).toEqual([
      ["c1", "pendente"],
      ["c9", "ativa"],
      ["c9", "em_atraso"],
    ]);
    expect((await api.barbeiro.assinantes("c1")).assinantes).toHaveLength(1);
  });

  it("recebi: abre o ciclo hoje; em dia é recusado; o caixa é o próximo aberto", async () => {
    const api = semear("dono", { diasFechados: ["2026-10-24"] });
    const pendente = await api.barbeiro.assinarPlano("c1", "pl1");

    const recebido = await api.barbeiro.receberMensalidade(pendente.id, "dinheiro");
    expect(recebido.assinatura).toMatchObject({ situacao: "ativa", cicloComecaEm: "2026-10-24", cicloTerminaEm: "2026-11-24" });
    expect(recebido.recebimento).toMatchObject({ data: "2026-10-25", valorCentavos: 12000, casaCentavos: 12000, forma: "dinheiro" });

    const emDia = await erroDe(api.barbeiro.receberMensalidade("as9", "pix"));
    expect(emDia.codigo).toBe("ciclo_em_dia");
    expect(emDia.status).toBe(422);
  });

  it("cancelar tira do plano; cancelada de novo não é erro e não recebe", async () => {
    const api = semear("dono");
    await api.barbeiro.cancelarAssinaturaDoPlano("as9");
    await api.barbeiro.cancelarAssinaturaDoPlano("as9");
    const [cancelada] = (await api.barbeiro.assinantes("c9")).assinantes;
    expect(cancelada.situacao).toBe("cancelada");
    expect(cancelada.canceladaEm).not.toBeNull();
    expect((await api.barbeiro.planos()).planos.find((p) => p.id === "pl2")!.assinantes).toBe(0);
    expect((await erroDe(api.barbeiro.receberMensalidade("as9", "pix"))).codigo).toBe("assinatura_cancelada");
  });

  it("o profissional só vê e mexe nas dos planos dele", async () => {
    const api = semear("profissional");
    expect((await api.barbeiro.assinantes()).assinantes).toEqual([]);
    expect((await erroDe(api.barbeiro.cancelarAssinaturaDoPlano("as9"))).status).toBe(404);
    expect((await erroDe(api.barbeiro.assinarPlano("c1", "pl2"))).status).toBe(404);
  });

  it("desativar o vendedor cancelando as assinaturas cancela as dele na lista", async () => {
    const api = semear("dono");
    await api.barbeiro.atualizarMembro("bb0", { ativo: false, cancelarAssinaturas: true });
    expect((await api.barbeiro.assinantes()).assinantes[0].situacao).toBe("cancelada");
  });
});
