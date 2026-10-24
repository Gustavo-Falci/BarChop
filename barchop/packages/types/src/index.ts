// Os tipos de entidade (Barbearia, Agendamento, Servico...) agora
// vêm do @prisma/client gerado — reexportados por @barchop/database.
// Esse pacote guarda só os DTOs que existem por causa da API, não
// do banco: formatos de entrada/saída de endpoint, versões "seguras"
// de uma entidade sem campos sensíveis, etc.

// Versão pública do Cliente — nunca inclui senhaHash. É o formato que
// `serializarCliente` (apps/api/src/lib/serializar.ts) produz: o
// serializador importa este tipo, então divergir os dois quebra o
// type-check em vez de quebrar uma tela.
export interface ClientePublico {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  temConta: boolean;
}

// Body de POST /agendamentos — o walk-in que o barbeiro registra. O
// `barbeariaId` sai do token e a `origem` é fixa em "barbeiro": os dois
// no corpo seriam forjáveis, e é por isso que este tipo não os tem.
// Preço e duração de cada serviço são resolvidos no backend, nunca
// confiados no que o client manda.
export interface NovoAgendamentoBarbeiroInput {
  barbeiroId: string;
  clienteId: string;
  servicoIds: string[];
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  observacoes?: string;
}

// Body de POST /barbearias/:slug/agendamentos — o cliente agendando pelo
// link público, sem conta. O `barbeariaId` sai do slug, a `origem` é fixa
// em "cliente", e o cliente é resolvido pelo telefone dentro daquela
// barbearia.
export interface NovoAgendamentoPublicoInput {
  // Ausente é "qualquer um": a API escolhe quem estiver livre e devolve
  // no `barbeiro` do agendamento.
  barbeiroId?: string;
  servicoIds: string[];
  data: string;
  horaInicio: string;
  // `email` é só pro lembrete deste agendamento: a API o grava no
  // agendamento, nunca no cadastro (cujo e-mail é o login do cliente).
  cliente: { nome: string; telefone: string; email?: string };
  observacoes?: string;
}

// Os DTOs de resposta moram aqui, e não em apps/api, pelo mesmo motivo
// do ClientePublico acima: o serializador importa o tipo, então
// divergir os dois quebra o type-check em vez de quebrar uma tela.

// As regras de agendamento da barbearia (painel v2, marco 3): como o
// cliente marca, remarca e cancela pelo link — o painel encaixa livre.
// Mesmos campos e opções de @barchop/formato/regras, que é quem valida
// e decide; a página pública também lê (a tela do cliente mostra os
// prazos).
export interface RegrasDeAgendamento {
  intervaloMinutos: 15 | 30 | 60;
  antecedenciaMinutos: 0 | 30 | 60 | 120 | 240 | 1440;
  aceitaMesmoDia: boolean;
  // null = sem limite.
  janelaDias: 7 | 14 | 30 | 60 | 90 | null;
  cabeAntesDeFechar: boolean;
  prazoRemarcarHoras: 0 | 1 | 2 | 6 | 12 | 24 | 48;
  prazoCancelarHoras: 0 | 1 | 2 | 6 | 12 | 24 | 48;
}

export interface BarbeariaSerializada extends RegrasDeAgendamento {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  // A logo (bloco da marca), montada da chave guardada como a capa, e a
  // moldura em que ela aparece. Os dois nulos juntos: sem logo.
  logoUrl: string | null;
  logoFormato: FormatoDaLogo | null;
  // Texto de apresentação da home pública. Anulável porque toda
  // barbearia nasce sem ele — a home tem que funcionar assim.
  sobre: string | null;
  // A página rica (bloco E1). WhatsApp normalizado como o telefone;
  // Instagram é o @ sem o @ (a tela monta o link). Comodidades e formas
  // de pagamento são valores das listas de @barchop/formato.
  whatsapp: string | null;
  instagram: string | null;
  comodidades: string[];
  formasDePagamento: string[];
  // A capa da página pública (bloco E2), montada da chave guardada.
  capaUrl: string | null;
  // O visual da página (Aparência), sempre inteiro: sem nada salvo, o
  // padrão (o tema BarChop).
  aparencia: AparenciaDaPagina;
  // As categorias de serviço na ordem que o dono escolheu, sempre a
  // lista inteira (`ordenarCategorias`, @barchop/formato). É a ordem das
  // seções na página e no painel.
  ordemCategorias: string[];
}

