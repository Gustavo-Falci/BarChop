import type {
  AgendamentoSerializado,
  AssinaturaNaConta,
  AssinaturaOnlineCriada,
  ClienteSerializado,
  MinhasAssinaturas,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

export interface EdicaoDoMeuCadastro {
  nome?: string;
  // Telefone fica de fora de propósito: é a chave do login e do upsert
  // do agendamento público, e a API responde 400 se ele vier.
  email?: string | null;
}

export interface FiltroDoHistorico {
  de?: string; // "YYYY-MM-DD"
  ate?: string;
}

export interface Remarcacao {
  data: string;
  horaInicio: string;
  // Ausente = herda os serviços do agendamento antigo. É o caminho
  // normal; mandar a lista serve pra quando o serviço antigo foi
  // desativado.
  servicoIds?: string[];
}

export function criarApiCliente(requisicao: Requisicao) {
  return {
    async meuCadastro(): Promise<ClienteSerializado> {
      const resposta = await requisicao<{ cliente: ClienteSerializado }>(
        "/clientes/me",
        { comToken: true }
      );
      return resposta.cliente;
    },

    async atualizarMeuCadastro(
      edicao: EdicaoDoMeuCadastro
    ): Promise<ClienteSerializado> {
      const resposta = await requisicao<{ cliente: ClienteSerializado }>(
        "/clientes/me",
        { metodo: "PATCH", corpo: edicao, comToken: true }
      );
      return resposta.cliente;
    },

    async meusAgendamentos(
      filtro: FiltroDoHistorico = {}
    ): Promise<AgendamentoSerializado[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoSerializado[];
      }>("/clientes/me/agendamentos", { query: { ...filtro }, comToken: true });
      return resposta.agendamentos;
    },

    async cancelar(id: string): Promise<AgendamentoSerializado> {
      const resposta = await requisicao<{
        agendamento: AgendamentoSerializado;
      }>(`/clientes/me/agendamentos/${id}/cancelar`, {
        metodo: "POST",
        comToken: true,
      });
      return resposta.agendamento;
    },

    // Uma transação só na API: cancela o antigo e cria o novo, ou nada
    // acontece. A tela chama isto, nunca cancelar+agendar em sequência.
    async remarcar(
      id: string,
      remarcacao: Remarcacao
    ): Promise<AgendamentoSerializado> {
      const resposta = await requisicao<{
        agendamento: AgendamentoSerializado;
      }>(`/clientes/me/agendamentos/${id}/remarcar`, {
        metodo: "POST",
        corpo: remarcacao,
        comToken: true,
      });
      return resposta.agendamento;
    },

    // Os planos que o cliente assina (Onda 2, marco 3, PR 10c), com os
    // usos que sobram no ciclo.
    async minhasAssinaturas(): Promise<AssinaturaNaConta[]> {
      const resposta = await requisicao<MinhasAssinaturas>("/clientes/me/assinaturas", { comToken: true });
      return resposta.assinaturas;
    },

    // Devolve o link da fatura do Asaas, onde o cliente paga. O CPF só
    // vai quando o cadastro não tem (422 `cpf_obrigatorio`); vazio não
    // vai, porque a API responderia 400. Com a online pendente ou em
    // atraso no mesmo plano, a resposta é ela, com a fatura relida.
    assinarPlano(planoId: string, cpf?: string): Promise<AssinaturaOnlineCriada> {
      const corpo = cpf?.trim() ? { planoId, cpf: cpf.trim() } : { planoId };
      return requisicao("/clientes/me/assinaturas", { metodo: "POST", corpo, comToken: true });
    },

    async cancelarAssinatura(id: string): Promise<void> {
      await requisicao(`/clientes/me/assinaturas/${id}`, { metodo: "DELETE", comToken: true });
    },
  };
}
