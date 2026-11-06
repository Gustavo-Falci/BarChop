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
  // Pro "Criar conta" da tela de sucesso (06/11): o nome e o e-mail que
  // a pessoa digitou ao agendar preenchem o formulário, e o token da
  // criação prova pra API que foi ela quem marcou. Opcionais: um cartão
  // gravado antes desta versão continua valendo pro link.
  nome?: string;
  email?: string | null;
  tokenDaConta?: string | null;
}

// O que o "Criar conta" leva do agendamento recém-feito.
export interface CadastroDoAgendamento {
  nome: string;
  telefone: string;
  email: string;
  tokenDaConta: string | null;
  agendamento: AgendamentoSerializado;
}

const CHAVE = "agendamento.confirmado";

// Os serviços como conjunto: a ordem da URL não importa.
function mesmosServicos(daUrl: string[], doAgendamento: { servicoId: string }[]): boolean {
  const a = [...new Set(daUrl)].sort();
  const b = [...new Set(doAgendamento.map((s) => s.servicoId))].sort();
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// Só volta o cartão do MESMO agendamento que a URL descreve (barbearia,
// serviços, dia e hora). Quem começa outro na mesma aba vê o
// formulário, não o cartão antigo.
export function lerHorarioConfirmado(
  slug: string,
  servicoIds: string[],
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
      salvo.agendamento?.horaInicio !== hora ||
      !Array.isArray(salvo.agendamento?.servicos) ||
      !mesmosServicos(servicoIds, salvo.agendamento!.servicos)
    ) {
      return null;
    }
    return salvo as HorarioConfirmado;
  } catch {
    return null;
  }
}

// Pro "Criar conta": o agendamento recém-feito NESTA barbearia, venha
// a pessoa de onde vier (a tela de entrar não tem a URL do agendamento).
// Torto ou de outra barbearia conta como ausente: o formulário abre
// vazio.
export function lerCadastroDoAgendamento(slug: string): CadastroDoAgendamento | null {
  if (typeof window === "undefined") return null;
  const bruto = window.sessionStorage.getItem(CHAVE);
  if (!bruto) return null;
  try {
    const salvo = JSON.parse(bruto) as Partial<HorarioConfirmado>;
    if (salvo?.slug !== slug || typeof salvo.telefone !== "string" || !salvo.agendamento) {
      return null;
    }
    return {
      nome: typeof salvo.nome === "string" ? salvo.nome : "",
      telefone: salvo.telefone,
      email: typeof salvo.email === "string" ? salvo.email : "",
      tokenDaConta: typeof salvo.tokenDaConta === "string" ? salvo.tokenDaConta : null,
      agendamento: salvo.agendamento,
    };
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