// A Aparência da página pública. Mesmos campos e opções de
// @barchop/formato/aparencia, que é quem valida, normaliza e monta a
// paleta (este pacote não depende de nenhum outro).
export type IdDoTema =
  | "barchop"
  | "classico"
  | "ardosia"
  | "oceano"
  | "menta"
  | "floresta"
  | "citrico"
  | "quente"
  | "cobre"
  | "ousado"
  | "bordo"
  | "florescer"
  | "nude"
  | "elegante"
  | "meia-noite"
  | "gentleman"
  | "minimalista";
export type FonteDoTexto = "inter" | "roboto" | "poppins" | "montserrat" | "open-sans" | "lato";
export type NomeDaCor =
  | "marca"
  | "secundaria"
  | "destaque"
  | "fundo"
  | "card"
  | "apagado"
  | "texto"
  | "textoDeApoio"
  | "linhas";

export interface AparenciaDaPagina {
  tema: IdDoTema;
  modoPadrao: "claro" | "escuro" | "automatico";
  clienteTrocaModo: boolean;
  fonte: FonteDoTexto;
  // null = os títulos usam a fonte do texto.
  fonteDosTitulos: FonteDoTexto | "clash" | null;
  tamanhoDoTexto: "compacto" | "normal" | "espacoso";
  cantos: "retos" | "arredondados" | "pilula";
  botao: "solido" | "contorno" | "gradiente";
  cards: "plano" | "elevado" | "borda";
  // "#RRGGBB", por modo; só o que o dono trocou à mão.
  cores: { claro: Partial<Record<NomeDaCor, string>>; escuro: Partial<Record<NomeDaCor, string>> };
  layoutDosServicos: "agrupada" | "abas";
}

// A moldura da logo. Mesmos valores de FORMATOS_DA_LOGO em
// @barchop/formato (o banco tem o CHECK).
export type FormatoDaLogo = "redonda" | "quadrada" | "livre";

// A categoria do serviço. Mesmos valores de CATEGORIAS_DE_SERVICO em
// @barchop/formato (o banco tem o CHECK).
export type CategoriaDeServico = "cabelo" | "barba" | "combo" | "sobrancelha" | "quimica" | "infantil";

export type AntecedenciaDoLembrete = 2 | 12 | 24;

// Os próximos horários livres de um serviço, na página pública: a união
// do "qualquer um", em ordem, no máximo três.
export interface ProximosHorariosDoServico {
  servicoId: string;
  horarios: { data: string; horaInicio: string }[];
}

// O que a página "Confirmar ou cancelar" lê pelo token do link do
// lembrete. Traz a barbearia junto: a página se monta disto, e não de
// uma busca pelo slug, que pode ter mudado depois que o e-mail saiu.
export interface AgendamentoDoLembrete {
  id: string;
  data: string;
  horaInicio: string;
  status: string;
  presencaConfirmadaEm: string | null;
  // O prazo de cancelar e o contato (painel v2, 3g): passado o prazo, a
  // tela esconde o Cancelar e mostra com quem falar.
  barbearia: {
    nome: string;
    slug: string;
    prazoCancelarHoras: RegrasDeAgendamento["prazoCancelarHoras"];
    whatsapp: string | null;
    telefone: string | null;
  };
  barbeiro: { nome: string };
  servicos: { nome: string }[];
}

