import { randomBytes } from "node:crypto";
import { prisma } from "@barchop/database";
import type { Armazenamento } from "./armazenamento";
import { registrarAuditoria } from "./auditoria";
import { lerCpf } from "./cpf";
import { dateParaData, dateParaHora } from "./horas";

// Os direitos do titular e o encerramento da barbearia (auditoria de
// 15/11, SEC-009). A política de privacidade promete acesso, exclusão e
// apagar os dados de quem encerra; nada disso existia — dependia de SQL à
// mão em produção, sem registro. Aqui estão as três operações, chamadas
// pelo comando de operação (scripts/titular.ts). Cada uma deixa uma
// linha na trilha de auditoria, sem dado do titular.
//
// Não há rota: quem pede é atendido pelo responsável pela plataforma,
// que confere a identidade antes de rodar o comando.

// O que a barbearia guarda de um cliente, pra entregar a ele (LGPD, art.
// 18, II e V). Sem o hash da senha: não é dado que se entregue.
export async function exportarCliente(clienteId: string) {
  const cliente = await prisma.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    include: {
      barbearia: { select: { nome: true, slug: true } },
      agendamentos: {
        orderBy: [{ data: "asc" }, { horaInicio: "asc" }],
        include: {
          barbeiro: { select: { nome: true } },
          servicos: { include: { servico: { select: { nome: true } } } },
        },
      },
      assinaturas: {
        orderBy: { criadoEm: "asc" },
        include: { plano: { select: { nome: true } } },
      },
    },
  });

  await registrarAuditoria(prisma, {
    ator: { tipo: "sistema" },
    acao: "titular.exportar",
    alvo: { tipo: "cliente", id: cliente.id },
    barbeariaId: cliente.barbeariaId,
  });

  return {
    exportadoEm: new Date().toISOString(),
    barbearia: cliente.barbearia,
    cliente: {
      id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email,
      cpf: lerCpf(cliente),
      temConta: cliente.senhaHash !== null,
      criadoEm: cliente.criadoEm.toISOString(),
    },
    agendamentos: cliente.agendamentos.map((agendamento) => ({
      id: agendamento.id,
      data: dateParaData(agendamento.data),
      horaInicio: dateParaHora(agendamento.horaInicio),
      horaFim: dateParaHora(agendamento.horaFim),
      status: agendamento.status,
      origem: agendamento.origem,
      com: agendamento.barbeiro.nome,
      servicos: agendamento.servicos.map((s) => ({ nome: s.servico.nome, preco: s.precoNoMomento.toString() })),
      observacoes: agendamento.observacoes,
      emailLembrete: agendamento.emailLembrete,
      criadoEm: agendamento.criadoEm.toISOString(),
    })),
    assinaturas: cliente.assinaturas.map((assinatura) => ({
      id: assinatura.id,
      plano: assinatura.plano.nome,
      situacao: assinatura.situacao,
      forma: assinatura.forma,
      ciclo: assinatura.ciclo,
      precoCentavos: assinatura.precoCentavos,
      criadoEm: assinatura.criadoEm.toISOString(),
    })),
  };
}

export const NOME_DO_REMOVIDO = "Cliente removido";

// A exclusão a pedido do titular (LGPD, art. 18, VI). O cadastro não é
// apagado, é esvaziado: os horários e os pagamentos dele são a agenda e
// o caixa da barbearia, e continuam existindo — só que de ninguém.
//
// Sai tudo o que identifica: nome, telefone, e-mail, CPF, senha, a
// observação e o e-mail de lembrete de cada horário, e os códigos de
// verificação pedidos pros contatos dele. A sessão que ele tinha para de
// valer. O telefone fica livre: se a pessoa voltar, é um cadastro novo.
//
// Assinatura online viva não é cancelada aqui — cancelar no provedor é
// da barbearia, e vem antes.
export async function anonimizarCliente(clienteId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.findUniqueOrThrow({
      where: { id: clienteId },
      select: { id: true, barbeariaId: true, telefone: true, email: true },
    });

    await tx.codigoVerificacao.deleteMany({
      where: {
        barbeariaId: cliente.barbeariaId,
        destino: { in: [cliente.telefone, ...(cliente.email ? [cliente.email] : [])] },
      },
    });
    await tx.agendamento.updateMany({
      where: { clienteId: cliente.id },
      data: { observacoes: null, emailLembrete: null },
    });
    await tx.cliente.update({
      where: { id: cliente.id },
      data: {
        nome: NOME_DO_REMOVIDO,
        // O telefone é obrigatório e único na barbearia: entra um valor
        // que não é telefone de ninguém, e que não repete.
        telefone: `removido-${randomBytes(5).toString("hex")}`,
        email: null,
        senhaHash: null,
        cpf: null,
        cpfCifrado: null,
        // Token emitido antes disto é recusado (plugins/auth.ts). Um
        // segundo à frente: a comparação lá é no segundo, e sem a folga
        // um token emitido neste mesmo segundo continuaria valendo. Não
        // há token novo pra atrapalhar — o cadastro ficou sem senha.
        senhaAlteradaEm: new Date(Date.now() + 1000),
      },
    });

    await registrarAuditoria(tx, {
      ator: { tipo: "sistema" },
      acao: "titular.anonimizar",
      alvo: { tipo: "cliente", id: cliente.id },
      barbeariaId: cliente.barbeariaId,
    });
  });
}

