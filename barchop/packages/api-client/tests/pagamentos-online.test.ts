import { describe, expect, it, vi } from "vitest";
import type { AssinaturaDoPainel, ContaDePagamentoOnline, MembroDaEquipe, PlanoDoPainel } from "@barchop/types";
import { ErroDaApi, criarApiClient, criarApiClientFalso } from "../src/index";

// Os pagamentos online nas telas (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura): conectar a conta de quem vende
// (routers/pagamentos-online.ts), a vitrine pública (routers/planos.ts)
// e o cliente que assina, vê e cancela (routers/assinaturas-do-cliente.ts).

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

const chamadasDe = (fetchFalso: ReturnType<typeof vi.fn>) =>
  fetchFalso.mock.calls.map(([url, init]) => [url, (init as RequestInit).method ?? "GET"]);
const corpoDa = (fetchFalso: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse((fetchFalso.mock.calls[i][1] as RequestInit).body as string);

describe("as rotas", () => {
  it("a conta de quem vende: a da casa vai com ?daCasa=true", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ daCasa: false, modoAceito: "teste", conta: null }))
      .mockResolvedValueOnce(respostaJson({ daCasa: true, modoAceito: "teste", conta: null }))
      .mockResolvedValueOnce(respostaJson({ daCasa: true, modoAceito: "teste", conta: null }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(respostaJson({ daCasa: false, modoAceito: "teste", conta: null }));
    const api = cliente(fetchFalso);

    await api.barbeiro.pagamentosOnline(false);
    await api.barbeiro.pagamentosOnline(true);
    await api.barbeiro.conectarPagamentosOnline(true, "asaas", "$aact_hmlg_x");
    await api.barbeiro.desconectarPagamentosOnline(true);
    await api.barbeiro.conectarPagamentosOnline(false, "stripe", "rk_test_x");

    expect(chamadasDe(fetchFalso)).toEqual([
      ["https://api.exemplo.br/barbearias/me/pagamentos-online", "GET"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "GET"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "PUT"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "DELETE"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online", "PUT"],
    ]);
    expect(corpoDa(fetchFalso, 2)).toEqual({ provedor: "asaas", chave: "$aact_hmlg_x" });
    expect(corpoDa(fetchFalso, 4)).toEqual({ provedor: "stripe", chave: "rk_test_x" });
  });

  // Plano pagamentos-online-infinitepay, PR 7: a InfinitePay leva a
  // InfiniteTag no conectar, e os dias para cancelar mudam no PATCH.
  it("a InfinitePay: a tag vai no corpo do conectar; os dias, no PATCH", async () => {
    const conta = { daCasa: true, modoAceito: "real", conta: null };
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson(conta))
      .mockResolvedValueOnce(respostaJson(conta))
      .mockResolvedValueOnce(respostaJson(conta));
    const api = cliente(fetchFalso);

    await api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_x", "$barbearia-exemplo");
    await api.barbeiro.conectarPagamentosOnline(true, "asaas", "$aact_hmlg_x");
    await api.barbeiro.mudarDiasParaCancelar(true, 15);

    expect(chamadasDe(fetchFalso)).toEqual([
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "PUT"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "PUT"],
      ["https://api.exemplo.br/barbearias/me/pagamentos-online?daCasa=true", "PATCH"],
    ]);
    expect(corpoDa(fetchFalso, 0)).toEqual({ provedor: "infinitepay", chave: "inchk_x", tag: "$barbearia-exemplo" });
    expect(corpoDa(fetchFalso, 1)).toEqual({ provedor: "asaas", chave: "$aact_hmlg_x" });
    expect(corpoDa(fetchFalso, 2)).toEqual({ diasParaCancelar: 15 });
  });

  it("a vitrine e as assinaturas do cliente; CPF vazio não vai no corpo", async () => {
    const fetchFalso = vi
      .fn()
      .mockResolvedValueOnce(respostaJson({ planos: [] }))
      .mockResolvedValueOnce(respostaJson({ assinaturas: [] }))
      .mockResolvedValueOnce(respostaJson({ assinatura: { id: "as1" }, linkDaFatura: null }, 201))
      .mockResolvedValueOnce(respostaJson({ assinatura: { id: "as1" }, linkDaFatura: null }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = cliente(fetchFalso);

    await api.publico.planos("gr");
    await api.cliente.minhasAssinaturas();
    await api.cliente.assinarPlano("pl1");
    await api.cliente.assinarPlano("pl1", "529.982.247-25");
    await api.cliente.cancelarAssinatura("as1");

    expect(chamadasDe(fetchFalso)).toEqual([
      ["https://api.exemplo.br/barbearias/gr/planos", "GET"],
      ["https://api.exemplo.br/clientes/me/assinaturas", "GET"],
      ["https://api.exemplo.br/clientes/me/assinaturas", "POST"],
      ["https://api.exemplo.br/clientes/me/assinaturas", "POST"],
      ["https://api.exemplo.br/clientes/me/assinaturas/as1", "DELETE"],
    ]);
    expect(corpoDa(fetchFalso, 2)).toEqual({ planoId: "pl1" });
    expect(corpoDa(fetchFalso, 3)).toEqual({ planoId: "pl1", cpf: "529.982.247-25" });
  });
});

