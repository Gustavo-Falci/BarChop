import type {
  AgendamentoComCliente,
  PagamentosOnline,
  AgendamentoSerializado,
  AntecedenciaDoLembrete,
  CategoriaDeServico,
  FormatoDaLogo,
  RegrasDeAgendamento,
  AparenciaDaPagina,
  BarbeariaDoPainel,
  BloqueioSerializado,
  ClienteSerializado,
  DiaDaJornada,
  EdicaoDeExcecao,
  ExcecaoDeHorario,
  ExcecaoSalva,
  HorarioSerializado,
  MembroDaEquipe,
  NovoAgendamentoBarbeiroInput,
  OcupacaoDoDia,
  CaixaDoDia,
  DivisaoDoDinheiro,
  MembroDoCaixa,
  SalvarDivisao,
  AssinantesDoPainel,
  AssinaturaDoPainel,
  FormaDoPagamento,
  RecebimentoDoBalcao,
  MudancaDoPlano,
  NovoPlano,
  PlanoDoPainel,
  PlanosDoPainel,
  PagamentoDoAgendamento,
  PagamentoDoAtendimento,
  RegistrarPagamento,
  FaixaDeCliente,
  FiltroDeNotificacoes,
  Notificacao,
  PaginaDeClientes,
  PapelMembro,
  PerfilBarbeiro,
  ResumoDaAssinatura,
  FaturaDaAssinatura,
  CicloDoPlano,
  IdDoPlano,
  ServicoSerializado,
  SessaoBarbeiro,
  EstadoDoOnboarding,
  SolicitacaoDeLink,
} from "@barchop/types";
import type { Requisicao } from "./requisicao";

// O que o dono escolhe na tela do plano. O Grátis não se compra.
export interface PedidoDeAssinatura {
  plano: Exclude<IdDoPlano, "gratis">;
  ciclo: CicloDoPlano;
  profissionais: number;
}

// O que o dono escolhe na tela do plano. O Grátis não se compra.
export interface PedidoDeAssinatura {
  plano: Exclude<IdDoPlano, "gratis">;
  ciclo: CicloDoPlano;
  profissionais: number;
}

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
  // O código que chegou no e-mail do dono (pedirCodigoDeCadastro).
  codigo: string;
}

export interface EdicaoDoPerfil {
  nome?: string;
  telefone?: string | null;
}

// As regras de agendamento (painel v2, marco 3) entram no mesmo PATCH:
// as opções são as de @barchop/formato/regras; `janelaDias: null` é sem
// limite.
export interface EdicaoDaBarbearia extends Partial<RegrasDeAgendamento> {
  nome?: string;
  telefone?: string | null;
  endereco?: string | null;
  // Só a moldura da logo; o arquivo vai por `enviarLogo`.
  logoFormato?: FormatoDaLogo;
  // Texto de apresentação da home pública; `null` limpa.
  sobre?: string | null;
  // Quanto antes do horário sai o lembrete. Não move os já agendados.
  lembreteAntecedenciaHoras?: AntecedenciaDoLembrete;
  // Ligar enfileira os agendamentos futuros que ainda não têm lembrete.
  lembreteAtivo?: boolean;
  // A página rica. Instagram é o @ sem o @; as listas são as de
  // @barchop/formato. `null` limpa.
  whatsapp?: string | null;
  instagram?: string | null;
  comodidades?: string[];
  formasDePagamento?: string[];
}

export interface NovoServico {
  nome: string;
  duracaoMinutos: number;
  preco: string; // string, nunca number — ver ServicoSerializado
  // Agrupa na página pública; só valor da lista, null = sem categoria.
  categoria?: CategoriaDeServico | null;
  // O texto curto do cartão na página pública; vazio vira null na API.
  descricao?: string | null;
}

export interface EdicaoDoServico extends Partial<NovoServico> {
  ativo?: boolean;
}

export interface NovoCliente {
  nome: string;
  telefone: string;
  email?: string | null;
}

// `profissionalId`: de quem o cliente é no caixa (null = de ninguém).
// Só o dono troca; a API responde 403 pros outros.
export type EdicaoDoCliente = Partial<NovoCliente> & { profissionalId?: string | null };

export interface EdicaoDoAgendamento {
  status?: "pendente" | "confirmado" | "concluido" | "cancelado" | "no_show";
  observacoes?: string | null;
}

