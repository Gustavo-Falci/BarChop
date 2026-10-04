import type {
  AgendamentoComCliente,
  AgendamentoSerializado,
  AntecedenciaDoLembrete,
  BarbeariaDoPainel,
  BloqueioSerializado,
  ClienteSerializado,
  DiaDaJornada,
  HorarioSerializado,
  MembroDaEquipe,
  NovoAgendamentoBarbeiroInput,
  PaginaDeClientes,
  PapelMembro,
  PerfilBarbeiro,
  ServicoSerializado,
  SessaoBarbeiro,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

export interface CredenciaisDoBarbeiro {
  email: string;
  senha: string;
}

export interface RedefinicaoDeSenha {
  email: string;
  codigo: string;
  senha: string;
}

export interface NovaBarbearia {
  barbearia: { nome: string; slug: string };
  barbeiro: { nome: string; email: string; senha: string };
}

export interface EdicaoDoPerfil {
  nome?: string;
  telefone?: string | null;
}

export interface EdicaoDaBarbearia {
  nome?: string;
  telefone?: string | null;
  endereco?: string | null;
  logoUrl?: string | null;
  // Texto de apresentação da home pública; `null` limpa.
  sobre?: string | null;
  // Quanto antes do horário sai o lembrete. Não move os já agendados.
  lembreteAntecedenciaHoras?: AntecedenciaDoLembrete;
}

export interface NovoServico {
  nome: string;
  duracaoMinutos: number;
  preco: string; // string, nunca number — ver ServicoSerializado
}

export interface EdicaoDoServico extends Partial<NovoServico> {
  ativo?: boolean;
}

export interface NovoCliente {
  nome: string;
  telefone: string;
  email?: string | null;
}

export type EdicaoDoCliente = Partial<NovoCliente>;

export interface EdicaoDoAgendamento {
  status?: "pendente" | "confirmado" | "concluido" | "cancelado" | "no_show";
  observacoes?: string | null;
}

export interface ClienteComHistorico extends ClienteSerializado {
  agendamentos: AgendamentoSerializado[];
}

// POST /equipe. O e-mail é a chave do login do membro, única na
// plataforma; a API manda o convite pra ele ao criar.
export interface NovoMembro {
  nome: string;
  email: string;
  papel: PapelMembro;
  telefone?: string | null;
  // Sem ele: a recepção nasce sem atender, os outros atendendo.
  atende?: boolean;
}

// PATCH /equipe/:id. E-mail fica fora: trocá-lo mudaria por onde o
// membro entra.
export interface EdicaoDoMembro {
  nome?: string;
  telefone?: string | null;
  papel?: PapelMembro;
  atende?: boolean;
  ativo?: boolean;
}

export interface AceiteDoConvite {
  email: string;
  codigo: string;
  senha: string;
}

export interface NovoBloqueio {
  barbeiroId: string;
  dataInicio: string;
  dataFim: string;
  // As duas ou nenhuma: sem horas é o dia inteiro.
  horaInicio?: string | null;
  horaFim?: string | null;
  motivo?: string | null;
}

export function criarApiBarbeiro(requisicao: Requisicao) {
  return {
    // Sem token: não existe sessão ainda.
    signup(nova: NovaBarbearia): Promise<SessaoBarbeiro> {
      return requisicao("/auth/signup", { metodo: "POST", corpo: nova });
    },

    login(credenciais: CredenciaisDoBarbeiro): Promise<SessaoBarbeiro> {
      return requisicao("/auth/login", { metodo: "POST", corpo: credenciais });
    },

    // Sem token, como o login. Responde igual tendo ou não conta: não há
    // nada a devolver.
    async pedirCodigo(email: string): Promise<void> {
      await requisicao("/auth/codigo", { metodo: "POST", corpo: { email } });
    },

    // Mesmo formato de sessão do login: quem redefine já sai logado.
    redefinirSenha(redefinicao: RedefinicaoDeSenha): Promise<SessaoBarbeiro> {
      return requisicao("/auth/senha", { metodo: "POST", corpo: redefinicao });
    },

    // Sem token: o convidado ainda não tem sessão. Mesmo formato de
    // sessão do login — quem aceita já sai logado.
    aceitarConvite(aceite: AceiteDoConvite): Promise<SessaoBarbeiro> {
      return requisicao("/auth/convite/aceitar", { metodo: "POST", corpo: aceite });
    },

    // Todos os papéis leem; só o dono muda (as três de baixo).
    async equipe(): Promise<MembroDaEquipe[]> {
      const resposta = await requisicao<{ membros: MembroDaEquipe[] }>("/equipe", {
        comToken: true,
      });
      return resposta.membros;
    },

    convidarMembro(novo: NovoMembro): Promise<MembroDaEquipe> {
      return requisicao("/equipe", { metodo: "POST", corpo: novo, comToken: true });
    },

    atualizarMembro(id: string, edicao: EdicaoDoMembro): Promise<MembroDaEquipe> {
      return requisicao(`/equipe/${id}`, { metodo: "PATCH", corpo: edicao, comToken: true });
    },

    // Sem corpo, e é o que mantém a requisição sem Content-Type: com
    // ele e corpo vazio o Fastify responde 400 antes da rota.
    async reenviarConvite(id: string): Promise<void> {
      await requisicao(`/equipe/${id}/convite`, { metodo: "POST", comToken: true });
    },

    async jornada(id: string): Promise<DiaDaJornada[]> {
      const resposta = await requisicao<{ jornada: DiaDaJornada[] }>(`/equipe/${id}/jornada`, {
        comToken: true,
      });
      return resposta.jornada;
    },

    // A semana inteira, sete dias: a API recusa menos.
    async salvarJornada(id: string, jornada: DiaDaJornada[]): Promise<DiaDaJornada[]> {
      const resposta = await requisicao<{ jornada: DiaDaJornada[] }>(`/equipe/${id}/jornada`, {
        metodo: "PUT",
        corpo: { jornada },
        comToken: true,
      });
      return resposta.jornada;
    },

    async servicosDoMembro(id: string): Promise<string[]> {
      const resposta = await requisicao<{ servicoIds: string[] }>(`/equipe/${id}/servicos`, {
        comToken: true,
      });
      return resposta.servicoIds;
    },

    // A lista inteira: o que não vier deixa de ser feito pelo membro.
    async salvarServicosDoMembro(id: string, servicoIds: string[]): Promise<string[]> {
      const resposta = await requisicao<{ servicoIds: string[] }>(`/equipe/${id}/servicos`, {
        metodo: "PUT",
        corpo: { servicoIds },
        comToken: true,
      });
      return resposta.servicoIds;
    },

    // Os que tocam o período; o profissional recebe só os dele.
    async bloqueios(de: string, ate: string): Promise<BloqueioSerializado[]> {
      const resposta = await requisicao<{ bloqueios: BloqueioSerializado[] }>("/bloqueios", {
        query: { de, ate },
        comToken: true,
      });
      return resposta.bloqueios;
    },

    criarBloqueio(novo: NovoBloqueio): Promise<BloqueioSerializado> {
      return requisicao("/bloqueios", { metodo: "POST", corpo: novo, comToken: true });
    },

    async apagarBloqueio(id: string): Promise<void> {
      await requisicao(`/bloqueios/${id}`, { metodo: "DELETE", comToken: true });
    },

    meuPerfil(): Promise<PerfilBarbeiro> {
      return requisicao("/me", { comToken: true });
    },

    atualizarMeuPerfil(edicao: EdicaoDoPerfil): Promise<PerfilBarbeiro> {
      return requisicao("/me", {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    minhaBarbearia(): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me", { comToken: true });
    },

    // Rota própria, fora do `atualizarMinhaBarbearia`: trocar o link
    // quebra o que já foi mandado por WhatsApp, e a tela pede isso num
    // botão separado.
    trocarSlug(slug: string): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/slug", {
        metodo: "PATCH",
        corpo: { slug },
        comToken: true,
      });
    },

    atualizarMinhaBarbearia(
      edicao: EdicaoDaBarbearia
    ): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me", {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    async horarios(): Promise<HorarioSerializado[]> {
      const resposta = await requisicao<{ horarios: HorarioSerializado[] }>(
        "/barbearias/me/horarios",
        { comToken: true }
      );
      return resposta.horarios;
    },

    // PUT com a semana inteira: dia ausente do corpo vira fechado na
    // API, de propósito — "sem linha" e "fechado" seriam estados
    // diferentes pro cálculo de disponibilidade.
    async salvarHorarios(
      horarios: HorarioSerializado[]
    ): Promise<HorarioSerializado[]> {
      const resposta = await requisicao<{ horarios: HorarioSerializado[] }>(
        "/barbearias/me/horarios",
        { metodo: "PUT", corpo: { horarios }, comToken: true }
      );
      return resposta.horarios;
    },

    // Inclui os inativos: é desta lista que sai a tela de Serviços,
    // onde o barbeiro reativa o que desativou.
    async servicos(): Promise<ServicoSerializado[]> {
      const resposta = await requisicao<{ servicos: ServicoSerializado[] }>(
        "/servicos",
        { comToken: true }
      );
      return resposta.servicos;
    },

    criarServico(novo: NovoServico): Promise<ServicoSerializado> {
      return requisicao("/servicos", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    atualizarServico(
      id: string,
      edicao: EdicaoDoServico
    ): Promise<ServicoSerializado> {
      return requisicao(`/servicos/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    // Soft delete na API: some da lista pública, continua na do
    // barbeiro, e o histórico de quem já foi atendido sobrevive.
    desativarServico(id: string): Promise<ServicoSerializado> {
      return requisicao(`/servicos/${id}`, {
        metodo: "DELETE",
        comToken: true,
      });
    },

    // Devolve uma PÁGINA, não a lista: `{ clientes, total,
    // proximoCursor }`. Cada linha traz a data do último agendamento —
    // quem só quer o cadastro (a busca do Novo agendamento) lê
    // `.clientes` e ignora o resto.
    async clientes(busca?: string, cursor?: string): Promise<PaginaDeClientes> {
      // Busca vazia vira `undefined`, que é o único valor que o
      // `montarQuery` omite — `""` ele serializa, e `?busca=` bate no
      // `minLength: 1` do schema da API (400 "querystring/busca must
      // NOT have fewer than 1 characters"). Como as duas telas que
      // chamam isto abrem com o campo vazio, o filtro sem texto é o
      // caso comum, não a exceção.
      //
      // A normalização mora aqui, e não no `montarQuery`, porque quem
      // sabe que "sem busca" e "busca vazia" são a mesma coisa é este
      // endpoint — `""` pode ser um valor legítimo noutro parâmetro.
      //
      // O `trim` decide se manda, não o que manda: a API já descarta
      // espaços em volta, então `"   "` seria uma ida ao servidor pra
      // receber a lista inteira de volta.
      const termo = busca?.trim() ? busca : undefined;
      return requisicao<PaginaDeClientes>("/clientes", {
        query: { busca: termo, cursor },
        comToken: true,
      });
    },

    criarCliente(novo: NovoCliente): Promise<ClienteSerializado> {
      return requisicao("/clientes", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    cliente(id: string): Promise<ClienteComHistorico> {
      return requisicao(`/clientes/${id}`, { comToken: true });
    },

    atualizarCliente(
      id: string,
      edicao: EdicaoDoCliente
    ): Promise<ClienteSerializado> {
      return requisicao(`/clientes/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },

    // Duas funções e não uma com tudo opcional: a API responde 400 se
    // `data` vier junto de `de`/`ate`, e 400 se vier só metade do par.
    async agendamentosDoDia(data: string): Promise<AgendamentoComCliente[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoComCliente[];
      }>("/agendamentos", { query: { data }, comToken: true });
      return resposta.agendamentos;
    },

    async agendamentosDoIntervalo(
      de: string,
      ate: string
    ): Promise<AgendamentoComCliente[]> {
      const resposta = await requisicao<{
        agendamentos: AgendamentoComCliente[];
      }>("/agendamentos", { query: { de, ate }, comToken: true });
      return resposta.agendamentos;
    },

    agendamento(id: string): Promise<AgendamentoComCliente> {
      return requisicao(`/agendamentos/${id}`, { comToken: true });
    },

    // O wa.me com o texto do lembrete e o link assinado pela API — o
    // painel não tem como assinar o link, por isso a URL vem pronta.
    async lembreteWhatsApp(id: string): Promise<string> {
      const resposta = await requisicao<{ url: string }>(
        `/agendamentos/${id}/lembrete-whatsapp`,
        { comToken: true }
      );
      return resposta.url;
    },

    criarAgendamento(
      novo: NovoAgendamentoBarbeiroInput
    ): Promise<AgendamentoComCliente> {
      return requisicao("/agendamentos", {
        metodo: "POST",
        corpo: novo,
        comToken: true,
      });
    },

    atualizarAgendamento(
      id: string,
      edicao: EdicaoDoAgendamento
    ): Promise<AgendamentoComCliente> {
      return requisicao(`/agendamentos/${id}`, {
        metodo: "PATCH",
        corpo: edicao,
        comToken: true,
      });
    },
  };
}
