import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { emitirCodigo } from "../../src/lib/codigos";
import { cpfParaGravar } from "../../src/lib/cpf";
import { dataParaDate, horaParaDate } from "../../src/lib/horas";
import { normalizarTelefoneObrigatorio } from "../../src/lib/telefone";
import { anonimizarCliente, encerrarBarbearia, exportarCliente } from "../../src/lib/titular";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { criarClienteComToken } from "../helpers/cliente";

// Auditoria de segurança de 15/11, SEC-009. A política de privacidade
// promete acesso, exclusão e apagar os dados no encerramento; nada disso
// existia no sistema — dependia de SQL à mão em produção, sem registro.
// Estes são os comandos de operação (scripts/titular.ts).

const TELEFONE = "11999998888";
const CPF = "52998224725";

async function cenario() {
  const app = buildApp();
  const dono = await criarBarbeariaComToken(app, "um");
  const cliente = await criarClienteComToken(app, dono.slug, TELEFONE);
  await prisma.cliente.update({
    where: { id: cliente.clienteId },
    data: { email: "joao@exemplo.com", ...cpfParaGravar(CPF) },
  });
  const servico = await prisma.servico.create({
    data: { barbeariaId: dono.barbeariaId, nome: "Corte", duracaoMinutos: 30, preco: "45.00" },
  });
  const agendamento = await prisma.agendamento.create({
    data: {
      barbeariaId: dono.barbeariaId,
      barbeiroId: dono.barbeiroId,
      clienteId: cliente.clienteId,
      data: dataParaDate("2026-09-10"),
      horaInicio: horaParaDate("10:00"),
      horaFim: horaParaDate("10:30"),
      observacoes: "alérgico a lâmina",
      emailLembrete: "joao@exemplo.com",
      servicos: { create: [{ servicoId: servico.id, precoNoMomento: "45.00", duracaoNoMomento: 30 }] },
    },
  });
  return { app, dono, cliente, agendamento };
}

function conta(app: App, token: string) {
  return app.inject({ method: "GET", url: "/clientes/me", headers: auth(token) });
}

describe("exportarCliente", () => {
  it("devolve o cadastro, os horários e as assinaturas, sem o hash da senha", async () => {
    const c = await cenario();

    const dados = await exportarCliente(c.cliente.clienteId);

    expect(dados.cliente).toMatchObject({
      nome: "João da Silva",
      telefone: normalizarTelefoneObrigatorio(TELEFONE),
      email: "joao@exemplo.com",
      cpf: CPF,
      temConta: true,
    });
    expect(dados.agendamentos).toHaveLength(1);
    expect(dados.agendamentos[0]).toMatchObject({ data: "2026-09-10", horaInicio: "10:00", observacoes: "alérgico a lâmina" });
    expect(dados.assinaturas).toEqual([]);
    expect(JSON.stringify(dados)).not.toContain("scrypt");
    await c.app.close();
  });

  it("fica na trilha, sem dado do titular", async () => {
    const c = await cenario();

    await exportarCliente(c.cliente.clienteId);

    const linha = await prisma.auditoria.findFirstOrThrow({ where: { acao: "titular.exportar" } });
    expect(linha).toMatchObject({
      atorTipo: "sistema",
      alvoTipo: "cliente",
      alvoId: c.cliente.clienteId,
      barbeariaId: c.dono.barbeariaId,
    });
    expect(JSON.stringify(linha)).not.toMatch(/joao@|João|99999|52998/);
    await c.app.close();
  });
});

