import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import { DIAS_PARA_CANCELAR } from "@barchop/formato";
import type { PagamentosOnline } from "@barchop/types";
import { garantirRecurso } from "../lib/assinatura";
import { gerarTokenDoWebhook, hashDoToken } from "../lib/cifra";
import { conflito, ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import {
  ErroDoProvedor,
  erroHttpDoProvedor,
  nomeDoProvedor,
  PROVEDORES,
  provedorGravado,
  recorrente,
  type FabricaDeProvedores,
  type NomeDoProvedor,
  type ProvedorRecorrente,
} from "../lib/provedores";
import { membroDoToken, type Membro } from "../plugins/auth";
import type { App } from "../tipos";

// Conectar a conta de quem vende no provedor (Onda 2, marco 3, PR 9 do
// plano planos-de-assinatura; decisões 6 e 10). Cada membro tem a sua;
// a da casa (`?daCasa=true`) recebe os planos da casa e é do dono.
// Quem pode:
// - dono: a dele e a da casa;
// - profissional: conecta a dele só com o "pode vender"; vê e desconecta
//   mesmo sem, porque as assinaturas que existem seguem até o fim;
// - recepção: nada.
// Conectar pede o Completo; ver e desconectar, não (no Grátis as
// assinaturas seguem). A chave nunca volta: só `chave_final`.

const filtroDaConta = {
  type: "object",
  additionalProperties: false,
  properties: { daCasa: { type: "boolean" } },
} as const;

const corpoConectar = {
  type: "object",
  additionalProperties: false,
  required: ["provedor", "chave"],
  properties: {
    provedor: { type: "string", enum: [...PROVEDORES] },
    // A do Asaas tem uns 170 caracteres; a folga cobre espaço colado junto.
    chave: { type: "string", minLength: 1, maxLength: 500 },
    // Só a InfinitePay pede (a InfiniteTag, com ou sem o $); as outras
    // não olham.
    tag: { type: "string", maxLength: 100 },
  },
} as const;

const corpoDias = {
  type: "object",
  additionalProperties: false,
  required: ["diasParaCancelar"],
  properties: {
    diasParaCancelar: { type: "integer", minimum: DIAS_PARA_CANCELAR.minimo, maximum: DIAS_PARA_CANCELAR.maximo },
  },
} as const;

// Dono e profissional; o resto da regra depende de `daCasa` e da rota.
async function exigirQuemTemConta(request: FastifyRequest): Promise<void> {
  if (membroDoToken(request).papel === "recepcao") {
    throw new ErroHttp(403, "sem_permissao", "seu papel na equipe não permite isto");
  }
}

// Conectar: dono, ou profissional com "pode vender". onRequest, como o
// `exigirPapel`: a recusa vem antes de o corpo ser lido.
async function exigirQuemVende(request: FastifyRequest): Promise<void> {
  const membro = membroDoToken(request);
  if (membro.papel === "dono" || (membro.papel === "profissional" && membro.podeVenderPlanos)) return;
  throw new ErroHttp(403, "sem_permissao", "seu papel na equipe não permite vender planos");
}

function garantirDaCasa(membro: Membro, daCasa: boolean): void {
  if (daCasa && membro.papel !== "dono") {
    throw new ErroHttp(403, "sem_permissao", "só o dono conecta a conta da casa");
  }
}

// A conta da casa é uma por barbearia; a de cada membro, uma por membro.
// Só as ligadas: a desconectada fica no banco pelo histórico.
function ondeEstaAConta(membro: Membro, daCasa: boolean): Prisma.ConexaoDePagamentoWhereInput {
  const ligada = { barbeariaId: membro.barbeariaId, desconectadaEm: null };
  return daCasa ? { ...ligada, daCasa: true } : { ...ligada, barbeiroId: membro.id, daCasa: false };
}

const SELECT_DA_CONTA = {
  provedor: true,
  modo: true,
  chaveFinal: true,
  infiniteTag: true,
  diasParaCancelar: true,
  criadoEm: true,
} satisfies Prisma.ConexaoDePagamentoSelect;

type ContaGravada = Prisma.ConexaoDePagamentoGetPayload<{ select: typeof SELECT_DA_CONTA }>;

function serializar(daCasa: boolean, modoAceito: PagamentosOnline["modoAceito"], conta: ContaGravada | null): PagamentosOnline {
  return {
    daCasa,
    modoAceito,
    conta: conta && {
      provedor: provedorGravado(conta.provedor),
      modo: conta.modo as "teste" | "real",
      chaveFinal: conta.chaveFinal,
      conectadaEm: conta.criadoEm.toISOString(),
      infiniteTag: conta.infiniteTag,
      diasParaCancelar: conta.diasParaCancelar,
    },
  };
}

// O erro do provedor vira resposta; o resto sobe como está.
async function noProvedor<T>(provedor: NomeDoProvedor, pedido: Promise<T>): Promise<T> {
  try {
    return await pedido;
  } catch (erro) {
    throw erro instanceof ErroDoProvedor ? erroHttpDoProvedor(erro, provedor) : erro;
  }
}

// A InfiniteTag como quem vende copia do app: com ou sem o $. Letras,
// números, ponto, hífen e sublinhado: o que cabe no `handle` sem espaço.
const PADRAO_DA_TAG = /^[A-Za-z0-9._-]{1,40}$/;

function lerTag(colada: string | undefined): string {
  const tag = (colada ?? "").trim().replace(/^\$/, "");
  if (tag === "") throw new ErroDeNegocio("a InfinitePay pede a InfiniteTag da conta", "tag_obrigatoria");
  if (!PADRAO_DA_TAG.test(tag)) {
    throw new ErroDeNegocio(
      "a InfiniteTag tem até 40 letras, números, pontos, hífens ou sublinhados, sem espaço: confira no app da InfinitePay",
      "tag_invalida"
    );
  }
  return tag;
}

// Conectar a InfinitePay (plano pagamentos-online-infinitepay, PR 3).
// Sem webhook da conta: cada link leva o endereço do aviso. A conta é a
// da InfiniteTag: trocar a chave só vale com uma da mesma conta (a que o
// `payment_check` aceita com a tag gravada); trocar a tag é outra conta,
// e pede desconectar antes, como trocar de provedor.
async function conectarInfinitePay(dados: {
  fabrica: FabricaDeProvedores;
  membro: Membro;
  daCasa: boolean;
  chave: string;
  tag: string;
  modo: "teste" | "real";
  log: FastifyRequest["log"];
}): Promise<PagamentosOnline> {
  const { fabrica, membro, daCasa, chave, tag, modo } = dados;
  const nome = nomeDoProvedor("infinitepay");
  const atual = await prisma.conexaoDePagamento.findFirst({
    where: ondeEstaAConta(membro, daCasa),
    select: { id: true, provedor: true, infiniteTag: true },
  });
  if (atual && atual.provedor !== "infinitepay") {
    throw new ErroDeNegocio(
      `a conta conectada é ${nomeDoProvedor(provedorGravado(atual.provedor)).do}: desconecte antes de conectar a ${nome.do}`,
      "outra_conta"
    );
  }
  if (atual && atual.infiniteTag !== tag) {
    throw new ErroDeNegocio(
      `a conta conectada é a da InfiniteTag ${atual.infiniteTag}: desconecte antes de conectar outra`,
      "outra_conta"
    );
  }

  const provedor = fabrica.daChave({ provedor: "infinitepay", chave, tag });
  try {
    await provedor.conferirChave();
  } catch (erro) {
    if (erro instanceof ErroDoProvedor) {
      dados.log.warn({ codigo: erro.codigo, mensagem: erro.message }, "a InfinitePay recusou conectar");
    }
    if (atual && erro instanceof ErroDoProvedor && erro.codigo === "chave_invalida") {
      throw new ErroDeNegocio(
        `esta chave não vale para a InfiniteTag ${tag}: confira se ela é dessa conta e se está ativa`,
        "outra_conta"
      );
    }
    if (erro instanceof ErroDoProvedor) throw erroHttpDoProvedor(erro, "infinitepay");
    throw erro;
  }
  const chaveFinal = chave.slice(-4);
  const chaveCifrada = Buffer.from(fabrica.cifrar(chave));

  if (atual) {
    const trocada = await prisma.conexaoDePagamento.update({
      where: { id: atual.id },
      data: { chaveCifrada, chaveFinal },
      select: SELECT_DA_CONTA,
    });
    return serializar(daCasa, fabrica.modoAceito, trocada);
  }

  try {
    const criada = await prisma.conexaoDePagamento.create({
      data: {
        barbeariaId: membro.barbeariaId,
        barbeiroId: membro.id,
        daCasa,
        provedor: "infinitepay",
        modo,
        chaveCifrada,
        chaveFinal,
        // O aviso da InfinitePay não traz nada que se confira: cada
        // pagamento passa pelo `payment_check` (PR 4). A coluna pede um
        // hash; fica o de um token que ninguém recebe.
        webhookTokenHash: hashDoToken(gerarTokenDoWebhook()),
        infiniteTag: tag,
        diasParaCancelar: DIAS_PARA_CANCELAR.padrao,
      },
      select: SELECT_DA_CONTA,
    });
    return serializar(daCasa, fabrica.modoAceito, criada);
  } catch (erro) {
    if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
      throw conflito("a conta acabou de ser conectada por outro pedido");
    }
    throw erro;
  }
}