// O remarcar do painel (POST /agendamentos/:id/remarcar). Serviços e
// cliente vêm do agendamento. `barbeiroId` troca de profissional (o
// profissional só no próprio); `avisarCliente` manda o e-mail "seu
// horário mudou" — a API assume `true` sem ele.
export interface RemarcacaoDoPainel {
  data: string;
  horaInicio: string;
  barbeiroId?: string;
  avisarCliente?: boolean;
}

export interface ClienteComHistorico extends ClienteSerializado {
  agendamentos: AgendamentoSerializado[];
  // De quem o cliente é no caixa; null = de ninguém ainda.
  profissional: MembroDoCaixa | null;
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
  // Só o dono libera; o dono vende sem ela (Onda 2, marco 3).
  podeVenderPlanos?: boolean;
  // Desativar quem tem assinante nos planos que vende é 422
  // `assinaturas_ativas`; com isto, as assinaturas são canceladas junto.
  cancelarAssinaturas?: boolean;
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

function filtroDaConta(daCasa: boolean): { daCasa?: string } {
  return daCasa ? { daCasa: "true" } : {};
}

export function criarApiBarbeiro(requisicao: Requisicao) {
  return {
    // Sem token: não existe sessão ainda.
    signup(nova: NovaBarbearia): Promise<SessaoBarbeiro> {
      return requisicao("/auth/signup", { metodo: "POST", corpo: nova });
    },

    // Sem token. Responde igual com o e-mail livre ou já cadastrado: o
    // livre recebe o código, o cadastrado recebe um aviso.
    async pedirCodigoDeCadastro(email: string): Promise<void> {
      await requisicao("/auth/cadastro/codigo", { metodo: "POST", corpo: { email } });
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

    // A equipe inteira, na ordem da página: faltou ou sobrou alguém, 400.
    async salvarOrdemDaEquipe(ids: string[]): Promise<MembroDaEquipe[]> {
      const resposta = await requisicao<{ membros: MembroDaEquipe[] }>("/equipe/ordem", {
        metodo: "PUT",
        corpo: { ids },
        comToken: true,
      });
      return resposta.membros;
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

    // O sino da barra de topo: as 50 mais novas do filtro, a conta das
    // não lidas, e marcar uma ou todas como lidas.
    async notificacoes(filtro: FiltroDeNotificacoes): Promise<Notificacao[]> {
      const resposta = await requisicao<{ notificacoes: Notificacao[] }>("/me/notificacoes", {
        comToken: true,
        query: { filtro },
      });
      return resposta.notificacoes;
    },

    async contagemDeNotificacoes(): Promise<number> {
      const resposta = await requisicao<{ naoLidas: number }>("/me/notificacoes/contagem", {
        comToken: true,
      });
      return resposta.naoLidas;
    },

    async marcarNotificacaoLida(id: string): Promise<void> {
      await requisicao(`/me/notificacoes/${id}/lida`, { comToken: true, metodo: "POST" });
    },

    async lerTodasAsNotificacoes(): Promise<void> {
      await requisicao("/me/notificacoes/ler-todas", { comToken: true, metodo: "POST" });
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

    // O link é único pra sempre e só o suporte troca (F4): o dono pede.
    // A leitura devolve o pedido mais recente, de qualquer status — a
    // tela mostra o pendente e também a última decisão.
    async solicitacaoDeLink(): Promise<SolicitacaoDeLink | null> {
      const resposta = await requisicao<{ solicitacao: SolicitacaoDeLink | null }>(
        "/barbearias/me/solicitacao-de-link",
        { comToken: true }
      );
      return resposta.solicitacao;
    },

    pedirTrocaDeLink(slug: string, motivo?: string): Promise<SolicitacaoDeLink> {
      return requisicao("/barbearias/me/solicitacao-de-link", {
        metodo: "POST",
        corpo: motivo === undefined ? { slug } : { slug, motivo },
        comToken: true,
      });
    },

    // Sem corpo, pelo mesmo motivo do reenviarConvite.
    cancelarPedidoDeLink(): Promise<SolicitacaoDeLink> {
      return requisicao("/barbearias/me/solicitacao-de-link/cancelar", {
        metodo: "POST",
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

    // Exceções por data (painel v2, marco 3), de hoje em diante.
    async excecoesDeHorario(): Promise<ExcecaoDeHorario[]> {
      const resposta = await requisicao<{ excecoes: ExcecaoDeHorario[] }>(
        "/barbearias/me/horarios/excecoes",
        { comToken: true }
      );
      return resposta.excecoes;
    },

    // Mandar de novo a mesma data substitui.
    salvarExcecaoDeHorario(data: string, edicao: EdicaoDeExcecao): Promise<ExcecaoSalva> {
      return requisicao(`/barbearias/me/horarios/excecoes/${data}`, {
        metodo: "PUT",
        corpo: edicao,
        comToken: true,
      });
    },

    async apagarExcecaoDeHorario(data: string): Promise<void> {
      await requisicao(`/barbearias/me/horarios/excecoes/${data}`, { metodo: "DELETE", comToken: true });
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

    // Todos os serviços, inativos inclusive, na ordem nova. Mesma regra
    // da equipe: a lista tem de ser exatamente a da barbearia.
    async salvarOrdemDosServicos(ids: string[]): Promise<ServicoSerializado[]> {
      const resposta = await requisicao<{ servicos: ServicoSerializado[] }>("/servicos/ordem", {
        metodo: "PUT",
        corpo: { ids },
        comToken: true,
      });
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
    async clientes(
      busca?: string,
      cursor?: string,
      faixa: FaixaDeCliente = "todos"
    ): Promise<PaginaDeClientes> {
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
        // "todos" é o padrão da API: só as outras faixas vão na URL.
        query: { busca: termo, cursor, faixa: faixa === "todos" ? undefined : faixa },
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

    // A ocupação do Hoje (painel v2, marco 4): trabalho e agendado, em
    // minutos, por profissional e da casa. A data é a de hoje da tela.
    ocupacaoDoDia(data: string): Promise<OcupacaoDoDia> {
      return requisicao("/barbearias/me/ocupacao", { query: { data }, comToken: true });
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

    // Capa e foto (bloco E2): o arquivo vai pra API, que confere o tipo
    // pelos bytes, guarda e devolve a URL. Quem chama já redimensionou.
    async enviarCapa(arquivo: Blob): Promise<string> {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo, "capa");
      const resposta = await requisicao<{ capaUrl: string }>("/barbearias/me/capa", {
        metodo: "POST",
        formulario,
        comToken: true,
      });
      return resposta.capaUrl;
    },

    async removerCapa(): Promise<void> {
      await requisicao("/barbearias/me/capa", { metodo: "DELETE", comToken: true });
    },

    // A logo e a moldura dela juntas: o formato que o navegador sugeriu e
    // o dono confirmou vai na query. Quem chama já reduziu a imagem,
    // mantendo a transparência.
    async enviarLogo(
      arquivo: Blob,
      formato: FormatoDaLogo
    ): Promise<{ logoUrl: string; logoFormato: FormatoDaLogo }> {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo, "logo");
      return requisicao("/barbearias/me/logo", {
        metodo: "POST",
        query: { formato },
        formulario,
        comToken: true,
      });
    },

    async removerLogo(): Promise<void> {
      await requisicao("/barbearias/me/logo", { metodo: "DELETE", comToken: true });
    },

    // A Aparência: o rascunho fica no servidor até publicar ou
    // descartar. Rascunho igual ao que está no ar volta como null.
    salvarRascunhoDaAparencia(aparencia: AparenciaDaPagina): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/aparencia/rascunho", {
        metodo: "PUT",
        corpo: aparencia,
        comToken: true,
      });
    },

    // Sem corpo: publica o rascunho guardado. Sem rascunho, 409.
    publicarAparencia(): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/aparencia/publicar", { metodo: "POST", comToken: true });
    },

    // Salva na hora, direto no ar (e no rascunho pendente, se houver).
    salvarLayoutDosServicos(layoutDosServicos: AparenciaDaPagina["layoutDosServicos"]): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/aparencia/layout-dos-servicos", {
        metodo: "PUT",
        corpo: { layoutDosServicos },
        comToken: true,
      });
    },

    // A ordem das seções de serviço na página. As que não vierem a API
    // completa no fim, na ordem padrão.
    salvarOrdemDasCategorias(categorias: CategoriaDeServico[]): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/categorias/ordem", {
        metodo: "PUT",
        corpo: { categorias },
        comToken: true,
      });
    },

