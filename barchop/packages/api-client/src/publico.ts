import type {
  AgendamentoDoLembrete,
  AgendamentoSerializado,
  Disponibilidade,
  DisponibilidadeDoMes,
  NovoAgendamentoPublicoInput,
  PerfilPublicoBarbearia,
  ProximosHorariosDoServico,
  ServicoSerializado,
  SessaoCliente,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

// Sem `barbeiroId` é "qualquer um": a agenda junta de quem faz os
// serviços.
export interface FiltroDoDia {
  barbeiroId?: string;
  data: string; // "YYYY-MM-DD"
  servicoIds: string[];
}

export interface FiltroDoMes {
  barbeiroId?: string;
  mes: string; // "YYYY-MM"
  servicoIds: string[];
}

// Por onde o cliente se identifica: telefone OU e-mail, nunca os dois —
// a API recusa o corpo com os dois. No piloto as telas usam o e-mail,
// porque é o único canal que entrega o código sem o WhatsApp.
export type DestinoDoCodigo = { telefone: string } | { email: string };

export type CredenciaisDoCliente = DestinoDoCodigo & { senha: string };

// Primeiro acesso e esqueci a senha, pro cliente, são o mesmo pedido:
// o código que chegou no telefone (ou no e-mail) prova a posse, e a
// senha é definida. `nome` e `telefone` vão sempre — a API só os usa se
// o cadastro for novo. Com `email`, a prova é do e-mail.
export interface DefinicaoDeSenhaDoCliente {
  telefone: string;
  email?: string;
  codigo: string;
  senha: string;
  nome: string;
}

// Nenhuma destas manda token: são as telas abertas pelo link do
// WhatsApp, e a API as registra fora dos dois escopos protegidos.
export function criarApiPublica(requisicao: Requisicao) {
  return {
    perfilDaBarbearia(slug: string): Promise<PerfilPublicoBarbearia> {
      return requisicao(`/barbearias/${slug}`);
    },

    async servicos(slug: string): Promise<ServicoSerializado[]> {
      // A API embrulha em { servicos }. Desembrulhar aqui poupa a tela
      // de conhecer o formato do envelope.
      const resposta = await requisicao<{ servicos: ServicoSerializado[] }>(
        `/barbearias/${slug}/servicos`
      );
      return resposta.servicos;
    },

    async disponibilidadeDoDia(
      slug: string,
      filtro: FiltroDoDia
    ): Promise<string[]> {
      const resposta = await requisicao<Disponibilidade>(
        `/barbearias/${slug}/disponibilidade`,
        { query: { ...filtro } }
      );
      return resposta.horarios;
    },

    async disponibilidadeDoMes(
      slug: string,
      filtro: FiltroDoMes
    ): Promise<Record<string, boolean>> {
      const resposta = await requisicao<DisponibilidadeDoMes>(
        `/barbearias/${slug}/disponibilidade/mes`,
        { query: { ...filtro } }
      );
      return resposta.dias;
    },

    agendar(
      slug: string,
      novo: NovoAgendamentoPublicoInput
    ): Promise<AgendamentoSerializado> {
      return requisicao(`/barbearias/${slug}/agendamentos`, {
        metodo: "POST",
        corpo: novo,
      });
    },

    // Os próximos 3 horários livres de cada serviço, pra página da
    // barbearia.
    async proximosHorarios(slug: string): Promise<ProximosHorariosDoServico[]> {
      const resposta = await requisicao<{ servicos: ProximosHorariosDoServico[] }>(
        `/barbearias/${slug}/proximos-horarios`
      );
      return resposta.servicos;
    },

    // O link do e-mail de lembrete: sem login, quem autoriza é o token.
    // Ler é GET e agir é POST — a tela só age no clique, porque leitor
    // de e-mail abre links sozinho.
    async lembrete(token: string): Promise<AgendamentoDoLembrete> {
      const resposta = await requisicao<{ agendamento: AgendamentoDoLembrete }>(
        `/lembretes/${token}`
      );
      return resposta.agendamento;
    },

    async confirmarPresenca(token: string): Promise<AgendamentoDoLembrete> {
      const resposta = await requisicao<{ agendamento: AgendamentoDoLembrete }>(
        `/lembretes/${token}/confirmar`,
        { metodo: "POST" }
      );
      return resposta.agendamento;
    },

    async cancelarPeloLembrete(token: string): Promise<AgendamentoDoLembrete> {
      const resposta = await requisicao<{ agendamento: AgendamentoDoLembrete }>(
        `/lembretes/${token}/cancelar`,
        { metodo: "POST" }
      );
      return resposta.agendamento;
    },

    // Responde igual tendo ou não conta: não há nada a devolver.
    async pedirCodigoDoCliente(slug: string, destino: DestinoDoCodigo): Promise<void> {
      await requisicao(`/barbearias/${slug}/auth/cliente/codigo`, {
        metodo: "POST",
        corpo: destino,
      });
    },

    definirSenhaDoCliente(
      slug: string,
      definicao: DefinicaoDeSenhaDoCliente
    ): Promise<SessaoCliente> {
      return requisicao(`/barbearias/${slug}/auth/cliente/senha`, {
        metodo: "POST",
        corpo: definicao,
      });
    },

    loginCliente(
      slug: string,
      credenciais: CredenciaisDoCliente
    ): Promise<SessaoCliente> {
      return requisicao(`/barbearias/${slug}/auth/cliente/login`, {
        metodo: "POST",
        corpo: credenciais,
      });
    },
  };
}