// O que só o painel lê: a configuração do lembrete não é da conta de
// quem abre a página pública.
export interface BarbeariaDoPainel extends BarbeariaSerializada {
  lembreteAntecedenciaHoras: AntecedenciaDoLembrete;
  // O interruptor do lembrete (Onda 1, G2c). Ligado nas barbearias novas.
  lembreteAtivo: boolean;
  // As áreas das Configurações salvas pelo menos uma vez (painel v2), na
  // ordem do índice. Mesmos nomes de AREAS_DE_CONFIGURACAO em
  // @barchop/formato, que é quem decide qual campo marca qual área.
  areasDecididas: AreaDeConfiguracao[];
  // O que o dono mexeu na Aparência e ainda não publicou; null = nada
  // pendente. Só o painel vê.
  aparenciaRascunho: AparenciaDaPagina | null;
}

export type AreaDeConfiguracao =
  | "horarios"
  | "regras_de_agendamento"
  | "dados_do_negocio"
  | "aparencia"
  | "comunicacao"
  | "notificacoes";

export interface HorarioSerializado {
  diaSemana: number; // 0 = domingo
  horaAbertura: string | null; // "HH:mm"
  horaFechamento: string | null;
  fechado: boolean;
}

export interface ServicoSerializado {
  id: string;
  nome: string;
  duracaoMinutos: number;
  // String, nunca number: o preço é Decimal no banco e passar por float
  // perderia centavo. Ver serializarServico.
  preco: string;
  ativo: boolean;
  // Agrupa os serviços na página pública; null = sem categoria.
  categoria: CategoriaDeServico | null;
  // O texto curto do cartão na página pública; null = sem descrição.
  descricao: string | null;
  // URL pública da foto (a chave fica na API); null = sem foto.
  fotoUrl: string | null;
}

// Um nome só, um formato só: a resposta da API e o tipo que web e
// mobile importam não têm como divergir em silêncio.
export type ClienteSerializado = ClientePublico;

// O que cada linha de GET /clientes devolve: o cliente mais a data do
// último agendamento dele. Vem junto, e não de uma segunda chamada,
// porque a lista do painel baixava a agenda inteira do trimestre — com
// cliente e serviços aninhados em cada registro — só pra preencher uma
// coluna. Aqui é uma agregação no banco.
//
// `null` quer dizer "nunca veio", não "não sei": a data é a maior de
// TODAS as dele, sem janela nenhuma. Quem decide a partir de quando
// isso vira "sumido" é a tela, que é quem sabe que dia é hoje. Manter a
// janela fora do contrato é também o que mantém o dublê de teste
// honesto — sem relógio próprio, ele não tem como divergir da API.
export interface ClienteDaLista extends ClientePublico {
  ultimoAgendamento: string | null; // "YYYY-MM-DD"
}

// Uma página de GET /clientes. O `total` existe porque sem ele a tela
// não tinha como distinguir "são 200 clientes" de "são os 200 primeiros
// de um número que eu não sei" — e, ordenando por nome, o que sumia era
// sempre o fim do alfabeto, em silêncio.
//
// `proximoCursor` é o id do último cliente da página, e `null` quer
// dizer que acabou. Cursor e não `offset`: a lista é ordenada por nome,
// e um cadastro novo no meio do alfabeto desloca todas as páginas
// seguintes de um offset — fazendo alguém aparecer duas vezes ou
// nenhuma. O cursor não se move quando a vizinhança muda.
export interface PaginaDeClientes {
  clientes: ClienteDaLista[];
  // Quantos há na faixa pedida (com a busca): o "X de Y" do carregar mais.
  total: number;
  // As três faixas das pílulas, com a busca e sem a faixa pedida —
  // contadas no servidor, que vê a carteira inteira.
  contagens: Record<FaixaDeCliente, number>;
  proximoCursor: string | null;
}

// As faixas da lista de clientes. Recentes = algum agendamento de 30
// dias pra cá (futuro incluso); sumidos = nenhum de 90 dias pra cá,
// inclusive quem nunca veio. "Hoje" é o da barbearia.
export type FaixaDeCliente = "todos" | "recentes" | "sumidos";

export interface AgendamentoServicoSerializado {
  servicoId: string;
  nome: string;
  // Preço e duração congelados no dia do agendamento, nunca os de hoje.
  precoNoMomento: string;
  duracaoNoMomento: number;
}