describe("anonimizarCliente", () => {
  it("tira nome, telefone, e-mail, CPF e senha; o histórico fica, sem o que identifica", async () => {
    const c = await cenario();
    await emitirCodigo({ finalidade: "senha_cliente", destino: "joao@exemplo.com", barbeariaId: c.dono.barbeariaId });

    await anonimizarCliente(c.cliente.clienteId);

    const cliente = await prisma.cliente.findUniqueOrThrow({ where: { id: c.cliente.clienteId } });
    expect(cliente.nome).toBe("Cliente removido");
    expect(cliente.telefone).not.toContain("99999");
    expect(cliente).toMatchObject({ email: null, senhaHash: null, cpf: null, cpfCifrado: null });
    // O horário fica — é o caixa e a agenda da barbearia —, sem a
    // observação e sem o e-mail de lembrete.
    const agendamento = await prisma.agendamento.findUniqueOrThrow({ where: { id: c.agendamento.id } });
    expect(agendamento).toMatchObject({ clienteId: c.cliente.clienteId, observacoes: null, emailLembrete: null });
    // Os códigos pedidos pro e-mail e pro telefone dele também saem.
    expect(await prisma.codigoVerificacao.count({ where: { barbeariaId: c.dono.barbeariaId } })).toBe(0);
    await c.app.close();
  });

  it("a sessão que ele tinha para de valer, e o telefone fica livre pra um cadastro novo", async () => {
    const c = await cenario();
    expect((await conta(c.app, c.cliente.token)).statusCode).toBe(200);

    await anonimizarCliente(c.cliente.clienteId);

    expect((await conta(c.app, c.cliente.token)).statusCode).toBe(401);
    const novo = await criarClienteComToken(c.app, c.dono.slug, TELEFONE);
    expect(novo.clienteId).not.toBe(c.cliente.clienteId);
    await c.app.close();
  });

  it("fica na trilha, sem dado do titular; duas vezes não estraga nada", async () => {
    const c = await cenario();

    await anonimizarCliente(c.cliente.clienteId);
    await anonimizarCliente(c.cliente.clienteId);

    const linhas = await prisma.auditoria.findMany({ where: { acao: "titular.anonimizar" } });
    expect(linhas).toHaveLength(2);
    expect(JSON.stringify(linhas)).not.toMatch(/joao@|João|99999|52998/);
    await c.app.close();
  });
});

describe("encerrarBarbearia", () => {
  it("apaga a barbearia com tudo dela, e só dela", async () => {
    const c = await cenario();
    const outra = await criarBarbeariaComToken(c.app, "dois");
    await criarClienteComToken(c.app, outra.slug, TELEFONE);

    const resumo = await encerrarBarbearia(c.dono.slug, { armazenamento: c.app.armazenamento });

    expect(resumo).toMatchObject({ clientes: 1, agendamentos: 1, membros: 1 });
    expect(await prisma.barbearia.count()).toBe(1);
    expect(await prisma.barbeiro.count({ where: { barbeariaId: c.dono.barbeariaId } })).toBe(0);
    expect(await prisma.cliente.count({ where: { barbeariaId: c.dono.barbeariaId } })).toBe(0);
    expect(await prisma.agendamento.count({ where: { barbeariaId: c.dono.barbeariaId } })).toBe(0);
    expect(await prisma.cliente.count({ where: { barbeariaId: outra.barbeariaId } })).toBe(1);
    // O token do dono morre junto.
    const me = await c.app.inject({ method: "GET", url: "/me", headers: auth(c.dono.token) });
    expect(me.statusCode).toBe(401);
    await c.app.close();
  });

  it("fica na trilha, que sobrevive à barbearia", async () => {
    const c = await cenario();

    await encerrarBarbearia(c.dono.slug, { armazenamento: c.app.armazenamento });

    const linha = await prisma.auditoria.findFirstOrThrow({ where: { acao: "barbearia.encerrar" } });
    expect(linha).toMatchObject({ atorTipo: "sistema", barbeariaId: c.dono.barbeariaId });
    expect(linha.detalhe).toMatchObject({ slug: c.dono.slug, clientes: 1 });
    await c.app.close();
  });

  it("recusa enquanto houver cobrança viva no provedor: cancelar lá vem antes", async () => {
    // Apagar a linha não cancela a assinatura na Stripe nem no Asaas: o
    // cartão continuaria sendo cobrado por um serviço que não existe.
    const c = await cenario();
    await prisma.assinatura.update({
      where: { barbeariaId: c.dono.barbeariaId },
      data: { stripeSubscriptionId: "sub_viva" },
    });

    await expect(encerrarBarbearia(c.dono.slug, { armazenamento: c.app.armazenamento })).rejects.toThrow(/cartão/i);
    expect(await prisma.barbearia.count()).toBe(1);
    await c.app.close();
  });

  it("link que não existe: erro claro, nada apagado", async () => {
    const c = await cenario();

    await expect(encerrarBarbearia("nao-existe", { armazenamento: c.app.armazenamento })).rejects.toThrow(/não existe/i);
    expect(await prisma.barbearia.count()).toBe(1);
    await c.app.close();
  });
});
