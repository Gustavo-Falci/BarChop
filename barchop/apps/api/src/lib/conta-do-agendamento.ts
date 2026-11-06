import type { PayloadContaDoAgendamento } from "../plugins/auth";
import type { App } from "../tipos";

// Uma hora: o "Criar conta" fica na própria tela de confirmação, e quem
// cria a conta depois disso ainda tem o caminho do e-mail (todos os
// horários marcados com o e-mail provado) ou a barbearia.
const VALIDADE_EM_SEGUNDOS = 60 * 60;

export function assinarTokenDaConta(
  app: Pick<App, "jwt">,
  agendamentoId: string,
  agora: Date = new Date()
): string {
  const payload: PayloadContaDoAgendamento = {
    tipo: "conta_do_agendamento",
    agendamentoId,
    exp: Math.floor(agora.getTime() / 1000) + VALIDADE_EM_SEGUNDOS,
  };
  return app.jwt.sign(payload);
}

// O agendamento que o token prova, ou null pra qualquer coisa que não
// seja um token deste tipo e dentro do prazo. Sem motivo: quem chama
// responde a mesma recusa em todos os casos.
export function lerTokenDaConta(app: Pick<App, "jwt">, token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = app.jwt.verify<Partial<PayloadContaDoAgendamento>>(token);
    if (payload.tipo !== "conta_do_agendamento" || typeof payload.agendamentoId !== "string") {
      return null;
    }
    return payload.agendamentoId;
  } catch {
    return null;
  }
}