export interface AgendamentoSerializado {
  id: string;
  data: string; // "YYYY-MM-DD"
  horaInicio: string; // "HH:mm"
  horaFim: string;
  status: string;
  origem: string;
  observacoes: string | null;
  servicos: AgendamentoServicoSerializado[];
  // Com quem. No "qualquer um" o cliente só sabe depois de marcar; a
  // agenda da equipe desenha uma coluna por profissional.
  barbeiro: { id: string; nome: string };
  // Quando o cliente confirmou presença pelo link do lembrete (ISO);
  // null = não confirmou.
  presencaConfirmadaEm: string | null;
}

// As rotas do barbeiro devolvem o cliente junto porque a agenda mostra
// o nome em cada linha; as públicas nunca devolvem — quem sabe o
// telefone de alguém não pode puxar a agenda dessa pessoa.
export interface AgendamentoComCliente extends AgendamentoSerializado {
  cliente: ClienteSerializado;
}

// Resposta de GET /barbearias/:slug. O `barbeiros` traz quem pode
// atender e o que cada um faz: é com isso que o passo do profissional
// oferece só quem faz os serviços escolhidos.
export interface PerfilPublicoBarbearia extends BarbeariaSerializada {
  horarios: HorarioSerializado[];
  barbeiros: { id: string; nome: string; servicoIds: string[]; fotoUrl: string | null }[];
}

// A trilha de primeiros passos do dono (Onda 1, F2), na ordem da tela.
export type PassoDoOnboarding = "horarios" | "servicos" | "equipe" | "link" | "primeira_reserva";

export interface EstadoDoOnboarding {
  passos: { id: PassoDoOnboarding; feito: boolean }[];
  completo: boolean;
}

export interface SessaoBarbeiro {
  token: string;
  barbeiro: { id: string; nome: string; email: string | null };
  barbearia: { id: string; nome: string; slug: string };
}

export interface SessaoCliente {
  token: string;
  cliente: ClienteSerializado;
}

// O pedido de troca do link (Onda 1, F4): o link é único pra sempre, e
// só o suporte troca. `resposta` é o que o suporte escreveu ao recusar.
export interface SolicitacaoDeLink {
  id: string;
  slugPedido: string;
  motivo: string | null;
  status: "pendente" | "aprovada" | "recusada" | "cancelada";
  resposta: string | null;
  criadoEm: string;
  decididoEm: string | null;
}

// O aviso que o suporte publica pra todas as barbearias (POST
// /suporte/avisos): cai no sino de cada membro ativo, na aba Avisos.
// `link`: um caminho do painel ("/painel/…") ou um https de fora.
export interface NovoAviso {
  titulo: string;
  texto: string;
  link?: string;
}

export interface AvisoPublicado {
  id: string;
  titulo: string;
  texto: string;
  link: string | null;
  criadoEm: string;
  // Quantos membros receberam (os ativos na hora) e quantos já leram.
  destinatarios: number;
  lidas: number;
}

// Como o suporte vê o pedido: com a barbearia e o link atual dela.
export interface SolicitacaoNaFila extends SolicitacaoDeLink {
  barbearia: { id: string; nome: string; slug: string };
}

// A conta do suporte é da plataforma, fora de qualquer equipe.
export interface SessaoSuporte {
  token: string;
  operador: { id: string; nome: string; email: string };
}

// O papel do membro na equipe. Decide o que o painel mostra; quem barra
// é a API (matriz em apps/api/tests/routers/auth-papeis.test.ts).
export type PapelMembro = "dono" | "profissional" | "recepcao";

export interface PerfilBarbeiro {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  barbeariaId: string;
  papel: PapelMembro;
  // Aparece na agenda e no fluxo público. A recepção nasce sem atender.
  atende: boolean;
  // A foto do membro (a mesma da Equipe); nula sem foto.
  fotoUrl: string | null;
}

// O sino da barra de topo do painel (GET /me/notificacoes). O texto vem
// pronto da API; `link` é um caminho do painel ou um https de fora.
export type TipoDeNotificacao = "agendamento" | "pagamento" | "plataforma";
export type FiltroDeNotificacoes = "nao-lidas" | "todas" | "avisos";

