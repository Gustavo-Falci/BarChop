import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia, dataParaDate, somarDias } from "../../src/lib/horas";
import { provedoresDeMemoria, type Provedor } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// Assinar online pela página pública (Onda 2, marco 3, PR 10c do plano
// planos-de-assinatura). O cliente logado escolhe um plano da vitrine,
// dá o CPF (o Asaas não cobra sem ele) e recebe o link da fatura do
// Asaas: o BarChop nunca vê cartão. A assinatura nasce pendente (ou em
// teste, com dias grátis) e o webhook (10a) a ativa quando o dinheiro
// entra. Só vende o que a vitrine mostra como "online".

const CPF = "52998224725";

async function cenario() {
  const provedores = provedoresDeMemoria();
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  const lucas = await criarMembroComToken(app, dono.barbeariaId, "profissional", "lucas");
  await prisma.barbeiro.update({ where: { id: lucas.barbeiroId }, data: { podeVenderPlanos: true } });
  await prisma.barbearia.update({ where: { id: dono.barbeariaId }, data: { vitrineDePlanos: true } });

  const conectar = async (token: string, chave: string, daCasa: boolean) => {
    const resposta = await app.inject({
      method: "PUT",
      url: `/barbearias/me/pagamentos-online${daCasa ? "?daCasa=true" : ""}`,
      headers: auth(token),
      payload: { provedor: "asaas", chave },
    });
    expect(resposta.statusCode).toBe(200);
  };
  await conectar(dono.token, "$aact_hmlg_chave-da-casa-1234", true);
  await conectar(lucas.token, "$aact_hmlg_chave-do-lucas-5678", false);
  const casa = await prisma.conexaoDePagamento.findFirstOrThrow({ where: { barbeariaId: dono.barbeariaId, daCasa: true } });
  const doLucas = await prisma.conexaoDePagamento.findFirstOrThrow({ where: { barbeiroId: lucas.barbeiroId, daCasa: false } });

  const corte = await prisma.servico.create({
    data: { barbeariaId: dono.barbeariaId, nome: "Corte", duracaoMinutos: 30, preco: 50 },
  });
  const plano = (extra: Record<string, unknown> = {}) =>
    prisma.planoDeAssinatura.create({
      data: {
        barbeariaId: dono.barbeariaId,
        nome: "Corte ilimitado",
        ciclo: "mensal",
        precoCentavos: 12000,
        fixoPorAtendimentoCentavos: 2500,
        servicos: { create: [{ servicoId: corte.id, usosPorCiclo: 2 }] },
        ...extra,
      },
    });
  const daCasa = await plano();
  const cliente = await criarClienteComToken(app, dono.slug);
  await prisma.cliente.update({ where: { id: cliente.clienteId }, data: { email: "caio@exemplo.com" } });

  return { app, provedores, dono, lucas, casa, doLucas, corte, plano, daCasa, cliente };
}

type Cenario = Awaited<ReturnType<typeof cenario>>;

const hoje = () => agoraNaBarbearia().data;

function assinar(c: Cenario, planoId: string, corpo: Record<string, unknown> = { cpf: "529.982.247-25" }, token = c.cliente.token) {
  return c.app.inject({
    method: "POST",
    url: "/clientes/me/assinaturas",
    headers: auth(token),
    payload: { planoId, ...corpo },
  });
}

function minhas(c: Cenario, token = c.cliente.token) {
  return c.app.inject({ method: "GET", url: "/clientes/me/assinaturas", headers: auth(token) });
}

function cancelar(c: Cenario, id: string, token = c.cliente.token) {
  return c.app.inject({ method: "DELETE", url: `/clientes/me/assinaturas/${id}`, headers: auth(token) });
}

