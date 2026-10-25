import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { Prisma, prisma } from "@barchop/database";
import type { PagamentosOnline } from "@barchop/types";
import { garantirRecurso } from "../lib/assinatura";
import { gerarTokenDoWebhook, hashDoToken } from "../lib/cifra";
import { conflito, ErroHttp, naoEncontrado } from "../lib/erro-http";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { ErroDoProvedor, erroHttpDoProvedor, PROVEDORES, type Provedor } from "../lib/provedores";
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

type ContaGravada = { provedor: string; modo: string; chaveFinal: string; criadoEm: Date };

function serializar(daCasa: boolean, modoAceito: PagamentosOnline["modoAceito"], conta: ContaGravada | null): PagamentosOnline {
  return {
    daCasa,
    modoAceito,
    conta: conta && {
      provedor: conta.provedor as "asaas",
      modo: conta.modo as "teste" | "real",
      chaveFinal: conta.chaveFinal,
      conectadaEm: conta.criadoEm.toISOString(),
    },
  };
}

// O erro do provedor vira resposta; o resto sobe como está.
async function noProvedor<T>(pedido: Promise<T>): Promise<T> {
  try {
    return await pedido;
  } catch (erro) {
    throw erro instanceof ErroDoProvedor ? erroHttpDoProvedor(erro) : erro;
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
        select: { provedor: true, modo: true, chaveFinal: true, criadoEm: true },
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

      const { provedor: nomeDoProvedor } = request.body;
      const chave = request.body.chave.trim();
      const fabrica = app.provedores;
      const modo = fabrica.modoDaChave(nomeDoProvedor, chave);
      if (modo === null) {
        throw new ErroDeNegocio("isso não é uma chave de API do Asaas: ela começa com $aact_", "chave_invalida");
      }
      if (modo !== fabrica.modoAceito) {
        throw new ErroDeNegocio(
          modo === "teste"
            ? "esta é uma chave do sandbox do Asaas, que não move dinheiro: use a chave de produção"
            : "esta é uma chave de produção do Asaas: aqui só vale a do sandbox",
          "modo_errado"
        );
      }
      const provedor: Provedor = fabrica.daChave({ provedor: nomeDoProvedor, chave });
      await noProvedor(provedor.conferirChave());
      const chaveFinal = chave.slice(-4);

      const atual = await prisma.conexaoDePagamento.findFirst({
        where: ondeEstaAConta(membro, daCasa),
        select: { id: true, idExternoWebhook: true },
      });
      if (atual) {
        const mesmaConta = atual.idExternoWebhook !== null && (await noProvedor(provedor.temWebhook(atual.idExternoWebhook)));
        if (!mesmaConta) {
          throw new ErroDeNegocio(
            "esta chave é de outra conta do Asaas: desconecte a conta atual antes de conectar outra",
            "outra_conta"
          );
        }
        const trocada = await prisma.conexaoDePagamento.update({
          where: { id: atual.id },
          data: { chaveCifrada: Buffer.from(fabrica.cifrar(chave)), chaveFinal, modo, provedor: nomeDoProvedor },
        });
        return serializar(daCasa, fabrica.modoAceito, trocada);
      }

      // O id sai daqui porque vai no endereço do webhook, registrado antes
      // de gravar: sem webhook, a conexão não serve.
      const id = randomUUID();
      const url = fabrica.urlDoWebhook(id);
      if (url === null) {
        throw new ErroHttp(
          503,
          "pagamentos_online_sem_endereco",
          "a API não sabe o próprio endereço (URL_DA_API), e o Asaas não teria para onde mandar os pagamentos"
        );
      }
      const chaveCifrada = Buffer.from(fabrica.cifrar(chave));
      const token = gerarTokenDoWebhook();
      const { email } = await prisma.barbeiro.findUniqueOrThrow({ where: { id: membro.id }, select: { email: true } });
      const idExternoWebhook = await noProvedor(provedor.registrarWebhook({ url, token, email }));

      try {
        const criada = await prisma.conexaoDePagamento.create({
          data: {
            id,
            barbeariaId: membro.barbeariaId,
            barbeiroId: membro.id,
            daCasa,
            provedor: nomeDoProvedor,
            modo,
            chaveCifrada,
            chaveFinal,
            webhookTokenHash: hashDoToken(token),
            idExternoWebhook,
          },
        });
        return serializar(daCasa, fabrica.modoAceito, criada);
      } catch (erro) {
        // Dois PUTs ao mesmo tempo: o índice único deixa um gravar. O
        // webhook do outro não pode ficar solto no provedor.
        await provedor.apagarWebhook(idExternoWebhook).catch((falha: unknown) => {
          request.log.warn({ falha: String(falha) }, "webhook do Asaas sem conexão ficou no provedor");
        });
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === "P2002") {
          throw conflito("a conta acabou de ser conectada por outro pedido");
        }
        throw erro;
      }
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

          if (conexao.idExternoWebhook !== null) {
            try {
              await app.provedores.daConexao(conexao).apagarWebhook(conexao.idExternoWebhook);
            } catch (erro) {
              // Chave revogada (ou webhook apagado à mão): o BarChop não
              // alcança mais o webhook, e ficar com a conexão não ajuda.
              // Fora do ar, a conexão fica pra tentar de novo.
              if (!(erro instanceof ErroDoProvedor) || (erro.codigo !== "chave_invalida" && erro.codigo !== "nao_encontrado")) {
                throw erro instanceof ErroDoProvedor ? erroHttpDoProvedor(erro) : erro;
              }
              request.log.warn({ conexaoId: conexao.id, codigo: erro.codigo }, "webhook do Asaas não apagado ao desconectar");
            }
          }

          await tx.conexaoDePagamento.update({
            where: { id: conexao.id },
            data: { desconectadaEm: new Date(), chaveCifrada: Buffer.alloc(0) },
          });
        },
        { timeout: 15_000 }
      );
      return reply.code(204).send();
    }
  );
}