export interface Notificacao {
  id: string;
  tipo: TipoDeNotificacao;
  titulo: string;
  texto: string;
  link: string | null;
  lida: boolean;
  criadaEm: string;
}

// Cada dia da jornada do membro: acompanha o funcionamento da barbearia,
// tem horas próprias (só neste modo há horas) ou é folga. A janela que
// vale é a interseção com o funcionamento.
export type ModoJornada = "barbearia" | "proprio" | "folga";

export interface DiaDaJornada {
  diaSemana: number; // 0 = domingo
  modo: ModoJornada;
  horaInicio: string | null; // "HH:mm"
  horaFim: string | null;
  // A pausa do almoço do dia (painel v2, marco 3): as duas ou nenhuma, e
  // nunca na folga. Opcional ao mandar; a API sempre devolve.
  pausaInicio?: string | null;
  pausaFim?: string | null;
}

// Exceção por data no horário da barbearia (painel v2, marco 3): fecha a
// casa num feriado ou muda o horário de um dia, pra toda a equipe.
export interface ExcecaoDeHorario {
  data: string; // "YYYY-MM-DD"
  fechado: boolean;
  horaAbertura: string | null; // "HH:mm"; nulas quando fechado
  horaFechamento: string | null;
  motivo: string | null;
}

export interface EdicaoDeExcecao {
  fechado: boolean;
  horaAbertura?: string | null;
  horaFechamento?: string | null;
  motivo?: string | null;
}

// A exceção gravada e quantos agendamentos já marcados na data ficam
// fora do horário novo — a API não mexe neles.
export interface ExcecaoSalva {
  excecao: ExcecaoDeHorario;
  foraDoHorario: number;
}

// Folga, almoço ou horário fechado. Sem horas é o dia inteiro; com
// horas, a mesma faixa em cada dia do período.
export interface BloqueioSerializado {
  id: string;
  barbeiroId: string;
  dataInicio: string; // "YYYY-MM-DD"
  dataFim: string;
  horaInicio: string | null;
  horaFim: string | null;
  motivo: string | null;
}

// GET /equipe. A tabela ainda se chama `barbeiro`; o conceito é membro.
export interface MembroDaEquipe {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  papel: PapelMembro;
  atende: boolean;
  ativo: boolean;
  fotoUrl: string | null;
  // Convidado que ainda não definiu a senha — não consegue entrar.
  convitePendente: boolean;
  // O dono liberou o membro pra vender planos ao cliente (Onda 2,
  // marco 3). O dono vende sem ela.
  podeVenderPlanos: boolean;
}

// GET /barbearias/me/ocupacao?data= (painel v2, marco 4). Minutos de
// trabalho (janela do dia − pausa − bloqueios) e minutos agendados
// (sem cancelado e falta), por quem atende e somados na casa. O
// profissional recebe só a própria linha, e a casa é ela.
export interface MinutosDoDia {
  minutosDeTrabalho: number;
  minutosAgendados: number;
}

export interface OcupacaoDoProfissional extends MinutosDoDia {
  id: string;
  nome: string;
  // O expediente do dia (painel v2, marco 6), pra agenda sombrear o que
  // está fechado: a janela efetiva (data especial > horário da casa, ∩
  // jornada) e a pausa da jornada. `null` = fechado / sem pausa. Bloqueio
  // fica de fora: a agenda o desenha à parte, com o motivo.
  janela: { abre: string; fecha: string } | null;
  pausa: { inicio: string; fim: string } | null;
}

export interface OcupacaoDoDia {
  data: string; // "YYYY-MM-DD"
  casa: MinutosDoDia;
  profissionais: OcupacaoDoProfissional[];
}

// GET /barbearias/:slug/disponibilidade — horários de início livres.
export interface Disponibilidade {
  horarios: string[]; // "HH:mm"
}

// GET /barbearias/:slug/disponibilidade/mes — `true` no dia que tem
// pelo menos um horário livre. A rota não sabe que dia é hoje: quem
// desabilita o passado é a tela.
export interface DisponibilidadeDoMes {
  dias: Record<string, boolean>; // "YYYY-MM-DD" -> tem vaga
}