export function registrarRotasPagamentosOnline(app: App): void {
  app.get(
    "/barbearias/me/pagamentos-online",
    { onRequest: exigirQuemTemConta, schema: { querystring: filtroDaConta } },
    async (request): Promise<PagamentosOnline> => {
      const membro = membroDoToken(request);
      const daCasa = request.query.daCasa ?? false;
      garantirDaCasa(membro, daCasa);
      const conta = await prisma.conexaoDePagamento.findFirst({
        where: ondeEstaAConta(membro, daCasa),
        select: SELECT_DA_CONTA,
      });
      return serializar(daCasa, app.provedores.modoAceito, conta);
    }
  );

  // Conectar, ou trocar a chave da conta conectada. A troca só vale com
  // chave da mesma conta no provedor (a que enxerga o webhook gravado):
  // mudar de conta deixaria as assinaturas da antiga sem webhook.
  app.put(
    "/barbearias/me/pagamentos-online",
    { onRequest: exigirQuemVende, schema: { querystring: filtroDaConta, body: corpoConectar } },
    async (request): Promise<PagamentosOnline> => {
      const membro = membroDoToken(request);
      const daCasa = request.query.daCasa ?? false;
      garantirDaCasa(membro, daCasa);
      await garantirRecurso(prisma, membro.barbeariaId, "planosDaBarbearia", new Date());

      const { provedor: escolhido } = request.body;
      const nome = nomeDoProvedor(escolhido);
      const chave = request.body.chave.trim();
      const fabrica = app.provedores;
      const modo = fabrica.modoDaChave(escolhido, chave);
      if (modo === null) {
        throw new ErroDeNegocio(
          `isso não é uma chave de API ${nome.do}: ela começa com ${nome.inicioDaChave}`,
          "chave_invalida"
        );
      }
      if (modo !== fabrica.modoAceito) {
        let mensagem = `esta é uma chave ${nome.real} ${nome.do}: aqui só vale a ${nome.teste}`;
        if (modo === "teste") {
          mensagem = `esta é uma chave ${nome.teste} ${nome.do}, que não move dinheiro: use a chave ${nome.real}`;
        } else if (escolhido === "infinitepay") {
          mensagem = `${nome.o} não tem chave ${nome.teste}, e aqui só vale a ${nome.teste}`;
        }
        throw new ErroDeNegocio(mensagem, "modo_errado");
      }
      if (escolhido === "infinitepay") {
        const tag = lerTag(request.body.tag);
        return conectarInfinitePay({ fabrica, membro, daCasa, chave, tag, modo, log: request.log });
      }
      const provedor: ProvedorRecorrente = fabrica.daChave({ provedor: escolhido, chave });
      await noProvedor(escolhido, provedor.conferirChave());
      const chaveFinal = chave.slice(-4);

      const atual = await prisma.conexaoDePagamento.findFirst({
        where: ondeEstaAConta(membro, daCasa),
        select: { id: true, provedor: true, idExternoWebhook: true },
      });
      // Uma conta ligada por vendedor (decisão 8): pra trocar de
      // provedor, desconecta antes. O webhook gravado é do outro provedor,
      // e a chave nova nem o enxergaria.
      if (atual && atual.provedor !== escolhido) {
        throw new ErroDeNegocio(
          `a conta conectada é ${nomeDoProvedor(provedorGravado(atual.provedor)).do}: desconecte antes de conectar a ${nome.do}`,
          "outra_conta"
        );
      }
      if (atual) {
        const mesmaConta =
          atual.idExternoWebhook !== null && (await noProvedor(escolhido, provedor.temWebhook(atual.idExternoWebhook)));
        if (!mesmaConta) {
          throw new ErroDeNegocio(
            `esta chave é de outra conta ${nome.do}: desconecte a conta atual antes de conectar outra`,
            "outra_conta"
          );
        }
        const trocada = await prisma.conexaoDePagamento.update({
          where: { id: atual.id },
          data: { chaveCifrada: Buffer.from(fabrica.cifrar(chave)), chaveFinal, modo, provedor: escolhido },
        });
        return serializar(daCasa, fabrica.modoAceito, trocada);
      }

      // O id sai daqui porque vai no endereço do webhook, registrado antes
      // de gravar: sem webhook, a conexão não serve.
      const id = randomUUID();
      const url = fabrica.urlDoWebhook(escolhido, id);
      if (url === null) {
        throw new ErroHttp(
          503,
          "pagamentos_online_sem_endereco",
          `a API não sabe o próprio endereço (URL_DA_API), e ${nome.o} não teria para onde mandar os pagamentos`
        );
      }
      const chaveCifrada = Buffer.from(fabrica.cifrar(chave));
      const token = gerarTokenDoWebhook();
      const { email } = await prisma.barbeiro.findUniqueOrThrow({ where: { id: membro.id }, select: { email: true } });
      const { id: idExternoWebhook, segredo } = await noProvedor(escolhido, provedor.registrarWebhook({ url, token, email }));

      try {
        const criada = await prisma.conexaoDePagamento.create({
          data: {
            id,
            barbeariaId: membro.barbeariaId,
            barbeiroId: membro.id,
            daCasa,
            provedor: escolhido,
            modo,
            chaveCifrada,
            chaveFinal,
            webhookTokenHash: hashDoToken(token),
            idExternoWebhook,
            segredoDoWebhookCifrado: segredo === null ? null : Buffer.from(fabrica.cifrar(segredo)),
          },
        });
        return serializar(daCasa, fabrica.modoAceito, criada);
      } catch (erro) {
        // Dois PUTs ao mesmo tempo: o índice único deixa um gravar. O
        // webhook do outro não pode ficar solto no provedor.
        await provedor.apagarWebhook(idExternoWebhook).catch((falha: unknown) => {
          request.log.warn({ falha: String(falha) }, `webhook ${nome.do} sem conexão ficou no provedor`);
        });
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
          throw conflito("a conta acabou de ser conectada por outro pedido");
        }
        throw erro;
      }
    }
  );

  // Em quantos dias de atraso a assinatura da InfinitePay cancela
  // sozinha (decisão do dono em 31/10/2026). Quem tem a conta muda a
  // dele; a da casa, o dono. Sem pedir o Completo: só ajusta a conta que
  // já está ligada.
  app.patch(
    "/barbearias/me/pagamentos-online",
    { onRequest: exigirQuemTemConta, schema: { querystring: filtroDaConta, body: corpoDias } },
    async (request): Promise<PagamentosOnline> => {
      const membro = membroDoToken(request);
      const daCasa = request.query.daCasa ?? false;
      garantirDaCasa(membro, daCasa);
      const conta = await prisma.conexaoDePagamento.findFirst({
        where: ondeEstaAConta(membro, daCasa),
        select: { id: true, provedor: true },
      });
      if (!conta) throw naoEncontrado("nenhuma conta conectada");
      const provedor = provedorGravado(conta.provedor);
      if (provedor !== "infinitepay") {
        throw new ErroDeNegocio(
          `os dias para cancelar são só da InfinitePay: ${nomeDoProvedor(provedor).o} cancela pelas próprias regras`,
          "so_na_infinitepay"
        );
      }
      const mudada = await prisma.conexaoDePagamento.update({
        where: { id: conta.id },
        data: { diasParaCancelar: request.body.diasParaCancelar },
        select: SELECT_DA_CONTA,
      });
      return serializar(daCasa, app.provedores.modoAceito, mudada);
    }
  );

  // Recusado com assinatura online viva na conta (decisão 6): sem o
  // webhook, a cobrança continuaria no provedor e o BarChop não saberia.
  // As do balcão não dependem da conta. Desliga em vez de apagar: a
  // assinatura online cancelada segue apontando pra conexão em que foi
  // cobrada. A chave sai do banco.
  app.delete(
    "/barbearias/me/pagamentos-online",
    { onRequest: exigirQuemTemConta, schema: { querystring: filtroDaConta } },
    async (request, reply) => {
      const membro = membroDoToken(request);
      const daCasa = request.query.daCasa ?? false;
      garantirDaCasa(membro, daCasa);
      const conexao = await prisma.conexaoDePagamento.findFirst({ where: ondeEstaAConta(membro, daCasa) });
      if (!conexao) throw naoEncontrado("nenhuma conta conectada");

      // A conta travada do começo ao fim: o assinar online (PR 10c) trava
      // a mesma linha pra gravar, e uma assinatura criada no meio não fica
      // viva numa conta sem webhook. Há rede dentro (apagar o webhook),
      // daí o prazo maior que o padrão de 5 s.
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM conexao_de_pagamento WHERE id = ${conexao.id}::uuid FOR NO KEY UPDATE`;
          const vivas = await tx.assinaturaDoCliente.count({
            where: { conexaoId: conexao.id, situacao: { not: "cancelada" } },
          });
          if (vivas > 0) {
            throw new ErroDeNegocio(
              vivas === 1
                ? "há 1 assinatura online viva nesta conta: cancele a assinatura antes de desconectar"
                : `há ${vivas} assinaturas online vivas nesta conta: cancele as assinaturas antes de desconectar`,
              "assinaturas_ativas"
            );
          }

          // A InfinitePay não tem webhook da conta: só desliga.
          if (conexao.idExternoWebhook !== null) {
            const provedor = recorrente(app.provedores.daConexao(conexao));
            try {
              await provedor.apagarWebhook(conexao.idExternoWebhook);
            } catch (erro) {
              // Chave revogada (ou webhook apagado à mão): o BarChop não
              // alcança mais o webhook, e ficar com a conexão não ajuda.
              // Fora do ar, a conexão fica pra tentar de novo.
              if (!(erro instanceof ErroDoProvedor) || (erro.codigo !== "chave_invalida" && erro.codigo !== "nao_encontrado")) {
                throw erro instanceof ErroDoProvedor ? erroHttpDoProvedor(erro, provedor.nome) : erro;
              }
              request.log.warn(
                { conexaoId: conexao.id, codigo: erro.codigo },
                `webhook ${nomeDoProvedor(provedor.nome).do} não apagado ao desconectar`
              );
            }
          }

          await tx.conexaoDePagamento.update({
            where: { id: conexao.id },
            data: { desconectadaEm: new Date(), chaveCifrada: Buffer.alloc(0), segredoDoWebhookCifrado: null },
          });
        },
        { timeout: 15_000 }
      );
      return reply.code(204).send();
    }
  );
}
