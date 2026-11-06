import type { AgendamentoSerializado } from "@barchop/types";

// O cartão do link do horário (06/11) sobrevive a recarregar a página
// até o cliente tocar em Concluir. No sessionStorage, como o rascunho do
// `dadosDoCliente`: morre com a aba. Guardar no aparelho de vez deixaria
// um link que cancela o horário num celular emprestado.
export interface HorarioConfirmado {
  slug: string;
  agendamento: AgendamentoSerializado;
  linkDoHorario: string;
  // O WhatsApp de quem agendou: é pra ele que o "Mandar pro meu
  // WhatsApp" abre a conversa.
  telefone: string;
}

const CHAVE = "agendamento.confirmado";

// Só volta o cartão do MESMO agendamento que a URL descreve. Quem
// começa outro na mesma aba vê o formulário, não o cartão antigo.
export function lerHorarioConfirmado(
  slug: string,
  data: string | undefined,
  hora: string | undefined
): HorarioConfirmado | null {
  if (typeof window === "undefined") return null;

  const bruto = window.sessionStorage.getItem(CHAVE);
  if (!bruto) return null;

  // Conteúdo torto (outra versão, extensão) conta como ausente: a tela
  // mostra o formulário em vez de quebrar.
  try {
    const salvo = JSON.parse(bruto) as Partial<HorarioConfirmado>;
    if (
      salvo?.slug !== slug ||
      typeof salvo.linkDoHorario !== "string" ||
      typeof salvo.telefone !== "string" ||
      salvo.agendamento?.data !== data ||
      salvo.agendamento?.horaInicio !== hora
    ) {
      return null;
    }
    return salvo as HorarioConfirmado;
  } catch {
    return null;
  }
}

export function gravarHorarioConfirmado(horario: HorarioConfirmado): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHAVE, JSON.stringify(horario));
}

export function limparHorarioConfirmado(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHAVE);
}