describe("assinar", () => {
  it("cria o cliente e a assinatura na conta da casa, e devolve o link da fatura", async () => {
    const c = await cenario();

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(201);
    const corpo = resposta.json();
    expect(corpo.linkDaFatura).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\//);
    expect(corpo.assinatura).toMatchObject({
      situacao: "pendente",
      forma: "online",
      precoCentavos: 12000,
      ciclo: "mensal",
      cicloComecaEm: null,
      plano: { id: c.daCasa.id, nome: "Corte ilimitado", daCasa: true, vendedor: null },
    });
    // Nem o CPF nem o id do provedor saem pra tela (o link é do provedor).
    expect(resposta.body).not.toContain(CPF);
    expect(JSON.stringify(corpo.assinatura)).not.toContain("sub_memoria");

    expect(c.provedores.clientes).toEqual([
      expect.objectContaining({ cpfCnpj: CPF, email: "caio@exemplo.com", referencia: c.cliente.clienteId }),
    ]);
    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: corpo.assinatura.id } });
    expect(c.provedores.pedidosDeAssinatura).toEqual([
      expect.objectContaining({
        clienteId: c.provedores.clientes[0]!.id,
        valorCentavos: 12000,
        ciclo: "mensal",
        primeiroVencimento: hoje(),
        descricao: "Corte ilimitado",
        referencia: gravada.id,
      }),
    ]);
    expect(gravada).toMatchObject({ conexaoId: c.casa.id, idExterno: c.provedores.pedidosDeAssinatura[0]!.id });
    expect((await prisma.cliente.findUniqueOrThrow({ where: { id: c.cliente.clienteId } })).cpf).toBe(CPF);
    await c.app.close();
  });

  it("com dias grátis, nasce em teste e a primeira cobrança vence no fim do teste", async () => {
    const c = await cenario();
    const comTeste = await c.plano({ nome: "Com teste", diasDeTeste: 7 });

    const resposta = await assinar(c, comTeste.id);

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json().assinatura).toMatchObject({
      situacao: "teste",
      cicloComecaEm: hoje(),
      cicloTerminaEm: somarDias(hoje(), 7),
    });
    expect(c.provedores.pedidosDeAssinatura[0]!.primeiroVencimento).toBe(somarDias(hoje(), 7));
    await c.app.close();
  });

  it("o plano de barbeiro é cobrado na conta de quem vende", async () => {
    const c = await cenario();
    const doLucas = await c.plano({ nome: "Do Lucas", vendedorId: c.lucas.barbeiroId, fixoPorAtendimentoCentavos: null });

    const resposta = await assinar(c, doLucas.id);

    expect(resposta.statusCode).toBe(201);
    const gravada = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id: resposta.json().assinatura.id } });
    expect(gravada.conexaoId).toBe(c.doLucas.id);
    await c.app.close();
  });

  it("o CPF: obrigatório na primeira vez, recusado se não confere, e depois já vem do cadastro", async () => {
    const c = await cenario();

    const sem = await assinar(c, c.daCasa.id, {});
    expect(sem.statusCode).toBe(422);
    expect(sem.json().erro).toBe("cpf_obrigatorio");
    const torto = await assinar(c, c.daCasa.id, { cpf: "529.982.247-24" });
    expect(torto.statusCode).toBe(422);
    expect(torto.json().erro).toBe("cpf_invalido");
    expect(c.provedores.clientes).toEqual([]);

    await prisma.cliente.update({ where: { id: c.cliente.clienteId }, data: { cpf: CPF } });
    expect((await assinar(c, c.daCasa.id, {})).statusCode).toBe(201);
    expect(c.provedores.clientes[0]!.cpfCnpj).toBe(CPF);
    await c.app.close();
  });

  it("só vende o que a vitrine mostra como online; o resto é plano_indisponivel, sem falar com o provedor", async () => {
    const c = await cenario();
    const soBalcao = await c.plano({ nome: "Só balcão", aceitaOnline: false, aceitaNoBalcao: true });
    const inativo = await c.plano({ nome: "Inativo", ativo: false });
    const semServico = await prisma.planoDeAssinatura.create({
      data: { barbeariaId: c.dono.barbeariaId, nome: "Vazio", ciclo: "mensal", precoCentavos: 5000, fixoPorAtendimentoCentavos: 0 },
    });
    const doLucas = await c.plano({ nome: "Do Lucas", vendedorId: c.lucas.barbeiroId, fixoPorAtendimentoCentavos: null });
    await prisma.barbeiro.update({ where: { id: c.lucas.barbeiroId }, data: { podeVenderPlanos: false } });

    for (const plano of [soBalcao, inativo, semServico, doLucas]) {
      const resposta = await assinar(c, plano.id);
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro).toBe("plano_indisponivel");
    }

    // A vitrine desligada.
    await prisma.barbearia.update({ where: { id: c.dono.barbeariaId }, data: { vitrineDePlanos: false } });
    expect((await assinar(c, c.daCasa.id)).json().erro).toBe("plano_indisponivel");
    await prisma.barbearia.update({ where: { id: c.dono.barbeariaId }, data: { vitrineDePlanos: true } });

    // A conta da casa de outro modo, ou desligada.
    await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { modo: "real" } });
    expect((await assinar(c, c.daCasa.id)).json().erro).toBe("plano_indisponivel");
    await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { modo: "teste", desconectadaEm: new Date() } });
    expect((await assinar(c, c.daCasa.id)).json().erro).toBe("plano_indisponivel");

    expect(c.provedores.clientes).toEqual([]);
    await c.app.close();
  });

  it("fora do Completo, plano_indisponivel: não conta qual plano do BarChop a barbearia paga", async () => {
    const c = await cenario();
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { situacao: "gratis", plano: "gratis", testeTerminaEm: null },
    });

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("plano_indisponivel");
    await c.app.close();
  });

  it("plano de outra barbearia é 404", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "dois");
    const deFora = await prisma.planoDeAssinatura.create({
      data: { barbeariaId: outra.barbeariaId, nome: "De fora", ciclo: "mensal", precoCentavos: 5000, fixoPorAtendimentoCentavos: 0 },
    });

    expect((await assinar(c, deFora.id)).statusCode).toBe(404);
    await c.app.close();
  });

  it("já assina: 422; pendente online, devolve o link da fatura de novo sem criar outra", async () => {
    const c = await cenario();
    const primeira = await assinar(c, c.daCasa.id);

    const deNovo = await assinar(c, c.daCasa.id);

    expect(deNovo.statusCode).toBe(200);
    expect(deNovo.json()).toMatchObject({ assinatura: { id: primeira.json().assinatura.id }, linkDaFatura: expect.any(String) });
    expect(c.provedores.pedidosDeAssinatura).toHaveLength(1);

    await prisma.assinaturaDoCliente.update({ where: { id: primeira.json().assinatura.id }, data: { situacao: "ativa" } });
    const ativa = await assinar(c, c.daCasa.id);
    expect(ativa.statusCode).toBe(422);
    expect(ativa.json().erro).toBe("ja_assina");
    await c.app.close();
  });

  it("o provedor fora do ar: 502 e nada gravado", async () => {
    const c = await cenario();
    c.provedores.indisponivel = true;

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(502);
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
    await c.app.close();
  });

  it("a conta desconectada enquanto o provedor criava: cancela lá e não grava aqui", async () => {
    const c = await cenario();
    // O desconectar acontece entre o provedor criar e o BarChop gravar.
    const daConexao = c.provedores.daConexao;
    c.provedores.daConexao = (conexao) => {
      const provedor = daConexao(conexao);
      return {
        ...provedor,
        async criarAssinatura(dados) {
          const criada = await provedor.criarAssinatura(dados);
          await prisma.conexaoDePagamento.update({ where: { id: c.casa.id }, data: { desconectadaEm: new Date() } });
          return criada;
        },
      } satisfies Provedor;
    };

    const resposta = await assinar(c, c.daCasa.id);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("plano_indisponivel");
    expect(c.provedores.cancelamentos).toEqual([c.provedores.pedidosDeAssinatura[0]!.id]);
    expect(await prisma.assinaturaDoCliente.count()).toBe(0);
    await c.app.close();
  });
});