    descartarRascunhoDaAparencia(): Promise<BarbeariaDoPainel> {
      return requisicao("/barbearias/me/aparencia/rascunho", { metodo: "DELETE", comToken: true });
    },

    // A assinatura do BarChop, só do dono. Pagar e gerenciar é na
    // Stripe: o Checkout e o Portal devolvem o endereço de lá.
    assinatura(): Promise<ResumoDaAssinatura> {
      return requisicao("/barbearias/me/assinatura", { comToken: true });
    },

    checkoutDaAssinatura(pedido: PedidoDeAssinatura): Promise<{ url: string }> {
      return requisicao("/barbearias/me/assinatura/checkout", { metodo: "POST", corpo: pedido, comToken: true });
    },

    // Da mais nova pra mais velha; sem ter assinado, nenhuma.
    faturasDaAssinatura(): Promise<FaturaDaAssinatura[]> {
      return requisicao("/barbearias/me/assinatura/faturas", { comToken: true });
    },

    // Sem ter assinado, 409: ainda não há cliente na Stripe.
    portalDaAssinatura(): Promise<{ url: string }> {
      return requisicao("/barbearias/me/assinatura/portal", { metodo: "POST", comToken: true });
    },

    async enviarFotoDoMembro(id: string, arquivo: Blob): Promise<string> {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo, "foto");
      const resposta = await requisicao<{ fotoUrl: string }>(`/equipe/${id}/foto`, {
        metodo: "POST",
        formulario,
        comToken: true,
      });
      return resposta.fotoUrl;
    },

    async removerFotoDoMembro(id: string): Promise<void> {
      await requisicao(`/equipe/${id}/foto`, { metodo: "DELETE", comToken: true });
    },

    async enviarFotoDoServico(id: string, arquivo: Blob): Promise<string> {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo, "foto");
      const resposta = await requisicao<{ fotoUrl: string }>(`/servicos/${id}/foto`, {
        metodo: "POST",
        formulario,
        comToken: true,
      });
      return resposta.fotoUrl;
    },

    async removerFotoDoServico(id: string): Promise<void> {
      await requisicao(`/servicos/${id}/foto`, { metodo: "DELETE", comToken: true });
    },

    // A trilha de primeiros passos (só o dono lê e marca).
    onboarding(): Promise<EstadoDoOnboarding> {
      return requisicao("/barbearias/me/onboarding", { comToken: true });
    },

    marcarTrabalhoSozinho(trabalhoSozinho: boolean): Promise<EstadoDoOnboarding> {
      return requisicao("/barbearias/me/onboarding", {
        metodo: "PATCH",
        corpo: { trabalhoSozinho },
        comToken: true,
      });
    },

    // Qualquer um da equipe: quem copia o link pode ser o profissional.
    async marcarLinkCopiado(): Promise<void> {
      await requisicao("/barbearias/me/link-copiado", { metodo: "POST", comToken: true });
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

    // Devolve o agendamento NOVO: remarcar cancela o antigo e cria outro,
    // com outro id.
    remarcarAgendamento(id: string, remarcacao: RemarcacaoDoPainel): Promise<AgendamentoComCliente> {
      return requisicao(`/agendamentos/${id}/remarcar`, {
        metodo: "POST",
        corpo: remarcacao,
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

    // O caixa do dia (Onda 2, marco 2). Plano sem caixa: 403
    // `recurso_do_plano`; dia fechado: 409 `dia_fechado` nas escritas.
    pagamentoDoAgendamento(id: string): Promise<PagamentoDoAtendimento> {
      return requisicao(`/agendamentos/${id}/pagamento`, { comToken: true });
    },

    // Cria ou refaz o pagamento e conclui o atendimento.
    registrarPagamento(id: string, dados: RegistrarPagamento): Promise<PagamentoDoAgendamento> {
      return requisicao(`/agendamentos/${id}/pagamento`, {
        metodo: "PUT",
        corpo: dados,
        comToken: true,
      });
    },

    async removerPagamento(id: string): Promise<void> {
      await requisicao(`/agendamentos/${id}/pagamento`, { metodo: "DELETE", comToken: true });
    },

    // O caixa de um dia ("YYYY-MM-DD"). O profissional recebe só o dele.
    caixaDoDia(data: string): Promise<CaixaDoDia> {
      return requisicao(`/barbearias/me/caixa?data=${data}`, { comToken: true });
    },

    // Só o dono. Fechar grava a foto do acerto e devolve o caixa.
    fecharODia(data: string): Promise<CaixaDoDia> {
      return requisicao(`/barbearias/me/caixa/${data}/fechamento`, { metodo: "POST", comToken: true });
    },

    async reabrirODia(data: string): Promise<void> {
      await requisicao(`/barbearias/me/caixa/${data}/fechamento`, { metodo: "DELETE", comToken: true });
    },

    // A divisão do dinheiro (só o dono): parte da casa e matriz.
    divisao(): Promise<DivisaoDoDinheiro> {
      return requisicao("/barbearias/me/divisao", { comToken: true });
    },

    salvarDivisao(divisao: SalvarDivisao): Promise<DivisaoDoDinheiro> {
      return requisicao("/barbearias/me/divisao", { metodo: "PUT", corpo: divisao, comToken: true });
    },

    // Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
    // marco 3). Fora do Completo: 403 `recurso_do_plano`. O profissional
    // recebe só os dele; os `podeCriar…` dizem o que a tela oferece.
    planos(): Promise<PlanosDoPainel> {
      return requisicao("/barbearias/me/planos", { comToken: true });
    },

    // O vendedor é sempre quem cria; da casa, só o dono.
    criarPlano(novo: NovoPlano): Promise<PlanoDoPainel> {
      return requisicao("/barbearias/me/planos", { metodo: "POST", corpo: novo, comToken: true });
    },

    // A lista de serviços, quando vem, substitui a inteira.
    editarPlano(id: string, mudanca: MudancaDoPlano): Promise<PlanoDoPainel> {
      return requisicao(`/barbearias/me/planos/${id}`, { metodo: "PATCH", corpo: mudanca, comToken: true });
    },

    // A conta de quem vende no Asaas (PR 9 do plano
    // planos-de-assinatura). `daCasa` = a que recebe os planos da casa,
    // só do dono; sem, a de quem está logado. A chave nunca volta: só os
    // 4 últimos caracteres. A API só lê `?daCasa=true`.
    pagamentosOnline(daCasa: boolean): Promise<PagamentosOnline> {
      return requisicao("/barbearias/me/pagamentos-online", { query: filtroDaConta(daCasa), comToken: true });
    },

    // Conectar, ou trocar a chave da mesma conta.
    conectarPagamentosOnline(daCasa: boolean, chave: string): Promise<PagamentosOnline> {
      return requisicao("/barbearias/me/pagamentos-online", {
        metodo: "PUT",
        query: filtroDaConta(daCasa),
        corpo: { provedor: "asaas", chave },
        comToken: true,
      });
    },

    // Recusado (422 `assinaturas_ativas`) com assinatura online viva na conta.
    async desconectarPagamentosOnline(daCasa: boolean): Promise<void> {
      await requisicao("/barbearias/me/pagamentos-online", {
        metodo: "DELETE",
        query: filtroDaConta(daCasa),
        comToken: true,
      });
    },

    // Só o dono: os planos ativos na página pública.
    ligarVitrine(ligada: boolean): Promise<{ ligada: boolean }> {
      return requisicao("/barbearias/me/vitrine-de-planos", { metodo: "PUT", corpo: { ligada }, comToken: true });
    },

    // O assinante no balcão. A lista, o "recebi" e o cancelar valem em
    // qualquer plano do BarChop; só assinar pede o Completo. O
    // profissional vê e mexe só nas dos planos dele.
    assinantes(clienteId?: string): Promise<AssinantesDoPainel> {
      const filtro = clienteId ? `?clienteId=${encodeURIComponent(clienteId)}` : "";
      return requisicao(`/barbearias/me/assinantes${filtro}`, { comToken: true });
    },

    // Com dias grátis nasce em teste; sem, pendente até o 1º "recebi".
    assinarPlano(clienteId: string, planoId: string): Promise<AssinaturaDoPainel> {
      return requisicao(`/clientes/${clienteId}/assinaturas`, { metodo: "POST", corpo: { planoId }, comToken: true });
    },

    // Abre um ciclo a partir de hoje. Antes do dia da renovação: 422
    // `ciclo_em_dia`.
    receberMensalidade(assinaturaId: string, forma: FormaDoPagamento): Promise<RecebimentoDoBalcao> {
      return requisicao(`/assinaturas/${assinaturaId}/recebimentos`, { metodo: "POST", corpo: { forma }, comToken: true });
    },

    async cancelarAssinaturaDoPlano(assinaturaId: string): Promise<void> {
      await requisicao(`/assinaturas/${assinaturaId}`, { metodo: "DELETE", comToken: true });
    },
  };
}
