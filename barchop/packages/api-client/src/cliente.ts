import type {
  AgendamentoSerializado,
  ClienteSerializado,
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
  };
}