// GET /barbearias/me/assinatura — a assinatura do BarChop, só pro dono
// (Onda 2, marco 1). Mesmas listas de @barchop/formato/planos, que é
// quem calcula; os ids da Stripe ficam de fora.
export type IdDoPlano = "gratis" | "essencial" | "completo";
export type CicloDoPlano = "mensal" | "anual";
export type SituacaoDaAssinatura = "teste" | "ativa" | "em_atraso" | "cancelada" | "gratis";

export interface ResumoDaAssinatura {
  situacao: SituacaoDaAssinatura;
  plano: IdDoPlano;
  ciclo: CicloDoPlano;
  planoEfetivo: IdDoPlano;
  testeTerminaEm: string | null;
  // Só em teste; fora dele, null.
  diasDeTesteRestantes: number | null;
  periodoTerminaEm: string | null;
  // Assinou durante o teste e a Stripe ainda não cobrou: a 1ª cobrança
  // é no fim do período.
  primeiraCobrancaPendente: boolean;
  // Cancelada no Portal: o plano vale até aqui, e não há nova cobrança.
  cancelaEm: string | null;
  profissionais: number;
  limiteDeProfissionais: number | null;
  // Mais profissionais que o plano que vale agora permite.
  excedente: boolean;
  // Quem atendia pelo link e saiu dele pelo limite do plano. O convite
  // pendente e quem não atende ficam de fora: não perderam nada.
  foraDoLink: { id: string; nome: string }[];
  // A barbearia já passou pelo Checkout: Faturas e Gerenciar abrem.
  temPortal: boolean;
  // O que a barbearia fez no teste, pra recomendar o plano. Só sem plano
  // pago e com teste (vigente ou vencido); senão, null.
  usoNoTeste: UsoNoTeste | null;
}

export interface UsoNoTeste {
  desde: string;
  ate: string;
  // Feitos no período, sem os cancelados.
  agendamentos: number;
  // Ativos hoje.
  servicos: number;
}

// GET /barbearias/me/assinatura/faturas — as faturas da assinatura,
// lidas da Stripe, da mais nova pra mais velha. `falhou` = a Stripe
// tentou cobrar e não conseguiu (ou desistiu); `anulada` não cobra mais;
// `reembolsada` (ou `reembolsada_em_parte`) foi paga e o dinheiro voltou.
export type SituacaoDaFatura = "paga" | "aberta" | "falhou" | "anulada" | "reembolsada" | "reembolsada_em_parte";

export interface FaturaDaAssinatura {
  id: string;
  numero: string | null;
  emitidaEm: string;
  valorCentavos: number;
  situacao: SituacaoDaFatura;
  // O PDF e a página da fatura na Stripe; nulos enquanto ela não fecha.
  pdfUrl: string | null;
  paginaUrl: string | null;
}

// O caixa do dia (Onda 2, marco 2). Dinheiro em centavos inteiros; as
// listas são FORMAS_DE_PAGAMENTO e MOTIVOS_DA_PARTE do @barchop/formato.
export type FormaDoPagamento = "pix" | "dinheiro" | "debito" | "credito";
export type MotivoDaParteDoPagamento = "atendimento" | "cliente" | "casa" | "gorjeta";

export interface MembroDoCaixa {
  id: string;
  nome: string;
}

export interface ParteDoPagamento {
  // `null` = a casa.
  beneficiario: MembroDoCaixa | null;
  motivo: MotivoDaParteDoPagamento;
  valorCentavos: number;
}

// O pagamento de um atendimento, com a divisão congelada no registro.
export interface PagamentoDoAgendamento {
  id: string;
  agendamentoId: string;
  // O dia do caixa: a data do agendamento.
  data: string;
  forma: FormaDoPagamento;
  servicosCentavos: number;
  descontoCentavos: number;
  gorjetaCentavos: number;
  // serviços − desconto + gorjeta: o que o cliente pagou.
  totalCentavos: number;
  atendente: MembroDoCaixa;
  // De quem o cliente era no registro; `null` = de ninguém.
  donoDoCliente: MembroDoCaixa | null;
  recebidoPor: MembroDoCaixa;
  registradoPor: MembroDoCaixa;
  registradoEm: string;
  partes: ParteDoPagamento[];
}

