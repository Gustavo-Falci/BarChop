export interface DadosDoCliente {
  nome: string;
  telefone: string;
}

// Fora da URL de propósito: URL entra em histórico, print e cabeçalho
// de referência. sessionStorage sobrevive a recarregar e morre com a
// aba, e é apagado assim que o agendamento é criado.
const CHAVE = "agendamento.cliente";

export function lerDadosDoCliente(): DadosDoCliente | null {
  if (typeof window === "undefined") return null;

  const bruto = window.sessionStorage.getItem(CHAVE);
  if (!bruto) return null;

  // Conteúdo corrompido é possível — outra aba, extensão, versão antiga
  // do formato. Tratar como ausente faz a tela de confirmação voltar um
  // passo em vez de quebrar.
  try {
    const dados = JSON.parse(bruto) as Partial<DadosDoCliente>;
    if (!dados?.nome || !dados?.telefone) return null;
    return { nome: dados.nome, telefone: dados.telefone };
  } catch {
    return null;
  }
}

export function gravarDadosDoCliente(dados: DadosDoCliente): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(CHAVE, JSON.stringify(dados));
}

export function limparDadosDoCliente(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(CHAVE);
}