describe("minhas assinaturas", () => {
  it("as do cliente, com os usos que sobram no ciclo; sem CPF nem id do provedor", async () => {
    const c = await cenario();
    const id = (await assinar(c, c.daCasa.id)).json().assinatura.id;
    await prisma.assinaturaDoCliente.update({
      where: { id },
      data: { situacao: "ativa", cicloComecaEm: dataParaDate(hoje()), cicloTerminaEm: dataParaDate(somarDias(hoje(), 30)) },
    });
    const outro = await criarClienteComToken(c.app, c.dono.slug, "11988887777");

    const resposta = await minhas(c);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().assinaturas).toEqual([
      expect.objectContaining({
        id,
        situacao: "ativa",
        cicloComecaEm: hoje(),
        plano: expect.objectContaining({ nome: "Corte ilimitado" }),
        servicos: [{ servicoId: c.corte.id, nome: "Corte", usosPorCiclo: 2, usosRestantes: 2 }],
      }),
    ]);
    expect(resposta.body).not.toContain(CPF);
    expect(resposta.body).not.toContain("sub_memoria");
    expect((await minhas(c, outro.token)).json().assinaturas).toEqual([]);
    await c.app.close();
  });

  it("o ciclo já pago entra na leitura, como no painel", async () => {
    const c = await cenario();
    const id = (await assinar(c, c.daCasa.id)).json().assinatura.id;
    const termina = somarDias(hoje(), -1);
    await prisma.assinaturaDoCliente.update({
      where: { id },
      data: {
        situacao: "ativa",
        cicloComecaEm: dataParaDate(somarDias(termina, -30)),
        cicloTerminaEm: dataParaDate(termina),
        pagoAte: dataParaDate(somarDias(termina, 30)),
      },
    });

    const [assinatura] = (await minhas(c)).json().assinaturas;

    expect(assinatura).toMatchObject({ cicloComecaEm: termina, cicloTerminaEm: somarDias(termina, 30) });
    await c.app.close();
  });
});