export interface ResumoDoEncerramento {
  barbeariaId: string;
  slug: string;
  membros: number;
  clientes: number;
  agendamentos: number;
  imagens: number;
}

// O encerramento da conta de uma barbearia: apaga a barbearia e tudo o
// que é dela, e as imagens no armazenamento. Não tem volta — o comando
// pede confirmação.
//
// Recusa enquanto houver cobrança viva num provedor: apagar a linha não
// cancela nada na Stripe nem no Asaas, e o cartão de alguém continuaria
// sendo cobrado por um serviço que não existe mais.
export async function encerrarBarbearia(
  slug: string,
  deps: { armazenamento: Pick<Armazenamento, "apagar"> }
): Promise<ResumoDoEncerramento> {
  const barbearia = await prisma.barbearia.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      capaChave: true,
      logoChave: true,
      assinatura: { select: { stripeSubscriptionId: true } },
      barbeiros: { select: { fotoChave: true } },
      servicos: { select: { fotoChave: true } },
    },
  });
  if (!barbearia) throw new Error(`a barbearia "${slug}" não existe`);

  if (barbearia.assinatura?.stripeSubscriptionId) {
    throw new Error(
      "a barbearia tem assinatura do BarChop no cartão: cancele na Stripe antes de encerrar"
    );
  }
  const onlineVivas = await prisma.assinaturaDoCliente.count({
    where: { barbeariaId: barbearia.id, forma: "online", situacao: { notIn: ["cancelada"] } },
  });
  if (onlineVivas > 0) {
    throw new Error(
      `a barbearia tem ${onlineVivas} assinatura(s) de cliente cobrada(s) online: cancele no provedor antes de encerrar`
    );
  }

  const chaves = [
    barbearia.capaChave,
    barbearia.logoChave,
    ...barbearia.barbeiros.map((b) => b.fotoChave),
    ...barbearia.servicos.map((s) => s.fotoChave),
  ].filter((chave): chave is string => Boolean(chave));

  const resumo = await prisma.$transaction(async (tx) => {
    const [membros, clientes, agendamentos] = await Promise.all([
      tx.barbeiro.count({ where: { barbeariaId: barbearia.id } }),
      tx.cliente.count({ where: { barbeariaId: barbearia.id } }),
      tx.agendamento.count({ where: { barbeariaId: barbearia.id } }),
    ]);
    const contagem = { membros, clientes, agendamentos, imagens: chaves.length };

    // A trilha não tem chave estrangeira: esta linha fica.
    await registrarAuditoria(tx, {
      ator: { tipo: "sistema" },
      acao: "barbearia.encerrar",
      alvo: { tipo: "barbearia", id: barbearia.id },
      barbeariaId: barbearia.id,
      detalhe: { slug: barbearia.slug, ...contagem },
    });
    // Os agendamentos primeiro: as chaves deles pro profissional, pro
    // cliente e pro serviço são RESTRICT, e a cascata da barbearia
    // pararia nelas. Com eles saem, em cascata, os serviços de cada
    // horário e os pagamentos. O resto a barbearia leva.
    await tx.agendamento.deleteMany({ where: { barbeariaId: barbearia.id } });
    await tx.barbearia.delete({ where: { id: barbearia.id } });
    return { barbeariaId: barbearia.id, slug: barbearia.slug, ...contagem };
  });

  // Depois do commit: imagem órfã no bucket é sujeira; barbearia apagada
  // pela metade porque o bucket não respondeu seria pior. A que falhar
  // aparece no erro, pra ser apagada à mão.
  const falhas: string[] = [];
  for (const chave of chaves) {
    try {
      await deps.armazenamento.apagar(chave);
    } catch {
      falhas.push(chave);
    }
  }
  if (falhas.length > 0) {
    throw new Error(
      `barbearia apagada do banco, mas ${falhas.length} imagem(ns) ficaram no armazenamento: ${falhas.join(", ")}`
    );
  }
  return resumo;
}
