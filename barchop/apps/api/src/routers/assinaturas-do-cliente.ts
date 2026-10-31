import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { normalizarCpf, usosRestantes, type CicloDoCliente, type SituacaoDoAssinante } from "@barchop/formato";
import type { AssinaturaNaConta, AssinaturaOnlineCriada, MinhasAssinaturas, PagamentoConferido } from "@barchop/types";
import { naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { agoraNaBarbearia, dataParaDate, dateParaData, somarDias } from "../lib/horas";
import {
  confirmarPagamentoDoLink,
  criarLinkNaInfinitePay,
  linkParaGravar,
  MINIMO_DA_INFINITEPAY_CENTAVOS,
  type ConferenciaDoLink,
  type LinkCriado,
} from "../lib/links-do-ciclo";
import { notificarQuemVende } from "../lib/notificacoes";
import { PADRAO_UUID } from "../lib/padroes";
import {
  ONLINE_A_CANCELAR,
  PLANO_A_VENDA,
  cancelarNoProvedor,
  contasQueRecebem,
  marcarAtrasadas,
  usosNoCiclo,
  vitrineAberta,
} from "../lib/planos-do-cliente";
import {
  ErroDoProvedor,
  erroHttpDoProvedor,
  nomeDoProvedor,
  provedorGravado,
  type NomeDoProvedor,
} from "../lib/provedores";
import { clienteDoToken } from "../plugins/auth";
import type { App } from "../tipos";

// O cliente assina online, vê e cancela as assinaturas dele (Onda 2,
// marco 3, PR 10c do plano planos-de-assinatura; decisão 8). Logado na
// página pública: o id do cliente e a barbearia vêm do token.
//
// Assinar só vende o que a vitrine mostra como online (a mesma regra,
// em lib/planos-do-cliente). O provedor da conta de quem vende (Asaas ou
// Stripe) cria o cliente e a assinatura, e devolve o link da fatura: o
// cliente escolhe ali como paga, e o BarChop nunca vê cartão. O CPF só
// quando o provedor pede (`pedeCpf`): na Stripe, nem conferido nem
// guardado. A assinatura nasce pendente (ou em teste, com dias
// grátis); o webhook (PR 10a) a ativa quando o dinheiro entra.

const corpoAssinar = {
  type: "object",
  additionalProperties: false,
  required: ["planoId"],
  properties: {
    planoId: { type: "string", pattern: PADRAO_UUID },
    // Com ou sem máscara. Obrigatório só enquanto o cadastro não tem.
    cpf: { type: "string", minLength: 1, maxLength: 20 },
  },
} as const;

const corpoConferir = {
  type: "object",
  additionalProperties: false,
  required: ["orderNsu", "transactionNsu", "slug"],
  properties: {
    orderNsu: { type: "string", minLength: 1, maxLength: 100 },
    transactionNsu: { type: "string", minLength: 1, maxLength: 100 },
    slug: { type: "string", minLength: 1, maxLength: 100 },
  },
} as const;

const paramsComId = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: { id: { type: "string", pattern: PADRAO_UUID } },
} as const;

// Campos um a um: o vendedor é um barbeiro, e um include traria o
// senhaHash.
const INCLUDE_NA_CONTA = {
  plano: {
    select: {
      id: true,
      nome: true,
      vendedorId: true,
      vendedor: { select: { id: true, nome: true } },
      servicos: {
        where: { servico: { ativo: true } },
        select: { servicoId: true, usosPorCiclo: true, servico: { select: { nome: true } } },
        orderBy: [{ servico: { ordem: "asc" } }, { servicoId: "asc" }],
      },
    },
  },
} satisfies Prisma.AssinaturaDoClienteInclude;

type AssinaturaComPlano = Prisma.AssinaturaDoClienteGetPayload<{ include: typeof INCLUDE_NA_CONTA }>;