// Body de PUT /agendamentos/:id/pagamento. Sem `servicosCentavos`, vale
// a soma dos serviços do agendamento; sem `recebidoPorId`, quem atendeu.
export interface RegistrarPagamento {
  forma: FormaDoPagamento;
  servicosCentavos?: number;
  descontoCentavos?: number;
  gorjetaCentavos?: number;
  recebidoPorId?: string;
}

// GET /agendamentos/:id/pagamento. Com o dia fechado, o pagamento só
// muda depois de o dono reabrir.
export interface PagamentoDoAtendimento {
  pagamento: PagamentoDoAgendamento | null;
  diaFechado: boolean;
}

// GET /barbearias/me/caixa?data= — o caixa de um dia. O profissional
// recebe só o que é dele: os pagamentos em que entra, a linha dele no
// acerto, os repasses dele e as pendências da agenda dele.
export interface PagamentoDoCaixa extends PagamentoDoAgendamento {
  horaInicio: string;
  cliente: { id: string; nome: string };
}

export interface TotalDaForma {
  forma: FormaDoPagamento;
  quantidade: number;
  valorCentavos: number;
}

export interface LinhaDoAcertoDoCaixa {
  // `null` = a casa.
  pessoa: MembroDoCaixa | null;
  recebeuCentavos: number;
  cabeCentavos: number;
  // cabe − recebeu: positivo tem a receber, negativo tem a repassar.
  saldoCentavos: number;
}

export interface RepasseDoCaixa {
  // `null` = a casa (paga o fixo do plano da casa).
  de: MembroDoCaixa | null;
  // `null` = a casa.
  para: MembroDoCaixa | null;
  valorCentavos: number;
}

// Atendimento do dia que o caixa ainda não resolveu: concluído sem
// pagamento, ou ainda marcado (pendente ou confirmado).
export interface PendenciaDoCaixa {
  agendamentoId: string;
  horaInicio: string;
  status: "pendente" | "confirmado" | "concluido";
  cliente: { id: string; nome: string };
  barbeiro: MembroDoCaixa;
}

export interface CaixaDoDia {
  data: string;
  // Com o dia fechado, o acerto é a foto gravada ao fechar.
  fechamento: { fechadoEm: string; fechadoPor: MembroDoCaixa } | null;
  pagamentos: PagamentoDoCaixa[];
  // As quatro formas, sempre na ordem de FORMAS_DE_PAGAMENTO.
  totais: { totalCentavos: number; porForma: TotalDaForma[] };
  acerto: { pessoas: LinhaDoAcertoDoCaixa[]; repasses: RepasseDoCaixa[] };
  pendencias: PendenciaDoCaixa[];
}

// GET e PUT /barbearias/me/divisao (só o dono). Entram os membros
// ativos que atendem. Percentuais inteiros de 0 a 100.
export interface MembroDaDivisao extends MembroDoCaixa {
  // % que fica com a casa de tudo o que ele atende.
  parteDaCasa: number;
}

// "Cliente de A, atendido por B → A leva X%." Par ausente = 0.
export interface RegraDaMatriz {
  donoDoClienteId: string;
  atendenteId: string;
  percentual: number;
}

export interface DivisaoDoDinheiro {
  membros: MembroDaDivisao[];
  matriz: RegraDaMatriz[];
}

// A matriz enviada substitui a dos membros listados; quem não vem em
// `parteDaCasa` fica como estava.
export interface SalvarDivisao {
  parteDaCasa: { membroId: string; percentual: number }[];
  matriz: RegraDaMatriz[];
}

// Os planos que a barbearia e os barbeiros vendem ao cliente (Onda 2,
// marco 3). Não confundir com o plano do BarChop (`Assinatura`).
export type CicloDoCliente = "mensal" | "trimestral" | "anual";