const CONTA: ContaDePagamentoOnline = {
  provedor: "asaas",
  modo: "teste",
  chaveFinal: "1234",
  conectadaEm: "2026-10-25T12:00:00.000Z",
  infiniteTag: null,
  diasParaCancelar: null,
};

const dono: MembroDaEquipe = {
  id: "bb1",
  nome: "Rafael",
  email: "rafael@gr.com",
  telefone: null,
  papel: "dono",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: false,
};
const lucas: MembroDaEquipe = { ...dono, id: "bb2", nome: "Lucas", papel: "profissional", podeVenderPlanos: true };

const plano = (extra: Partial<PlanoDoPainel> = {}): PlanoDoPainel => ({
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: true,
  aceitaNoBalcao: false,
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2 }],
  assinantes: 0,
  ...extra,
});

const COMPLETO = {
  situacao: "ativa" as const,
  plano: "completo" as const,
  planoEfetivo: "completo" as const,
};

describe("o dublê da conta de quem vende", () => {
  // As frases e as regras da API (routers/pagamentos-online.ts) na
  // InfinitePay: sem chave de teste, a tag obrigatória, e trocar a tag é
  // outra conta.
  it("a InfinitePay: só no modo real, com a tag; os dias para cancelar começam em 10", async () => {
    const semente = { assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO } };
    const noTeste = criarApiClientFalso(semente);
    await expect(noTeste.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_abcd", "loja")).rejects.toMatchObject({
      codigo: "modo_errado",
      mensagem: "a InfinitePay não tem chave de teste, e aqui só vale a de teste",
    });

    const api = criarApiClientFalso({ ...semente, modoAceito: "real" });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_abcd")).rejects.toMatchObject({
      codigo: "tag_obrigatoria",
    });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_abcd", "minha loja")).rejects.toMatchObject({
      codigo: "tag_invalida",
    });

    const conectada = await api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_abcd9876", " $loja-exemplo ");
    expect(conectada.conta).toMatchObject({
      provedor: "infinitepay",
      modo: "real",
      chaveFinal: "9876",
      infiniteTag: "loja-exemplo",
      diasParaCancelar: 10,
    });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_wxyz", "outra-loja")).rejects.toMatchObject({
      codigo: "outra_conta",
      mensagem: "a conta conectada é a da InfiniteTag loja-exemplo: desconecte antes de conectar outra",
    });

    expect((await api.barbeiro.mudarDiasParaCancelar(true, 20)).conta).toMatchObject({ diasParaCancelar: 20 });
    await expect(api.barbeiro.mudarDiasParaCancelar(true, 2)).rejects.toMatchObject({ status: 400 });
    // Trocar a chave mantém os dias.
    expect((await api.barbeiro.conectarPagamentosOnline(true, "infinitepay", "inchk_nova4321", "loja-exemplo")).conta).toMatchObject({
      chaveFinal: "4321",
      diasParaCancelar: 20,
    });
  });

  it("os dias para cancelar são só da InfinitePay; sem conta, 404", async () => {
    const api = criarApiClientFalso({
      assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO },
      contasOnline: { casa: CONTA },
    });
    await expect(api.barbeiro.mudarDiasParaCancelar(true, 15)).rejects.toMatchObject({ codigo: "so_na_infinitepay" });
    await expect(api.barbeiro.mudarDiasParaCancelar(false, 15)).rejects.toMatchObject({ status: 404 });
  });

  it("conecta pelo prefixo da chave, mostra só a final e desconecta", async () => {
    const api = criarApiClientFalso({ assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO } });

    expect(await api.barbeiro.pagamentosOnline(true)).toEqual({ daCasa: true, modoAceito: "teste", conta: null });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "asaas", "sk_live_x")).rejects.toMatchObject({
      codigo: "chave_invalida",
    });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "asaas", "$aact_prod_abcd")).rejects.toMatchObject({
      codigo: "modo_errado",
    });

    const conectada = await api.barbeiro.conectarPagamentosOnline(true, "asaas", " $aact_hmlg_abcd9876 ");
    expect(conectada.conta).toMatchObject({ provedor: "asaas", modo: "teste", chaveFinal: "9876" });
    expect(JSON.stringify(conectada)).not.toContain("aact");

    await api.barbeiro.desconectarPagamentosOnline(true);
    expect((await api.barbeiro.pagamentosOnline(true)).conta).toBeNull();
  });

  it("a Stripe: o prefixo dela, as frases da API e uma conta ligada por vez", async () => {
    const api = criarApiClientFalso({ assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO } });

    await expect(api.barbeiro.conectarPagamentosOnline(true, "stripe", "$aact_hmlg_abcd")).rejects.toMatchObject({
      codigo: "chave_invalida",
      mensagem: "isso não é uma chave de API da Stripe: ela começa com sk_ ou rk_",
    });
    await expect(api.barbeiro.conectarPagamentosOnline(true, "stripe", "rk_live_abcd")).rejects.toMatchObject({
      codigo: "modo_errado",
      mensagem: "esta é uma chave de produção da Stripe: aqui só vale a de teste",
    });

    const conectada = await api.barbeiro.conectarPagamentosOnline(true, "stripe", "rk_test_abcd5678");
    expect(conectada.conta).toMatchObject({ provedor: "stripe", modo: "teste", chaveFinal: "5678" });

    await expect(api.barbeiro.conectarPagamentosOnline(true, "asaas", "$aact_hmlg_abcd")).rejects.toMatchObject({
      codigo: "outra_conta",
      mensagem: "a conta conectada é da Stripe: desconecte antes de conectar a do Asaas",
    });
    // Trocar a chave da mesma conta da Stripe vale.
    expect((await api.barbeiro.conectarPagamentosOnline(true, "stripe", "sk_test_wxyz4321")).conta).toMatchObject({
      provedor: "stripe",
      chaveFinal: "4321",
    });
  });

  it("recusa desconectar com assinatura online viva na conta, como a API", async () => {
    const viva: AssinaturaDoPainel = {
      id: "as1",
      situacao: "ativa",
      forma: "online",
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: "2026-10-01",
      cicloTerminaEm: "2026-11-01",
      canceladaEm: null,
      linkDoCiclo: null,
      criadoEm: "2026-10-01T12:00:00.000Z",
      cliente: { id: "c1", nome: "Caio", telefone: "+5511999998888" },
      plano: { id: "pl1", nome: "Corte ilimitado", daCasa: true, vendedor: null },
    };
    const api = criarApiClientFalso({
      planos: [plano()],
      assinaturas: [viva],
      contasOnline: { casa: CONTA },
    });

    await expect(api.barbeiro.desconectarPagamentosOnline(true)).rejects.toMatchObject({
      codigo: "assinaturas_ativas",
    });
    // A própria conta não tem assinatura: desconecta.
    await expect(api.barbeiro.desconectarPagamentosOnline(false)).rejects.toMatchObject({ status: 404 });
  });

  it("a casa é só do dono; a recepção não vê conta nenhuma", async () => {
    const profissional = criarApiClientFalso({ papel: "profissional" });
    await expect(profissional.barbeiro.pagamentosOnline(true)).rejects.toMatchObject({ status: 403 });
    expect((await profissional.barbeiro.pagamentosOnline(false)).conta).toBeNull();

    const recepcao = criarApiClientFalso({ papel: "recepcao" });
    await expect(recepcao.barbeiro.pagamentosOnline(false)).rejects.toBeInstanceOf(ErroDaApi);
  });
});