describe("cancelar", () => {
  it("cancela no provedor, depois aqui, e avisa quem vende", async () => {
    const c = await cenario();
    const id = (await assinar(c, c.daCasa.id)).json().assinatura.id;
    const idExterno = c.provedores.pedidosDeAssinatura[0]!.id;

    const resposta = await cancelar(c, id);

    expect(resposta.statusCode).toBe(204);
    expect(c.provedores.cancelamentos).toEqual([idExterno]);
    const depois = await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id } });
    expect(depois.situacao).toBe("cancelada");
    const avisos = await prisma.notificacao.findMany({ where: { barbeiroId: c.dono.barbeiroId, tipo: "pagamento" } });
    expect(avisos).toEqual([
      expect.objectContaining({
        titulo: "Assinatura cancelada",
        texto: "João da Silva cancelou a assinatura do plano Corte ilimitado.",
        link: `/painel/clientes/${c.cliente.clienteId}`,
      }),
    ]);
    // Cancelada de novo não é erro, nem fala com o provedor de novo.
    expect((await cancelar(c, id)).statusCode).toBe(204);
    expect(c.provedores.cancelamentos).toHaveLength(1);
    await c.app.close();
  });

  it("o provedor fora do ar: 502 e segue viva", async () => {
    const c = await cenario();
    const id = (await assinar(c, c.daCasa.id)).json().assinatura.id;
    c.provedores.indisponivel = true;

    expect((await cancelar(c, id)).statusCode).toBe(502);
    expect((await prisma.assinaturaDoCliente.findUniqueOrThrow({ where: { id } })).situacao).toBe("pendente");
    await c.app.close();
  });

  it("a de outro cliente é 404", async () => {
    const c = await cenario();
    const id = (await assinar(c, c.daCasa.id)).json().assinatura.id;
    const outro = await criarClienteComToken(c.app, c.dono.slug, "11988887777");

    expect((await cancelar(c, id, outro.token)).statusCode).toBe(404);
    expect(c.provedores.cancelamentos).toEqual([]);
    await c.app.close();
  });
});