export interface ServicoDoPlano {
  servicoId: string;
  nome: string;
  // Nulo = ilimitado.
  usosPorCiclo: number | null;
}

export interface PlanoDoPainel {
  id: string;
  // Da casa: vale com qualquer um, e quem atende ganha o fixo. De
  // barbeiro: vale só com o vendedor.
  daCasa: boolean;
  vendedor: { id: string; nome: string } | null;
  nome: string;
  descricao: string | null;
  ciclo: CicloDoCliente;
  precoCentavos: number;
  diasDeTeste: number;
  // Só no da casa; no de barbeiro, nulo.
  fixoPorAtendimentoCentavos: number | null;
  aceitaOnline: boolean;
  aceitaNoBalcao: boolean;
  ativo: boolean;
  servicos: ServicoDoPlano[];
  // Assinaturas vivas (não canceladas).
  assinantes: number;
}

// GET /barbearias/me/planos. O dono e a recepção recebem todos; o
// profissional, só os dele.
export interface PlanosDoPainel {
  vitrine: boolean;
  podeCriarDaCasa: boolean;
  podeCriarProprio: boolean;
  planos: PlanoDoPainel[];
}

// POST /barbearias/me/planos. O vendedor é sempre quem cria.
export interface NovoPlano {
  daCasa: boolean;
  nome: string;
  descricao?: string | null;
  ciclo: CicloDoCliente;
  precoCentavos: number;
  diasDeTeste?: number;
  fixoPorAtendimentoCentavos?: number | null;
  aceitaOnline?: boolean;
  aceitaNoBalcao?: boolean;
  servicos: { servicoId: string; usosPorCiclo: number | null }[];
}

// PATCH /barbearias/me/planos/:id. Tipo e vendedor não mudam; a lista de
// serviços, quando vem, substitui a inteira.
export type MudancaDoPlano = Partial<Omit<NovoPlano, "daCasa">> & { ativo?: boolean };

// GET /barbearias/:slug/planos (público). Sem o fixo da casa nem quantos
// assinam. `aceitaOnline` já diz se dá pra pagar online agora: precisa
// da conta de quem vende conectada.
export interface PlanoDaVitrine {
  id: string;
  daCasa: boolean;
  vendedor: { id: string; nome: string; fotoUrl: string | null } | null;
  nome: string;
  descricao: string | null;
  ciclo: CicloDoCliente;
  precoCentavos: number;
  diasDeTeste: number;
  aceitaOnline: boolean;
  aceitaNoBalcao: boolean;
  servicos: ServicoDoPlano[];
}

export interface VitrineDePlanos {
  planos: PlanoDaVitrine[];
}

export type SituacaoDoAssinante = "pendente" | "teste" | "ativa" | "em_atraso" | "cancelada";

// GET /barbearias/me/assinantes e as rotas de /assinaturas (painel). O
// profissional recebe só as dos planos dele. Preço e ciclo congelados
// na assinatura; o ciclo vai de `cicloComecaEm` até o dia da renovação,
// `cicloTerminaEm` (nulos enquanto pendente).
export interface AssinaturaDoPainel {
  id: string;
  situacao: SituacaoDoAssinante;
  forma: "online" | "no_balcao";
  precoCentavos: number;
  ciclo: CicloDoCliente;
  cicloComecaEm: string | null;
  cicloTerminaEm: string | null;
  canceladaEm: string | null;
  criadoEm: string;
  cliente: { id: string; nome: string; telefone: string };
  plano: { id: string; nome: string; daCasa: boolean; vendedor: { id: string; nome: string } | null };
}

export interface AssinantesDoPainel {
  assinantes: AssinaturaDoPainel[];
}

// POST /assinaturas/:id/recebimentos ("recebi" no balcão). `data` é o
// dia do caixa: o de hoje, ou o próximo aberto se hoje já fechou.
export interface RecebimentoDoBalcao {
  assinatura: AssinaturaDoPainel;
  recebimento: { id: string; data: string; valorCentavos: number; casaCentavos: number; forma: FormaDoPagamento };
}
