import { expect } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { provedoresDeMemoria, type PagamentoDoLink } from "../../src/lib/provedores";
import { auth, criarBarbeariaComToken } from "./barbearia";
import { criarClienteComToken } from "./cliente";

// A InfinitePay nos planos (plano pagamentos-online-infinitepay, PR 4):
// a casa conectada com a InfiniteTag, a vitrine aberta e um plano online.
// Sem sandbox, a plataforma aceita só a chave de produção.

export const TAG = "barbearia-exemplo";

export async function cenarioDaInfinitePay() {
  const provedores = provedoresDeMemoria({ modoAceito: "real" });
  const app = buildApp({ provedores });
  const dono = await criarBarbeariaComToken(app);
  await prisma.barbearia.update({ where: { id: dono.barbeariaId }, data: { vitrineDePlanos: true } });

  const conectada = await app.inject({
    method: "PUT",
    url: "/barbearias/me/pagamentos-online?daCasa=true",
    headers: auth(dono.token),
    payload: { provedor: "infinitepay", chave: "inchk_chave-da-casa-1234", tag: TAG },
  });
  expect(conectada.statusCode).toBe(200);
  const casa = await prisma.conexaoDePagamento.findFirstOrThrow({ where: { barbeariaId: dono.barbeariaId, daCasa: true } });

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
        aceitaOnline: true,
        servicos: { create: [{ servicoId: corte.id, usosPorCiclo: 2 }] },
        ...extra,
      },
    });
  const daCasa = await plano();
  const cliente = await criarClienteComToken(app, dono.slug);
  await prisma.cliente.update({ where: { id: cliente.clienteId }, data: { email: "caio@exemplo.com" } });

  return { app, provedores, dono, casa, corte, plano, daCasa, cliente };
}

export type CenarioDaInfinitePay = Awaited<ReturnType<typeof cenarioDaInfinitePay>>;

export function assinar(c: CenarioDaInfinitePay, planoId: string, token = c.cliente.token) {
  return c.app.inject({ method: "POST", url: "/clientes/me/assinaturas", headers: auth(token), payload: { planoId } });
}

// O que o `payment_check` responde para a transação.
export function pagar(
  c: CenarioDaInfinitePay,
  dados: { orderNsu: string; transactionNsu: string; slug: string } & Partial<PagamentoDoLink>
): void {
  const { orderNsu, transactionNsu, slug, pago = true, valorCentavos = 12000, forma = "pix" } = dados;
  c.provedores.pagamentosDosLinks.set(transactionNsu, { orderNsu, slug, pagamento: { pago, valorCentavos, forma } });
}

// O aviso da InfinitePay, como a documentação mostra (sem os valores de
// verdade).
export function avisoDePagamento(dados: { orderNsu: string; transactionNsu: string; slug: string; amount?: number }) {
  return {
    invoice_slug: dados.slug,
    amount: dados.amount ?? 12000,
    paid_amount: dados.amount ?? 12000,
    installments: 1,
    capture_method: "pix",
    transaction_nsu: dados.transactionNsu,
    order_nsu: dados.orderNsu,
    receipt_url: "https://comprovante.exemplo/recibo",
    items: [{ quantity: 1, price: dados.amount ?? 12000, description: "Corte ilimitado" }],
  };
}

export function avisar(c: CenarioDaInfinitePay, conexaoId: string, corpo: unknown) {
  return c.app.inject({ method: "POST", url: `/webhooks/infinitepay/${conexaoId}`, payload: corpo as object });
}

export function conferir(
  c: CenarioDaInfinitePay,
  dados: { orderNsu: string; transactionNsu: string; slug: string },
  token = c.cliente.token
) {
  return c.app.inject({
    method: "POST",
    url: "/clientes/me/assinaturas/conferir-pagamento",
    headers: auth(token),
    payload: dados,
  });
}

export function avisosDoSino(barbeiroId: string) {
  return prisma.notificacao.findMany({ where: { barbeiroId, tipo: "pagamento" }, orderBy: { criadaEm: "asc" } });
}