async function serializar(db: Prisma.TransactionClient, assinatura: AssinaturaComPlano): Promise<AssinaturaNaConta> {
  const usados = await usosNoCiclo(db, assinatura, null);
  const { plano } = assinatura;
  return {
    id: assinatura.id,
    situacao: assinatura.situacao as SituacaoDoAssinante,
    forma: assinatura.forma as AssinaturaNaConta["forma"],
    precoCentavos: assinatura.precoCentavos,
    ciclo: assinatura.ciclo as CicloDoCliente,
    cicloComecaEm: assinatura.cicloComecaEm ? dateParaData(assinatura.cicloComecaEm) : null,
    cicloTerminaEm: assinatura.cicloTerminaEm ? dateParaData(assinatura.cicloTerminaEm) : null,
    canceladaEm: assinatura.canceladaEm?.toISOString() ?? null,
    criadoEm: assinatura.criadoEm.toISOString(),
    plano: { id: plano.id, nome: plano.nome, daCasa: plano.vendedorId === null, vendedor: plano.vendedor },
    servicos: plano.servicos.map((s) => ({
      servicoId: s.servicoId,
      nome: s.servico.nome,
      usosPorCiclo: s.usosPorCiclo,
      usosRestantes: usosRestantes(s.usosPorCiclo, usados.get(s.servicoId) ?? 0),
    })),
  };
}

const indisponivel = () => new ErroDeNegocio("este plano não está à venda online agora", "plano_indisponivel");
const jaAssina = () => new ErroDeNegocio("você já assina este plano", "ja_assina");

// O erro do provedor vira resposta. A chave revogada é problema da conta
// de quem vende, e não de quem assina: pro cliente, o plano não está à
// venda agora.
async function noProvedor<T>(provedor: NomeDoProvedor, pedido: Promise<T>, log: FastifyBaseLogger): Promise<T> {
  try {
    return await pedido;
  } catch (erro) {
    if (!(erro instanceof ErroDoProvedor)) throw erro;
    // A InfinitePay não tem sandbox e a documentação é vaga: a mensagem
    // do conector (os campos que vieram) é o que diz o que mudou.
    if (provedor === "infinitepay") {
      log.warn({ codigo: erro.codigo, mensagem: erro.message }, "a InfinitePay recusou o pedido do assinar");
    }
    if (erro.codigo === "chave_invalida") {
      log.warn({ provedor }, "assinar online com a chave da conta de quem vende recusada pelo provedor");
      throw indisponivel();
    }
    throw erroHttpDoProvedor(erro, provedor);
  }
}

