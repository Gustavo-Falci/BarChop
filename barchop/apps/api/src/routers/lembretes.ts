import { prisma } from "@barchop/database";
import type { AgendamentoDoLembrete } from "@barchop/types";
import { garantirAlteravel } from "../lib/agendamento-alteravel";
import { ErroDeNegocio } from "../lib/erro-negocio";
import { ErroHttp, naoEncontrado } from "../lib/erro-http";
import { carregarRegras, garantirPrazoDoCliente } from "../lib/regras";
import { dateParaData, dateParaHora } from "../lib/horas";
import type { PayloadBarbeiro, PayloadCliente, PayloadLembrete } from "../plugins/auth";
import type { App } from "../tipos";

// O destino do link do e-mail de lembrete: confirmar presença ou
// cancelar sem login. Quem prova que pode é o token (lib/lembrete.ts),
// que vale pra um agendamento e só até o horário começar.
//
// Ler é GET e agir é POST, e a diferença importa: leitores de e-mail e
// antivírus abrem os links sozinhos pra inspecionar. Se abrir o link
// confirmasse, o cliente "confirmaria" sem ter visto o e-mail.

const paramsToken = {
  type: "object",
  required: ["token"],
  properties: { token: { type: "string", minLength: 1, maxLength: 512 } },
} as const;

const STATUS_ATIVO = ["pendente", "confirmado"] as const;

const INCLUDE = {
  // O prazo de cancelar e o contato vão pra tela (painel v2, 3g).
  barbearia: {
    select: { nome: true, slug: true, prazoCancelarHoras: true, whatsapp: true, telefone: true },
  },
  barbeiro: { select: { nome: true } },
  servicos: { include: { servico: { select: { nome: true } } } },
} as const;

// O token no caminho é um link de cancelar que funciona: no log de
// requisições do Fastify, seria a conta de qualquer um que leia o log.
export function ocultarTokenDoLembrete(url: string): string {
  return url.replace(/^\/lembretes\/[^/?#]+/, "/lembretes/***");
}

// Só o vencido é 410: quem chega com ele tem um link de verdade, só
// tarde demais, e a tela diz isso. Lixo, assinatura trocada e token de
// outro tipo (o do painel ou da conta do cliente) são 401 — a mesma
// resposta pros três, sem dizer qual.
function lerToken(app: App, token: string): string {
  let payload: PayloadBarbeiro | PayloadCliente | PayloadLembrete;
  try {
    payload = app.jwt.verify<PayloadBarbeiro | PayloadCliente | PayloadLembrete>(token);
  } catch (erro) {
    if ((erro as { code?: string }).code === "FAST_JWT_EXPIRED") {
      throw new ErroHttp(410, "link_expirado", "esse link venceu: o horário já começou");
    }
    throw new ErroHttp(401, "link_invalido", "link inválido");
  }
  if (payload.tipo !== "lembrete") {
    throw new ErroHttp(401, "link_invalido", "link inválido");
  }
  return payload.agendamentoId;
}

async function carregar(id: string) {
  const agendamento = await prisma.agendamento.findUnique({ where: { id }, include: INCLUDE });
  // Apagado junto com a barbearia.
  if (!agendamento) throw naoEncontrado("agendamento não encontrado");
  return agendamento;
}

function serializar(agendamento: Awaited<ReturnType<typeof carregar>>): {
  agendamento: AgendamentoDoLembrete;
} {
  return {
    agendamento: {
      id: agendamento.id,
      data: dateParaData(agendamento.data),
      horaInicio: dateParaHora(agendamento.horaInicio),
      status: agendamento.status,
      presencaConfirmadaEm: agendamento.presencaConfirmadaEm?.toISOString() ?? null,
      barbearia: {
        ...agendamento.barbearia,
        // O CHECK da coluna garante uma das opções.
        prazoCancelarHoras: agendamento.barbearia
          .prazoCancelarHoras as AgendamentoDoLembrete["barbearia"]["prazoCancelarHoras"],
      },
      barbeiro: agendamento.barbeiro,
      servicos: agendamento.servicos.map((s) => ({ nome: s.servico.nome })),
    },
  };
}

function ativo(status: string): boolean {
  return (STATUS_ATIVO as readonly string[]).includes(status);
}

export function registrarRotasLembretes(app: App): void {
  app.get("/lembretes/:token", { schema: { params: paramsToken } }, async (request) => {
    return serializar(await carregar(lerToken(app, request.params.token)));
  });

  app.post(
    "/lembretes/:token/confirmar",
    { schema: { params: paramsToken } },
    async (request) => {
      const id = lerToken(app, request.params.token);
      garantirAlteravel(await carregar(id));

      // Status e marca no WHERE: um cancelamento que commitou depois da
      // leitura ganha, e a segunda confirmação não troca a hora da
      // primeira.
      const { count } = await prisma.agendamento.updateMany({
        where: { id, status: { in: [...STATUS_ATIVO] }, presencaConfirmadaEm: null },
        data: { presencaConfirmadaEm: new Date() },
      });

      const depois = await carregar(id);
      if (count === 0 && !(ativo(depois.status) && depois.presencaConfirmadaEm)) {
        throw new ErroDeNegocio(
          `agendamento ${depois.status} não pode ser confirmado`,
          "status_nao_permite"
        );
      }
      return serializar(depois);
    }
  );

  app.post(
    "/lembretes/:token/cancelar",
    { schema: { params: paramsToken } },
    async (request) => {
      const id = lerToken(app, request.params.token);
      const antes = await carregar(id);

      // Cancelar de novo (o clique duplo, o e-mail aberto duas vezes) é
      // o mesmo cancelamento, não um erro. Concluído e falta seguem
      // recusados pelo garantirAlteravel.
      if (antes.status === "cancelado") return serializar(antes);
      garantirAlteravel(antes);
      // O prazo de cancelar da barbearia vale também aqui: o link é do
      // cliente. Confirmar presença não tem prazo.
      garantirPrazoDoCliente(antes, await carregarRegras(prisma, antes.barbeariaId), "cancelar");

      // Mesmo cuidado do remarcar: o status no WHERE faz a corrida com
      // outra mudança terminar num resultado só.
      await prisma.agendamento.updateMany({
        where: { id, status: { in: [...STATUS_ATIVO] } },
        data: { status: "cancelado" },
      });

      const depois = await carregar(id);
      if (depois.status !== "cancelado") garantirAlteravel(depois);
      return serializar(depois);
    }
  );
}