describe("o dublê da vitrine", () => {
  it("só com a vitrine ligada e no Completo; online só com a conta de quem vende", async () => {
    const semente = {
      assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO },
      equipe: [dono, lucas],
      vitrineDePlanos: true,
      planos: [
        plano(),
        plano({ id: "pl2", nome: "Do Lucas", daCasa: false, vendedor: { id: "bb2", nome: "Lucas" }, aceitaNoBalcao: true }),
        plano({ id: "pl3", nome: "Inativo", ativo: false }),
      ],
      servicos: [{ ...criarApiClientFalso().estado.servicos[0], id: "s1", nome: "Corte", ativo: true }],
    };

    // Sem conta nenhuma: ninguém vende online, e os dois ficam com o
    // pagamento online indisponível (o do Lucas ainda tem o balcão).
    const semConta = criarApiClientFalso(semente);
    expect(
      (await semConta.publico.planos("gr-barber")).planos.map((p) => [p.id, p.aceitaOnline, p.onlineIndisponivel])
    ).toEqual([
      ["pl1", false, true],
      ["pl2", false, true],
    ]);

    const comConta = criarApiClientFalso({ ...semente, contasOnline: { casa: CONTA, bb2: CONTA } });
    const vitrine = await comConta.publico.planos("gr-barber");
    expect(vitrine.planos.map((p) => [p.id, p.aceitaOnline])).toEqual([
      ["pl1", true],
      ["pl2", true],
    ]);
    expect(vitrine.planos[1].vendedor).toEqual({ id: "bb2", nome: "Lucas", fotoUrl: null });

    // Conta de outro modo não vende.
    const deOutroModo = criarApiClientFalso({ ...semente, contasOnline: { casa: { ...CONTA, modo: "real" } } });
    expect((await deOutroModo.publico.planos("gr-barber")).planos.map((p) => [p.id, p.aceitaOnline])).toEqual([
      ["pl1", false],
      ["pl2", false],
    ]);

    expect((await criarApiClientFalso({ ...semente, vitrineDePlanos: false }).publico.planos("gr-barber")).planos).toEqual([]);
    const gratis = { ...semente.assinatura, plano: "gratis" as const, planoEfetivo: "gratis" as const };
    expect((await criarApiClientFalso({ ...semente, assinatura: gratis }).publico.planos("gr-barber")).planos).toEqual([]);
  });
});