export function registrarRotasAssinaturasDoCliente(app: App): void {
  app.post(
    "/clientes/me/assinaturas",
    { schema: { body: corpoAssinar } },
    async (request, reply): Promise<AssinaturaOnlineCriada> => {
      const { clienteId, barbeariaId } = clienteDoToken(request);
      const plano = await prisma.planoDeAssinatura.findFirst({ where: { id: request.body.planoId, barbeariaId } });
      if (!plano) throw naoEncontrado();

      // Uma viva por cliente e plano. A online pendente ou em atraso é
      // quem tem fatura a pagar: volta pra ela, em vez de criar outra.
      // Antes das regras de venda: plano fora de venda, vitrine desligada
      // ou o Grátis não param a assinatura que existe (decisão 6), e quem
      // está devendo precisa da fatura. Só a conta desligada (sem chave)
      // ou de outro modo não tem pra onde voltar.
      const viva = await prisma.assinaturaDoCliente.findFirst({
        where: { planoId: plano.id, clienteId, situacao: { not: "cancelada" } },
        include: { ...INCLUDE_NA_CONTA, conexao: true },
      });
      if (viva) {
        const aPagar = viva.situacao === "pendente" || viva.situacao === "em_atraso";
        const contaViva =
          viva.conexao !== null &&
          viva.conexao.desconectadaEm === null &&
          viva.conexao.modo === app.provedores.modoAceito;
        if (viva.forma !== "online" || !aPagar || !contaViva) throw jaAssina();
        // Na InfinitePay, a fatura é o link aberto do ciclo, que já está
        // no banco: nada de pedir outro.
        if (viva.conexao!.provedor === "infinitepay") {
          const aberto = await prisma.linkDoCiclo.findFirst({
            where: { assinaturaId: viva.id, situacao: "aberto" },
            orderBy: { vencimento: "desc" },
            select: { url: true },
          });
          if (!aberto) throw jaAssina();
          return reply.code(200).send({ assinatura: await serializar(prisma, viva), linkDaFatura: aberto.url });
        }
        if (!viva.idExterno) throw jaAssina();
        const provedor = app.provedores.daConexao(viva.conexao!);
        if (provedor.cobra !== "recorrente") throw jaAssina();
        const linkDaFatura = await noProvedor(provedor.nome, provedor.linkDaFatura(viva.idExterno), request.log);
        return reply.code(200).send({ assinatura: await serializar(prisma, viva), linkDaFatura });
      }

      // A regra da vitrine: aberta, plano à venda e online, com serviço
      // ativo, e a conta de quem vende ligada e do modo aceito. Tudo
      // antes de falar com o provedor, pra não criar nada lá à toa.
      if (!(await vitrineAberta(prisma, barbeariaId))) throw indisponivel();
      const aVenda = await prisma.planoDeAssinatura.count({
        where: { id: plano.id, ...PLANO_A_VENDA, aceitaOnline: true, servicos: { some: { servico: { ativo: true } } } },
      });
      if (aVenda === 0) throw indisponivel();
      const conexao = await prisma.conexaoDePagamento.findFirst({
        where: {
          ...contasQueRecebem(barbeariaId, app.provedores.modoAceito),
          ...(plano.vendedorId === null ? { daCasa: true } : { daCasa: false, barbeiroId: plano.vendedorId }),
        },
      });
      if (!conexao) throw indisponivel();

      const provedor = app.provedores.daConexao(conexao);
      const cliente = await prisma.cliente.findUniqueOrThrow({
        where: { id: clienteId },
        select: { id: true, nome: true, email: true, telefone: true, cpf: true },
      });

      // A InfinitePay (plano pagamentos-online-infinitepay, PR 4): sem
      // assinatura nem cliente no provedor. Sem dias grátis, o link do
      // primeiro ciclo sai agora, vence hoje e vale os dias para cancelar
      // da conta; com dias grátis, sai no fim do teste (a varredura do
      // PR 5). A assinatura e o link são gravados juntos: não há pendente
      // sem link.
      if (provedor.cobra === "link") {
        if (plano.precoCentavos < MINIMO_DA_INFINITEPAY_CENTAVOS) throw indisponivel();
        const hoje = agoraNaBarbearia().data;
        const emTeste = plano.diasDeTeste > 0;
        const id = randomUUID();
        let link: LinkCriado | null = null;
        if (!emTeste) {
          const { slug } = await prisma.barbearia.findUniqueOrThrow({ where: { id: barbeariaId }, select: { slug: true } });
          link = await noProvedor(
            provedor.nome,
            criarLinkNaInfinitePay(app.provedores, provedor, {
              conexaoId: conexao.id,
              slug,
              vencimento: hoje,
              valorCentavos: plano.precoCentavos,
              descricao: plano.nome,
              cliente: { nome: cliente.nome, email: cliente.email, telefone: cliente.telefone },
              diasParaCancelar: conexao.diasParaCancelar!,
            }),
            request.log
          );
        }
        let gravada: AssinaturaComPlano;
        try {
          gravada = await prisma.$transaction(async (tx) => {
            const ligada = await tx.$queryRaw<{ id: string }[]>`
              SELECT id FROM conexao_de_pagamento
              WHERE id = ${conexao.id}::uuid AND desconectada_em IS NULL AND modo = ${app.provedores.modoAceito}
              FOR SHARE`;
            if (ligada.length === 0) throw indisponivel();
            const criada = await tx.assinaturaDoCliente.create({
              data: {
                id,
                barbeariaId,
                planoId: plano.id,
                clienteId: cliente.id,
                situacao: emTeste ? "teste" : "pendente",
                forma: "online",
                conexaoId: conexao.id,
                precoCentavos: plano.precoCentavos,
                ciclo: plano.ciclo,
                cicloComecaEm: emTeste ? dataParaDate(hoje) : null,
                cicloTerminaEm: emTeste ? dataParaDate(somarDias(hoje, plano.diasDeTeste)) : null,
              },
              include: INCLUDE_NA_CONTA,
            });
            if (link) await tx.linkDoCiclo.create({ data: linkParaGravar(barbeariaId, id, link) });
            return criada;
          });
        } catch (erro) {
          // O link já criado não tem como ser apagado pela API: ninguém o
          // recebeu, e ele vence sozinho.
          if (link) {
            request.log.warn({ orderNsu: link.orderNsu }, "link da InfinitePay sem assinatura no BarChop ficou no provedor");
          }
          if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw jaAssina();
          throw erro;
        }
        return reply.code(201).send({ assinatura: await serializar(prisma, gravada), linkDaFatura: link?.url ?? null });
      }

      let cpf: string | null = null;
      if (provedor.pedeCpf) {
        cpf = cliente.cpf;
        if (request.body.cpf !== undefined) {
          cpf = normalizarCpf(request.body.cpf);
          if (cpf === null) throw new ErroDeNegocio("o CPF não confere: confira os números", "cpf_invalido");
        }
        if (cpf === null) {
          throw new ErroDeNegocio(`${nomeDoProvedor(provedor.nome).o} pede o CPF de quem assina`, "cpf_obrigatorio");
        }
      }

      // O id sai daqui porque vai na assinatura do provedor (a referência
      // de volta). Os pedidos ao provedor ficam fora da transação: é rede.
      const id = randomUUID();
      const hoje = agoraNaBarbearia().data;
      const clienteNoProvedor = await noProvedor(
        provedor.nome,
        provedor.criarCliente({ nome: cliente.nome, cpfCnpj: cpf, email: cliente.email, telefone: cliente.telefone, referencia: cliente.id }),
        request.log
      );
      // Com dias grátis, a primeira cobrança vence no fim do teste; sem,
      // hoje.
      const criada = await noProvedor(
        provedor.nome,
        provedor.criarAssinatura({
          clienteId: clienteNoProvedor,
          valorCentavos: plano.precoCentavos,
          ciclo: plano.ciclo as CicloDoCliente,
          primeiroVencimento: somarDias(hoje, plano.diasDeTeste),
          descricao: plano.nome,
          referencia: id,
          planoId: plano.id,
        }),
        request.log
      );

      let gravada: AssinaturaComPlano;
      try {
        gravada = await prisma.$transaction(async (tx) => {
          // A conta travada: o desconectar trava a mesma linha pra contar
          // as vivas e desligar, e os dois não se cruzam. Desligada no meio,
          // o plano deixou de estar à venda.
          const ligada = await tx.$queryRaw<{ id: string }[]>`
            SELECT id FROM conexao_de_pagamento
            WHERE id = ${conexao.id}::uuid AND desconectada_em IS NULL AND modo = ${app.provedores.modoAceito}
            FOR SHARE`;
          if (ligada.length === 0) throw indisponivel();
          if (cpf !== null && cpf !== cliente.cpf) await tx.cliente.update({ where: { id: cliente.id }, data: { cpf } });
          const emTeste = plano.diasDeTeste > 0;
          return tx.assinaturaDoCliente.create({
            data: {
              id,
              barbeariaId,
              planoId: plano.id,
              clienteId: cliente.id,
              situacao: emTeste ? "teste" : "pendente",
              forma: "online",
              conexaoId: conexao.id,
              idExterno: criada.id,
              precoCentavos: plano.precoCentavos,
              ciclo: plano.ciclo,
              cicloComecaEm: emTeste ? dataParaDate(hoje) : null,
              cicloTerminaEm: emTeste ? dataParaDate(somarDias(hoje, plano.diasDeTeste)) : null,
            },
            include: INCLUDE_NA_CONTA,
          });
        });
      } catch (erro) {
        // Não gravou: a assinatura não pode ficar cobrando no provedor.
        // Com o mesmo conector de antes, porque o desconectar apaga a
        // chave do banco.
        await provedor.cancelarAssinatura(criada.id).catch((falha: unknown) => {
          request.log.warn(
            { falha: String(falha) },
            `assinatura ${nomeDoProvedor(provedor.nome).do} sem assinatura no BarChop ficou no provedor`
          );
        });
        // O duplo clique: o índice de uma viva por cliente e plano deixa
        // um gravar.
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") throw jaAssina();
        throw erro;
      }
      return reply.code(201).send({ assinatura: await serializar(prisma, gravada), linkDaFatura: criada.linkDaFatura });
    }
  );

  // A volta do comprador pela página da InfinitePay (decisão 9): a
  // página da barbearia manda o que veio na query, e a API confere no
  // `payment_check`. Só o link de uma assinatura de quem está logado.
  app.post(
    "/clientes/me/assinaturas/conferir-pagamento",
    { schema: { body: corpoConferir } },
    async (request): Promise<PagamentoConferido> => {
      const { clienteId, barbeariaId } = clienteDoToken(request);
      const { orderNsu, transactionNsu, slug } = request.body;
      const link = await prisma.linkDoCiclo.findFirst({
        where: { orderNsu, barbeariaId, assinatura: { clienteId } },
        select: { id: true, assinaturaId: true },
      });
      if (!link) throw naoEncontrado();
      let resultado: ConferenciaDoLink;
      try {
        resultado = await confirmarPagamentoDoLink({
          fabrica: app.provedores,
          linkId: link.id,
          transactionNsu,
          slug,
          log: request.log,
        });
      } catch (erro) {
        // A chave recusada é problema de quem vende: pro cliente, a
        // InfinitePay só não respondeu.
        if (erro instanceof ErroDoProvedor) {
          throw erroHttpDoProvedor(
            erro.codigo === "chave_invalida" ? new ErroDoProvedor("indisponivel", erro.message) : erro,
            "infinitepay"
          );
        }
        throw erro;
      }
      const assinatura = await prisma.assinaturaDoCliente.findUniqueOrThrow({
        where: { id: link.assinaturaId },
        include: INCLUDE_NA_CONTA,
      });
      return { pago: resultado === "pago", assinatura: await serializar(prisma, assinatura) };
    }
  );

  app.get("/clientes/me/assinaturas", async (request): Promise<MinhasAssinaturas> => {
    const { clienteId, barbeariaId } = clienteDoToken(request);
    // Antes de ler: o atraso do balcão e o ciclo online já pago.
    await marcarAtrasadas(prisma, barbeariaId, agoraNaBarbearia().data, { clienteId });
    const assinaturas = await prisma.assinaturaDoCliente.findMany({
      where: { clienteId, barbeariaId },
      include: INCLUDE_NA_CONTA,
      orderBy: [{ criadoEm: "desc" }, { id: "asc" }],
    });
    return { assinaturas: await Promise.all(assinaturas.map((assinatura) => serializar(prisma, assinatura))) };
  });

  // Cancelada de novo não é erro. A online é cancelada antes no provedor
  // (PR 10b): falhou, nada muda aqui. Quem vende fica sabendo pelo sino:
  // o que o cliente faz sozinho vira aviso. A chave de quem vende
  // revogada é com quem vende: o cliente ouve "fale com a barbearia", e
  // o sino pede a chave nova.
  app.delete(
    "/clientes/me/assinaturas/:id",
    { schema: { params: paramsComId } },
    async (request, reply) => {
      const { clienteId } = clienteDoToken(request);
      const atual = await prisma.assinaturaDoCliente.findFirst({
        where: { id: request.params.id, clienteId },
        select: {
          id: true,
          situacao: true,
          barbeariaId: true,
          ...ONLINE_A_CANCELAR,
          cliente: { select: { nome: true } },
          plano: { select: { nome: true, vendedorId: true } },
        },
      });
      if (!atual) throw naoEncontrado();
      if (atual.situacao === "cancelada") return reply.code(204).send();

      const quemVende = { barbeariaId: atual.barbeariaId, vendedorId: atual.plano.vendedorId };
      const link = `/painel/clientes/${clienteId}`;
      try {
        await cancelarNoProvedor(app.provedores, [atual]);
      } catch (erro) {
        if (!(erro instanceof ErroDeNegocio) || erro.codigo !== "chave_da_conta_recusada") throw erro;
        // A chave recusada é a da conexão: sem ela, o cancelar não pede nada.
        const nome = nomeDoProvedor(provedorGravado(atual.conexao!.provedor));
        await notificarQuemVende(prisma, quemVende, {
          titulo: "Cancelamento não feito",
          texto: `${atual.cliente.nome} tentou cancelar a assinatura do plano ${atual.plano.nome}, mas ${nome.o} não aceitou a chave da conta conectada: troque a chave em Pagamentos online e cancele pelo painel.`,
          link,
        });
        throw new ErroDeNegocio(
          "não deu pra cancelar agora: fale com a barbearia, que já foi avisada",
          "cancelar_indisponivel"
        );
      }
      await prisma.$transaction(async (tx) => {
        // Dois cancelar ao mesmo tempo: só um muda a situação e avisa.
        const { count } = await tx.assinaturaDoCliente.updateMany({
          where: { id: atual.id, situacao: { not: "cancelada" } },
          data: { situacao: "cancelada", canceladaEm: new Date() },
        });
        if (count === 0) return;
        await notificarQuemVende(tx, quemVende, {
          titulo: "Assinatura cancelada",
          texto: `${atual.cliente.nome} cancelou a assinatura do plano ${atual.plano.nome}.`,
          link,
        });
      });
      return reply.code(204).send();
    }
  );
}
