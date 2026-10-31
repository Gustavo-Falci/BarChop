import type { AssinaturaNaConta, PlanoDaVitrine } from "@barchop/types";
import { diaEMes } from "../painel/planos";

// Os planos da barbearia na página pública (Onda 2, marco 3, PR 11 do
// plano planos-de-assinatura): a vitrine, o assinar e a Minha conta.

// Um id de plano vindo da query. Só letras, números e hífen (o UUID da
// API, e o "pl1" do dublê): o valor volta pra query e é comparado com a
// lista, nunca vira caminho.
const ID_SIMPLES = /^[A-Za-z0-9-]{1,64}$/;

export function planoDaQuery(valor: string | null): string | null {
  return valor !== null && ID_SIMPLES.test(valor) ? valor : null;
}

// "/gr-barber/planos?plano=pl1". Quem chama passa pelo `noHost`.
export function caminhoDosPlanos(slug: string, planoId: string | null = null): string {
  return planoId ? `/${slug}/planos?${new URLSearchParams({ plano: planoId })}` : `/${slug}/planos`;
}

// Assinar pede o cliente logado: o login volta pro plano escolhido. O
// destino vai como o nome `planos`, nunca como URL (o mesmo cuidado do
// `caminhoDoLogin` do agendamento).
export function caminhoDoLoginParaAssinar(slug: string, planoId: string): string {
  return `/${slug}/entrar?${new URLSearchParams({ voltar: "planos", plano: planoId })}`;
}

// "Vale com qualquer profissional", "Vale só com Lucas".
export function comQuemVale(plano: { vendedor: Pick<NonNullable<PlanoDaVitrine["vendedor"]>, "nome"> | null }): string {
  return plano.vendedor ? `Vale só com ${plano.vendedor.nome}` : "Vale com qualquer profissional";
}

const CADA_CICLO: Record<PlanoDaVitrine["ciclo"], string> = {
  mensal: "a cada mês",
  trimestral: "a cada trimestre",
  anual: "a cada ano",
};

// A InfinitePay não tem cobrança automática: o BarChop manda um link a
// cada ciclo (plano pagamentos-online-infinitepay, PR 7b).
export const SEM_RENOVACAO = "Não renova sozinho: a cada ciclo chega um link por e-mail e WhatsApp.";

// A volta da InfinitePay (o `redirect_url` da Minha conta): ela põe na
// query `order_nsu`, `transaction_nsu` e `slug` (o da fatura, não o da
// barbearia). Só com os três, e com a regra do corpo da API (1 a 100
// caracteres): sem sandbox, não há como saber o formato de verdade, e uma
// regra mais estrita aqui perderia a volta calada. Os valores vão no
// corpo do POST (JSON) e na query do Entrar (codificada).
export interface VoltaDoPagamento {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
}


export function voltaDoPagamento(query: Pick<URLSearchParams, "get">): VoltaDoPagamento | null {
  const orderNsu = query.get("order_nsu");
  const transactionNsu = query.get("transaction_nsu");
  const slugDaFatura = query.get("slug");
  if (orderNsu === null || transactionNsu === null || slugDaFatura === null) return null;
  if (![orderNsu, transactionNsu, slugDaFatura].every((valor) => valor.length >= 1 && valor.length <= 100)) return null;
  return { orderNsu, transactionNsu, slug: slugDaFatura };
}

// A mesma query, pra levar a volta pelo Entrar quando a sessão caiu.
export function queryDaVolta(volta: VoltaDoPagamento): string {
  return new URLSearchParams({
    order_nsu: volta.orderNsu,
    transaction_nsu: volta.transactionNsu,
    slug: volta.slug,
  }).toString();
}

// "Inclui a cada mês": o título da lista do que o plano dá.
export function incluiACada(ciclo: PlanoDaVitrine["ciclo"]): string {
  return `Inclui ${CADA_CICLO[ciclo]}`;
}

export function fraseDoTesteGratis(dias: number): string {
  return dias === 1 ? "1 dia grátis" : `${dias} dias grátis`;
}

// O que falta, depois de assinar online: o teste grátis empurra a
// primeira cobrança pro fim dele.
export function fraseDaFatura(assinatura: Pick<AssinaturaNaConta, "situacao" | "cicloTerminaEm">): string {
  if (assinatura.situacao === "teste" && assinatura.cicloTerminaEm) {
    return `O teste grátis vai até ${diaEMes(assinatura.cicloTerminaEm)}, e a primeira cobrança vence nesse dia.`;
  }
  if (assinatura.situacao === "em_atraso") return "A mensalidade venceu e ainda não foi paga.";
  return "Falta pagar a primeira mensalidade pra assinatura começar.";
}

// Até quando vale, pro cliente. Em atraso, o atendimento é cobrado à
// parte até a mensalidade entrar. O que não renova sozinho (a InfinitePay)
// "vale até": o ciclo seguinte é outro link.
export function situacaoNaConta(
  assinatura: Pick<AssinaturaNaConta, "situacao" | "forma" | "cicloTerminaEm">,
  renovaSozinha = true
): string {
  const termina = assinatura.cicloTerminaEm ? diaEMes(assinatura.cicloTerminaEm) : "";
  switch (assinatura.situacao) {
    case "pendente":
      return assinatura.forma === "online"
        ? "Esperando o primeiro pagamento"
        : "Começa quando você pagar no balcão";
    case "teste":
      return `Teste grátis até ${termina}`;
    case "ativa":
      return renovaSozinha ? `Renova em ${termina}` : `Vale até ${termina}`;
    case "em_atraso":
      return `Venceu em ${termina}: até pagar, o atendimento é cobrado à parte`;
    case "cancelada":
      return "Cancelada";
  }
}

// O que sobra de um serviço no ciclo, ao lado do nome: "sobra 1 de 2",
// "sobram 3 de 4", "sem limite".
export function quantoSobra(servico: AssinaturaNaConta["servicos"][number]): string {
  if (servico.usosPorCiclo === null) return "sem limite";
  const sobram = servico.usosRestantes ?? 0;
  return `${sobram === 1 ? "sobra" : "sobram"} ${sobram} de ${servico.usosPorCiclo}`;
}

// A barra do que sobra, de 0 a 1; sem limite, não tem barra.
export function parteQueSobra(servico: AssinaturaNaConta["servicos"][number]): number | null {
  if (servico.usosPorCiclo === null || servico.usosPorCiclo === 0) return null;
  return Math.min(1, Math.max(0, (servico.usosRestantes ?? 0) / servico.usosPorCiclo));
}