describe("o dublê do cliente que assina", () => {
  const semente = () => ({
    assinatura: { ...criarApiClientFalso().estado.assinatura!, ...COMPLETO },
    vitrineDePlanos: true,
    planos: [plano(), plano({ id: "pl2", nome: "Com teste", diasDeTeste: 7 })],
    servicos: [{ ...criarApiClientFalso().estado.servicos[0], id: "s1", nome: "Corte", ativo: true }],
    contasOnline: { casa: CONTA },
    hoje: "2026-10-25",
  });

  it("pede o CPF na primeira vez, confere e guarda; depois assina sem", async () => {
    const api = criarApiClientFalso(semente());

    await expect(api.cliente.assinarPlano("pl1")).rejects.toMatchObject({ codigo: "cpf_obrigatorio" });
    await expect(api.cliente.assinarPlano("pl1", "529.982.247-24")).rejects.toMatchObject({ codigo: "cpf_invalido" });

    const criada = await api.cliente.assinarPlano("pl1", "529.982.247-25");
    expect(criada.assinatura).toMatchObject({ situacao: "pendente", forma: "online", plano: { id: "pl1" } });
    expect(criada.linkDaFatura).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\/exemplo/);

    const comTeste = await api.cliente.assinarPlano("pl2");
    expect(comTeste.assinatura).toMatchObject({ situacao: "teste", cicloComecaEm: "2026-10-25", cicloTerminaEm: "2026-11-01" });
  });

  // Como a Stripe (teste ponta a ponta, 31/10): com dias grátis, a fatura
  // de R$ 0 nasce paga e não há fatura aberta para mostrar.
  it("na Stripe: sem CPF; com dias grátis, sem fatura agora", async () => {
    const api = criarApiClientFalso({ ...semente(), contasOnline: { casa: { ...CONTA, provedor: "stripe" as const } } });

    const criada = await api.cliente.assinarPlano("pl1");
    expect(criada.linkDaFatura).toMatch(/^https:[/][/]invoice[.]stripe[.]com[/]/);

    const comTeste = await api.cliente.assinarPlano("pl2");
    expect(comTeste.assinatura).toMatchObject({ situacao: "teste" });
    expect(comTeste.linkDaFatura).toBeNull();
  });

  // Plano pagamentos-online-infinitepay, PR 6: a InfinitePay não renova
  // sozinha, e a conta mostra o link a pagar; o "Recebi" de quem vende
  // vale nela (decisão 10) e fecha o link.
  it("na InfinitePay: o link a pagar na conta e no painel; o Recebi fecha", async () => {
    const api = criarApiClientFalso({ ...semente(), contasOnline: { casa: { ...CONTA, provedor: "infinitepay" as const } } });

    const criada = await api.cliente.assinarPlano("pl1");
    expect(criada.linkDaFatura).toMatch(/^https:[/][/]checkout[.]infinitepay[.]io[/]/);
    expect((await api.cliente.minhasAssinaturas())[0]!.linkParaPagar).toBe(criada.linkDaFatura);
    const noPainel = (await api.barbeiro.assinantes()).assinantes[0]!;
    expect(noPainel.linkDoCiclo).toEqual({ url: criada.linkDaFatura, vencimento: "2026-10-25" });

    const recebida = await api.barbeiro.receberMensalidade(criada.assinatura.id, "pix");
    expect(recebida.assinatura).toMatchObject({ situacao: "ativa", linkDoCiclo: null });
    expect((await api.cliente.minhasAssinaturas())[0]!.linkParaPagar).toBeNull();

    // Em teste, como na API, o link ainda não saiu.
    const comTeste = await api.cliente.assinarPlano("pl2");
    expect(comTeste.linkDaFatura).toBeNull();
    expect(comTeste.assinatura.linkParaPagar).toBeNull();
  });

  it("volta pra fatura da pendente; ja_assina na ativa; plano fora da vitrine é indisponível", async () => {
    const api = criarApiClientFalso({ ...semente(), cpfDoCliente: "52998224725" });
    const primeira = await api.cliente.assinarPlano("pl1");

    const deNovo = await api.cliente.assinarPlano("pl1");
    expect(deNovo.assinatura.id).toBe(primeira.assinatura.id);
    expect(deNovo.linkDaFatura).not.toBeNull();

    api.estado.assinaturas!.find((a) => a.id === primeira.assinatura.id)!.situacao = "ativa";
    await expect(api.cliente.assinarPlano("pl1")).rejects.toMatchObject({ codigo: "ja_assina" });

    const semConta = criarApiClientFalso({ ...semente(), contasOnline: {}, cpfDoCliente: "52998224725" });
    await expect(semConta.cliente.assinarPlano("pl1")).rejects.toMatchObject({ codigo: "plano_indisponivel" });
  });

  it("minhas assinaturas: só as do cliente, com os usos que sobram; cancelar", async () => {
    const api = criarApiClientFalso({ ...semente(), cpfDoCliente: "52998224725", usosNoCiclo: {} });
    const { assinatura } = await api.cliente.assinarPlano("pl1");
    api.estado.usosNoCiclo![`${assinatura.id}:s1`] = 1;

    const [minha] = await api.cliente.minhasAssinaturas();
    expect(minha).toMatchObject({
      id: assinatura.id,
      servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: 2, usosRestantes: 1 }],
    });

    await api.cliente.cancelarAssinatura(assinatura.id);
    expect((await api.cliente.minhasAssinaturas())[0].situacao).toBe("cancelada");
    await expect(api.cliente.cancelarAssinatura("nao-existe")).rejects.toMatchObject({ status: 404 });
  });

  it("meus agendamentos marcam o que o plano cobre, como a API: até os usos do ciclo, e o online renova", async () => {
    const api = criarApiClientFalso({ ...semente(), cpfDoCliente: "52998224725", usosNoCiclo: {} });
    const { assinatura } = await api.cliente.assinarPlano("pl2");
    api.estado.usosNoCiclo![`${assinatura.id}:s1`] = 1;
    const marcar = (data: string, horaInicio: string) =>
      api.publico.agendar("gr-barber", {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data,
        horaInicio,
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      });
    const depois = await marcar("2026-10-29", "09:00");
    const cedo = await marcar("2026-10-28", "09:00");
    const depoisDoTeste = await marcar("2026-11-05", "09:00");

    const porId = Object.fromEntries((await api.cliente.meusAgendamentos()).map((a) => [a.id, a.peloPlano]));
    expect(porId).toEqual({ [cedo.id]: ["s1"], [depois.id]: [], [depoisDoTeste.id]: ["s1"] });
  });
});
