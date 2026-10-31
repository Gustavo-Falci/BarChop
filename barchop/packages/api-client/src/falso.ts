import {
  APARENCIA_PADRAO,
  DIAS_PARA_CANCELAR,
  CATEGORIAS_DE_SERVICO,
  COMODIDADES,
  FORMAS_DA_MENSALIDADE,
  FORMAS_DE_PAGAMENTO,
  PADRAO_INSTAGRAM,
  REGRAS_PADRAO,
  acertoDoDia,
  areasTocadas,
  assinanteUsaOPlano,
  cicloEmAtraso,
  dividirMensalidade,
  fimDoCiclo,
  problemaDoPlano,
  problemaDoRecebimento,
  parteDoPlano,
  preverPeloPlano,
  usosRestantes,
  dividirPagamento,
  juntarAreas,
  normalizarAparencia,
  ordenarCategorias,
  slugReservado,
  temRecurso,
  normalizarCpf,
  type AreaDeConfiguracao,
  type RegrasDeDivisao,
} from "@barchop/formato";
import type {
  AparenciaDaPagina,
  FaixaDeCliente,
  AgendamentoComCliente,
  AgendamentoDoCliente,
  AgendamentoDoLembrete,
  AgendamentoSerializado,
  CategoriaDeServico,
  AntecedenciaDoLembrete,
  BarbeariaDoPainel,
  ClienteSerializado,
  BloqueioSerializado,
  DiaDaJornada,
  EdicaoDeExcecao,
  ExcecaoDeHorario,
  FormatoDaLogo,
  HorarioSerializado,
  MembroDaEquipe,
  Notificacao,
  NovoAgendamentoBarbeiroInput,
  NovoAgendamentoPublicoInput,
  OcupacaoDoDia,
  CaixaDoDia,
  DivisaoDoDinheiro,
  MembroDoCaixa,
  SalvarDivisao,
  AssinaturaDoPainel,
  AssinaturaNoPagamento,
  FormaDoPagamento,
  MensalidadeDoCaixa,
  MudancaDoPlano,
  NovoPlano,
  PlanoDoPainel,
  PagamentoDoAgendamento,
  PapelMembro,
  PendenciaDoCaixa,
  RegistrarPagamento,
  PerfilPublicoBarbearia,
  ResumoDaAssinatura,
  FaturaDaAssinatura,
  ProximosHorariosDoServico,
  ServicoSerializado,
  EstadoDoOnboarding,
  PassoDoOnboarding,
  SessaoSuporte,
  SolicitacaoDeLink,
  SolicitacaoNaFila,
  AvisoPublicado,
  NovoAviso,
  AssinaturaNaConta,
  AssinaturaOnlineCriada,
  ContaDePagamentoOnline,
  PagamentosOnline,
  PlanoDaVitrine,
  ProvedorDePagamento,
} from "@barchop/types";
import type {
  AceiteDoConvite,
  EdicaoDaBarbearia,
  EdicaoDoMembro,
  NovoBloqueio,
  NovoMembro,
  EdicaoDoAgendamento,
  RemarcacaoDoPainel,
  EdicaoDoCliente,
  EdicaoDoPerfil,
  EdicaoDoServico,
  NovaBarbearia,
  NovoCliente,
  NovoServico,
  PedidoDeAssinatura,
  RedefinicaoDeSenha,
} from "./barbeiro";
import type { EdicaoDoMeuCadastro, Remarcacao } from "./cliente";
import { ErroDaApi } from "./erro";
import type {
  CredenciaisDoCliente,
  DestinoDoCodigo,
  FiltroDoDia,
  FiltroDoMes,
  OpcoesDaDisponibilidade,
  DefinicaoDeSenhaDoCliente,
} from "./publico";

// O único código que o dublê aceita na definição de senha do cliente.
export const CODIGO_DO_CLIENTE_FALSO = "123456";

// O único código que o dublê aceita no esqueci-a-senha do barbeiro.
export const CODIGO_DO_BARBEIRO_FALSO = "654321";

// O código que o dublê aceita no cadastro do dono — qualquer outro dá o
// mesmo 422 da API.
export const CODIGO_DO_CADASTRO_FALSO = "246810";

// O único código que o dublê aceita no convite da equipe.
export const CODIGO_DO_CONVITE_FALSO = "246810";

// A única conta de suporte que o dublê conhece; o resto é 401.
export const EMAIL_DO_SUPORTE_FALSO = "suporte@barchop.com.br";
export const SENHA_DO_SUPORTE_FALSA = "senha-do-suporte-falsa";

// Quem está logado no painel do dublê. O id é o mesmo da sessão e do
// `barbeiros` do perfil público.
function membroLogado(papel: PapelMembro): MembroDaEquipe {
  return {
    id: "bb1",
    nome: "Rafael",
    email: "rafael@gr.com",
    telefone: null,
    papel,
    atende: papel !== "recepcao",
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
    podeVenderPlanos: false,
  };
}

function equipePadrao(papel: PapelMembro): MembroDaEquipe[] {
  if (papel === "dono") return [membroLogado(papel)];
  return [
    {
      id: "bb0",
      nome: "Gustavo",
      email: "gustavo@gr.com",
      telefone: null,
      papel: "dono",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
      podeVenderPlanos: false,
    },
    membroLogado(papel),
  ];
}

export interface EstadoFalso {
  perfil: PerfilPublicoBarbearia;
  servicos: ServicoSerializado[];
  horariosLivres: string[];
  diasComVaga: Record<string, boolean>;
  // O `clienteId` é do dublê, não da API: AgendamentoSerializado não o
  // tem, e sem ele `comCliente` não sabe qual dos clientes da lista
  // pertence a cada agendamento. Opcional para não quebrar as sementes
  // do sub-projeto B, que não o informam.
  agendamentos: (AgendamentoSerializado & { clienteId?: string })[];
  // O cliente logado, que o escopo `clientes-me` usa.
  cliente: ClienteSerializado;
  // Os clientes que o barbeiro enxerga. Lista separada porque as duas
  // perguntas são diferentes: "quem sou eu" e "quem são os meus".
  clientes: ClienteSerializado[];
  // Quantos clientes cabem numa página de GET /clientes. Existe na
  // semente porque o padrão da API é 100, e um teste de "carregar mais"
  // precisaria de 101 cadastros pra ver a segunda página — com dois
  // clientes e um limite de 1, o mesmo caminho fica legível.
  limiteDaPagina?: number;
  // "Hoje" no fuso da barbearia ("YYYY-MM-DD"), pras faixas de cliente.
  // Na semente pra o teste fixar o dia; sem ela, o dia de verdade.
  hoje: string;
  // O papel de quem está logado no painel (o membro "bb1"). Dono por
  // padrão, pra as telas de antes da Onda 1 verem tudo como viam.
  papel?: PapelMembro;
  // A equipe da barbearia, com o logado dentro. Sem semente: só ele, e
  // um dono à parte quando ele não é o dono — barbearia sem dono não
  // existe na API.
  equipe?: MembroDaEquipe[];
  // Por id de membro. Quem não aparece nasce como na API: sete dias
  // acompanhando a barbearia e todos os serviços.
  jornadas?: Record<string, DiaDaJornada[]>;
  servicosPorMembro?: Record<string, string[]>;
  bloqueios?: BloqueioSerializado[];
  // Exceções por data no horário (painel v2, marco 3).
  excecoesDeHorario?: ExcecaoDeHorario[];
  // A configuração do lembrete, que só o painel lê. 24 h, como na API.
  lembreteAntecedenciaHoras?: AntecedenciaDoLembrete;
  // O interruptor do lembrete (G2c). Ligado, como nas barbearias novas.
  lembreteAtivo?: boolean;
  // As áreas das Configurações já salvas (painel v2). Sem semente,
  // nenhuma — como numa barbearia nova.
  areasDecididas?: AreaDeConfiguracao[];
  // O rascunho da Aparência que o dono ainda não publicou. Sem semente,
  // nenhum. O que está no ar mora no `perfil`, como na página pública.
  aparenciaRascunho?: AparenciaDaPagina | null;
  // Os tokens do link do lembrete que o dublê reconhece, por token o id
  // do agendamento. Qualquer outro é 401, como na API; os vencidos, 410.
  lembretes?: Record<string, string>;
  lembretesVencidos?: string[];
  // A trilha do dono: quais passos já estão feitos. Sem semente, nenhum
  // — derivar do resto do estado é trabalho da API, não do dublê.
  onboarding?: Partial<Record<PassoDoOnboarding, boolean>>;
  // Os próximos horários da página pública. Sem semente, cada serviço
  // ativo vem sem horário: calcular a agenda é da API, não do dublê.
  proximosHorarios?: ProximosHorariosDoServico[];
  // Os pedidos de troca do link de todas as barbearias, como o suporte
  // os vê. Os da barbearia do dublê (id do `perfil`) são os do dono.
  solicitacoesDeLink?: SolicitacaoNaFila[];
  // Links de outras barbearias, atuais ou antigos: pedir ou aprovar um
  // deles é 409, como na API.
  slugsEmUso?: string[];
  // O sino do membro logado, da mais nova pra mais antiga. Sem semente,
  // nenhuma.
  notificacoes?: Notificacao[];
  // Os avisos da plataforma já publicados, do mais novo. Sem semente,
  // nenhum.
  avisosPublicados?: AvisoPublicado[];
  // A assinatura do BarChop, como o GET a resume. Sem semente: em teste,
  // com 14 dias pela frente.
  assinatura?: ResumoDaAssinatura;
  // As faturas da Stripe, da mais nova. Sem semente, nenhuma.
  faturas?: FaturaDaAssinatura[];
  // O caixa do dia (Onda 2, marco 2). Sem semente: nenhum pagamento,
  // nenhum dia fechado e a divisão em 0 (quem atendeu fica com tudo).
  pagamentos?: PagamentoDoAgendamento[];
  diasFechados?: string[];
  divisao?: Omit<RegrasDeDivisao, "ativos">;
  // De quem cada cliente é, por id do cliente. Quem não aparece é de
  // ninguém, e passa a ser de quem o atender, como na API.
  donosDosClientes?: Record<string, string>;
  // Os planos que a barbearia vende ao cliente (Onda 2, marco 3) e se a
  // vitrine da página está ligada. Sem semente, nenhum e desligada.
  planos?: PlanoDoPainel[];
  vitrineDePlanos?: boolean;
  // As assinaturas dos clientes nesses planos, de qualquer jeito: a
  // lista ordena como a API. Sem semente, nenhuma.
  assinaturas?: AssinaturaDoPainel[];
  // As mensalidades recebidas no balcão, de qualquer dia: o "Recebi"
  // acrescenta, e o caixa do dia mostra as dele. Sem semente, nenhuma.
  mensalidades?: MensalidadeDoCaixa[];
  // As contas de quem vende no Asaas (PR 11): `casa` e o id de cada
  // membro. Sem semente, nenhuma.
  contasOnline?: Record<string, ContaDePagamentoOnline>;
  // O modo de chave que a plataforma aceita. Sem semente, o sandbox.
  modoAceito?: "teste" | "real";
  // O CPF do cliente logado, só os dígitos. Sem semente, nenhum: o
  // primeiro assinar pede.
  cpfDoCliente?: string | null;
  // Os usos do ciclo, por `${assinaturaId}:${servicoId}`. O dublê não
  // conta os atendimentos pelo plano: a semente diz quantos.
  usosNoCiclo?: Record<string, number>;
}

const FIM_DO_TESTE_PADRAO = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

const ASSINATURA_PADRAO: ResumoDaAssinatura = {
  situacao: "teste",
  plano: "gratis",
  ciclo: "mensal",
  planoEfetivo: "completo",
  testeTerminaEm: FIM_DO_TESTE_PADRAO,
  diasDeTesteRestantes: 14,
  periodoTerminaEm: null,
  primeiraCobrancaPendente: false,
  cancelaEm: null,
  profissionais: 1,
  limiteDeProfissionais: null,
  excedente: false,
  foraDoLink: [],
  temPortal: false,
  usoNoTeste: { desde: new Date().toISOString(), ate: FIM_DO_TESTE_PADRAO, agendamentos: 0, servicos: 0 },
};

const PERFIL_PADRAO: PerfilPublicoBarbearia = {
  id: "b1",
  nome: "GR Barber",
  slug: "gr-barber",
  telefone: "(11) 3333-4444",
  endereco: "Rua das Tesouras, 123",
  logoUrl: null,
  logoFormato: null,
  sobre: "Barbearia de bairro desde 2012. Corte na tesoura e barba na navalha.",
  whatsapp: null,
  instagram: null,
  comodidades: [],
  formasDePagamento: [],
  capaUrl: null,
  aparencia: APARENCIA_PADRAO,
  ordemCategorias: [...CATEGORIAS_DE_SERVICO],
  // As regras de agendamento nos padrões; salvar grava no perfil, como
  // a API (o dublê não aplica as regras: calcular a agenda é da API).
  ...REGRAS_PADRAO,
  horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAbertura: diaSemana === 0 ? null : "09:00",
    horaFechamento: diaSemana === 0 ? null : "18:00",
    fechado: diaSemana === 0,
  })),
  barbeiros: [{ id: "bb1", nome: "Rafael", servicoIds: ["s1", "s2"], fotoUrl: null }],
};

const CLIENTE_PADRAO: ClienteSerializado = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-8888",
  email: null,
  temConta: true,
};

const SERVICOS_PADRAO: ServicoSerializado[] = [
  { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
  { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: null, descricao: null, fotoUrl: null },
];

// Dublê com estado em memória. Existe pra teste de tela rodar sem rede
// e sem Postgres; o que ele NÃO faz é provar que a API real responde
// assim — os tipos compartilhados pegam divergência de forma, não de
// comportamento.
// O que um teste semeia: o agendamento pode vir sem `barbeiro` (as
// sementes de antes do bloco C não o têm) — o dublê completa com o
// membro logado, "bb1". O que sai do dublê sempre o tem, como na API.
type AgendamentoSemeado = Omit<AgendamentoSerializado, "barbeiro" | "presencaConfirmadaEm"> & {
  barbeiro?: AgendamentoSerializado["barbeiro"];
  // As sementes de antes do D4 não o têm: nasce sem confirmação.
  presencaConfirmadaEm?: string | null;
  clienteId?: string;
};
export type SementeFalsa = Partial<Omit<EstadoFalso, "agendamentos">> & {
  agendamentos?: AgendamentoSemeado[];
};

// O "hoje" da API (agoraNaBarbearia): o dia no fuso da barbearia, não
// no da máquina. "sv-SE" formata em ISO.
function hojeNaBarbearia(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

// Dias de calendário em UTC, como o somarDias da API.
function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

// Como a API: aparada, e vazia vira null (a descrição).
function limparTextoOpcional(texto: string | null | undefined): string | null {
  return texto?.trim() || null;
}

// Como o schema da API: só valor da lista fechada, ou null; fora dela, 400.
// O tipo já barra valor de fora; a checagem é pra quem chega com `as`
// (ou de um teste que testa a recusa).
// Cópia funda o bastante: o teste que guarda um pagamento devolvido não
// pode ver o dublê mudá-lo por baixo.
function copiaDoPagamento(pagamento: PagamentoDoAgendamento): PagamentoDoAgendamento {
  return JSON.parse(JSON.stringify(pagamento)) as PagamentoDoAgendamento;
}

function categoriaValida(categoria: CategoriaDeServico | null | undefined): CategoriaDeServico | null {
  if (categoria == null) return null;
  if (!(CATEGORIAS_DE_SERVICO as readonly string[]).includes(categoria)) {
    throw new ErroDaApi(400, "requisicao_invalida", "categoria fora da lista");
  }
  return categoria;
}

function copiaDoPlano(plano: PlanoDoPainel): PlanoDoPainel {
  return { ...plano, servicos: plano.servicos.map((s) => ({ ...s })) };
}

function copiaDaAssinatura(assinatura: AssinaturaDoPainel): AssinaturaDoPainel {
  return { ...assinatura, cliente: { ...assinatura.cliente }, plano: { ...assinatura.plano } };
}

function copiaDaMensalidade(mensalidade: MensalidadeDoCaixa): MensalidadeDoCaixa {
  return JSON.parse(JSON.stringify(mensalidade)) as MensalidadeDoCaixa;
}

// "26/11", como a mensagem da API.
function diaEMes(data: string): string {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

// Como a API lê a chave de cada provedor (lib/provedores): o modo sai
// do prefixo.
const NOME_DO_PROVEDOR: Record<ProvedorDePagamento, { o: string; do: string; inicio: string; teste: string }> = {
  asaas: { o: "o Asaas", do: "do Asaas", inicio: "$aact_", teste: "do sandbox" },
  stripe: { o: "a Stripe", do: "da Stripe", inicio: "sk_ ou rk_", teste: "de teste" },
  infinitepay: { o: "a InfinitePay", do: "da InfinitePay", inicio: "inchk_", teste: "de teste" },
};

// A InfiniteTag como a API lê (`lerTag`): com ou sem o $, até 40 letras,
// números, pontos, hífens ou sublinhados.
function tagDaInfinitePay(colada: string | undefined): string {
  const tag = (colada ?? "").trim().replace(/^\$/, "");
  if (tag === "") throw new ErroDaApi(422, "tag_obrigatoria", "a InfinitePay pede a InfiniteTag da conta");
  if (!/^[A-Za-z0-9._-]{1,40}$/.test(tag)) {
    throw new ErroDaApi(
      422,
      "tag_invalida",
      "a InfiniteTag tem até 40 letras, números, pontos, hífens ou sublinhados, sem espaço: confira no app da InfinitePay"
    );
  }
  return tag;
}

function modoDaChave(provedor: ProvedorDePagamento, chave: string): "teste" | "real" | null {
  if (provedor === "stripe") {
    const lido = /^(?:sk|rk)_(live|test)_/.exec(chave);
    return lido ? (lido[1] === "test" ? "teste" : "real") : null;
  }
  // Sem sandbox: toda chave da InfinitePay é de produção.
  if (provedor === "infinitepay") return chave.startsWith("inchk_") && chave.length > 6 ? "real" : null;
  return chave.startsWith("$aact_hmlg_") ? "teste" : chave.startsWith("$aact_prod_") ? "real" : null;
}

export function criarApiClientFalso(semente: SementeFalsa = {}) {
  // Cópia de toda lista, tanto do padrão quanto da semente: o dublê faz
  // `push` em `agendamentos` e em `servicos`, e sem a cópia dois testes
  // do mesmo arquivo veriam o estado um do outro — o padrão é um só
  // objeto de módulo, e a semente costuma ser reaproveitada.
  const estado: EstadoFalso = {
    perfil: semente.perfil ?? PERFIL_PADRAO,
    servicos: [...(semente.servicos ?? SERVICOS_PADRAO)],
    horariosLivres: [...(semente.horariosLivres ?? ["09:00", "09:30", "10:00"])],
    diasComVaga: { ...(semente.diasComVaga ?? {}) },
    agendamentos: (semente.agendamentos ?? []).map((agendamento) => ({
      ...agendamento,
      barbeiro: agendamento.barbeiro ?? { id: "bb1", nome: "Rafael" },
      presencaConfirmadaEm: agendamento.presencaConfirmadaEm ?? null,
    })),
    cliente: semente.cliente ?? CLIENTE_PADRAO,
    clientes: [...(semente.clientes ?? [CLIENTE_PADRAO])],
    // O mesmo padrão da API (LIMITE_PADRAO em routers/clientes.ts).
    limiteDaPagina: semente.limiteDaPagina ?? 100,
    hoje: semente.hoje ?? hojeNaBarbearia(),
    papel: semente.papel ?? "dono",
    equipe: (semente.equipe ?? equipePadrao(semente.papel ?? "dono")).map((m) => ({ ...m })),
    jornadas: { ...(semente.jornadas ?? {}) },
    servicosPorMembro: { ...(semente.servicosPorMembro ?? {}) },
    bloqueios: [...(semente.bloqueios ?? [])],
    excecoesDeHorario: [...(semente.excecoesDeHorario ?? [])],
    lembreteAntecedenciaHoras: semente.lembreteAntecedenciaHoras ?? 24,
    lembreteAtivo: semente.lembreteAtivo ?? true,
    areasDecididas: [...(semente.areasDecididas ?? [])],
    lembretes: { ...(semente.lembretes ?? {}) },
    lembretesVencidos: [...(semente.lembretesVencidos ?? [])],
    proximosHorarios: semente.proximosHorarios,
    onboarding: { ...(semente.onboarding ?? {}) },
    solicitacoesDeLink: (semente.solicitacoesDeLink ?? []).map((s) => ({
      ...s,
      barbearia: { ...s.barbearia },
    })),
    slugsEmUso: [...(semente.slugsEmUso ?? [])],
    notificacoes: (semente.notificacoes ?? []).map((n) => ({ ...n })),
    avisosPublicados: (semente.avisosPublicados ?? []).map((a) => ({ ...a })),
    assinatura: { ...(semente.assinatura ?? ASSINATURA_PADRAO) },
    faturas: (semente.faturas ?? []).map((f) => ({ ...f })),
    pagamentos: (semente.pagamentos ?? []).map(copiaDoPagamento),
    diasFechados: [...(semente.diasFechados ?? [])],
    divisao: {
      parteDaCasa: { ...(semente.divisao?.parteDaCasa ?? {}) },
      matriz: [...(semente.divisao?.matriz ?? [])],
    },
    donosDosClientes: { ...(semente.donosDosClientes ?? {}) },
    planos: (semente.planos ?? []).map(copiaDoPlano),
    vitrineDePlanos: semente.vitrineDePlanos ?? false,
    assinaturas: (semente.assinaturas ?? []).map(copiaDaAssinatura),
    mensalidades: (semente.mensalidades ?? []).map(copiaDaMensalidade),
    contasOnline: Object.fromEntries(Object.entries(semente.contasOnline ?? {}).map(([qual, conta]) => [qual, { ...conta }])),
    modoAceito: semente.modoAceito ?? "teste",
    cpfDoCliente: semente.cpfDoCliente ?? null,
    usosNoCiclo: { ...(semente.usosNoCiclo ?? {}) },
  };

  // O pedido como o dono o vê: sem a barbearia, que é a dele.
  function semBarbearia({ barbearia: _barbearia, ...solicitacao }: SolicitacaoNaFila): SolicitacaoDeLink {
    return solicitacao;
  }

  function daMinhaBarbearia(s: SolicitacaoNaFila): boolean {
    return s.barbearia.id === estado.perfil.id;
  }

  // A mais recente; no empate, a última que entrou.
  function meuPedidoMaisRecente(): SolicitacaoNaFila | null {
    return estado.solicitacoesDeLink!.filter(daMinhaBarbearia).reduce<SolicitacaoNaFila | null>(
      (maisRecente, s) => (!maisRecente || s.criadoEm >= maisRecente.criadoEm ? s : maisRecente),
      null
    );
  }

  // As mesmas respostas do `pedidoPendente` da API.
  function pedidoPendente(id: string): SolicitacaoNaFila {
    const pedido = estado.solicitacoesDeLink!.find((s) => s.id === id);
    if (!pedido) throw new ErroDaApi(404, "nao_encontrado", "pedido não encontrado");
    if (pedido.status !== "pendente") {
      throw new ErroDaApi(422, "solicitacao_decidida", "esse pedido já foi decidido");
    }
    return pedido;
  }

  function exigirSlugLivre(slug: string): void {
    if (estado.slugsEmUso!.includes(slug)) {
      throw new ErroDaApi(409, "conflito", "esse endereço já está em uso");
    }
  }

  let pedidosCriados = 0;

  // A mesma ordem da API (routers/onboarding.ts).
  function trilha(): EstadoDoOnboarding {
    const ordem: PassoDoOnboarding[] = ["horarios", "servicos", "equipe", "link", "primeira_reserva"];
    const passos = ordem.map((id) => ({ id, feito: estado.onboarding![id] === true }));
    return { passos, completo: passos.every((passo) => passo.feito) };
  }

  function exigirDono() {
    if (estado.papel !== "dono") {
      throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite isto");
    }
  }

  // A recusa do PUT das ordens (apps/api/src/lib/ordem.ts): a lista tem
  // de ser exatamente a da barbearia, nem um a mais nem um a menos.
  function naOrdem<T extends { id: string }>(itens: T[], ids: string[], oQue: string): T[] {
    const porId = new Map(itens.map((item) => [item.id, item]));
    if (ids.length !== itens.length || new Set(ids).size !== ids.length || ids.some((id) => !porId.has(id))) {
      throw new ErroDaApi(400, "requisicao_invalida", `a lista precisa ter todos os ${oQue} da barbearia`);
    }
    return ids.map((id) => porId.get(id)!);
  }

  // A pausa do dia com as recusas do PUT da API (routers/equipe.ts).
  function pausaDoDia(dia: DiaDaJornada): { pausaInicio: string | null; pausaFim: string | null } {
    const { pausaInicio, pausaFim } = dia;
    if (dia.modo === "folga" || (!pausaInicio && !pausaFim)) return { pausaInicio: null, pausaFim: null };
    if (!pausaInicio || !pausaFim) {
      throw new ErroDaApi(422, "pausa_incompleta", "a pausa precisa de começo e fim");
    }
    if (pausaInicio >= pausaFim) {
      throw new ErroDaApi(422, "pausa_invalida", "a pausa precisa começar antes de terminar");
    }
    return { pausaInicio, pausaFim };
  }

  // O que o trigger da API dá a todo membro, criado na primeira leitura.
  function jornadaDe(id: string): DiaDaJornada[] {
    estado.jornadas![id] ??= [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia",
      horaInicio: null,
      horaFim: null,
      pausaInicio: null,
      pausaFim: null,
    }));
    return estado.jornadas![id];
  }

  function servicosDe(id: string): string[] {
    estado.servicosPorMembro![id] ??= estado.servicos.map((s) => s.id);
    return estado.servicosPorMembro![id];
  }

  // `!`: o estado acima sempre preenche a equipe.
  function equipe(): MembroDaEquipe[] {
    return estado.equipe!;
  }

  // A foto aparece na equipe e na página pública, como na API.
  function definirFoto(id: string, fotoUrl: string | null): void {
    estado.equipe = equipe().map((m) => (m.id === id ? { ...m, fotoUrl } : m));
    estado.perfil = {
      ...estado.perfil,
      barbeiros: estado.perfil.barbeiros.map((b) => (b.id === id ? { ...b, fotoUrl } : b)),
    };
  }

  function membroOu404(id: string): MembroDaEquipe {
    const achado = equipe().find((m) => m.id === id);
    if (!achado) throw new ErroDaApi(404, "nao_encontrado", "membro não encontrado");
    return achado;
  }

  // O perfil do logado sai da equipe, pra editar um refletir no outro.
  function perfilDoLogado() {
    const eu = membroOu404("bb1");
    return {
      id: eu.id,
      nome: eu.nome,
      email: eu.email,
      telefone: eu.telefone,
      barbeariaId: estado.perfil.id,
      papel: eu.papel,
      atende: eu.atende,
      fotoUrl: eu.fotoUrl,
    };
  }

  // A regra do PATCH /equipe/:id: só conta dono que consegue entrar —
  // ativo e sem convite pendente.
  function seriaOUltimoDono(alvo: MembroDaEquipe, edicao: EdicaoDoMembro): boolean {
    const tira =
      (edicao.papel !== undefined && edicao.papel !== "dono") || edicao.ativo === false;
    const contaComoDono = (m: MembroDaEquipe) =>
      m.papel === "dono" && m.ativo && !m.convitePendente;
    if (!tira || !contaComoDono(alvo)) return false;
    return !equipe().some((m) => m.id !== alvo.id && contaComoDono(m));
  }

  function exigirSlug(slug: string): void {
    // Mesmo 404 que o findUniqueOrThrow da API produz.
    if (slug !== estado.perfil.slug) {
      throw new ErroDaApi(404, "nao_encontrado", "barbearia não encontrada");
    }
  }

  // A mesma regra do `comUltimoAgendamento` da API: a MAIOR data entre
  // todos os agendamentos do cliente, sem janela de tempo nenhuma. A
  // janela das faixas mora em `naFaixa`, com o "hoje" da semente.
  function ultimoAgendamentoDe(clienteId: string): string | null {
    let maior: string | null = null;
    for (const agendamento of estado.agendamentos) {
      if (agendamento.clienteId !== clienteId) continue;
      // ISO compara como texto, então `>` basta pra ficar com a maior.
      if (!maior || agendamento.data > maior) maior = agendamento.data;
    }
    return maior;
  }

  // A regra de `ondeDaFaixa` na API, sobre o último agendamento: ter
  // algum de hoje − 30 em diante é o mesmo que o maior ser >= hoje − 30.
  function naFaixa(clienteId: string, faixa: FaixaDeCliente): boolean {
    if (faixa === "todos") return true;
    const ultimo = ultimoAgendamentoDe(clienteId);
    if (faixa === "recentes") return ultimo !== null && ultimo >= somarDias(estado.hoje, -30);
    return ultimo === null || ultimo < somarDias(estado.hoje, -90);
  }

  function duracaoDe(servicoIds: string[]): number {
    return servicoIds.reduce((total, id) => {
      const servico = estado.servicos.find((s) => s.id === id);
      return total + (servico?.duracaoMinutos ?? 0);
    }, 0);
  }

  function somarMinutos(hora: string, minutos: number): string {
    const [h, m] = hora.split(":").map(Number);
    const total = h * 60 + m + minutos;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
      total % 60
    ).padStart(2, "0")}`;
  }

  function novoAgendamento(entrada: {
    data: string;
    horaInicio: string;
    servicoIds: string[];
    origem: string;
    observacoes?: string;
    clienteId?: string;
    // Sem ele é "qualquer um": o dublê fica com o membro logado.
    barbeiroId?: string;
  }): AgendamentoSerializado & { clienteId?: string } {
    const barbeiroId = entrada.barbeiroId ?? "bb1";
    // A trava do banco não deixa dois ativos no mesmo horário; o dublê
    // reproduz isso porque a tela precisa saber tratar horario_ocupado
    // mesmo tendo acabado de ver o horário como livre.
    const conflito = estado.agendamentos.some(
      (a) =>
        a.barbeiro.id === barbeiroId &&
        a.data === entrada.data &&
        a.horaInicio === entrada.horaInicio &&
        a.status !== "cancelado"
    );
    if (conflito) {
      throw new ErroDaApi(
        409,
        "horario_ocupado",
        "esse horário já está ocupado"
      );
    }

    const agendamento: AgendamentoSerializado & { clienteId?: string } = {
      id: `a${estado.agendamentos.length + 1}`,
      data: entrada.data,
      horaInicio: entrada.horaInicio,
      horaFim: somarMinutos(entrada.horaInicio, duracaoDe(entrada.servicoIds)),
      status: "pendente",
      origem: entrada.origem,
      observacoes: entrada.observacoes ?? null,
      presencaConfirmadaEm: null,
      clienteId: entrada.clienteId,
      barbeiro: {
        id: barbeiroId,
        nome: estado.equipe?.find((m) => m.id === barbeiroId)?.nome ?? "Rafael",
      },
      servicos: entrada.servicoIds.map((servicoId) => {
        const servico = estado.servicos.find((s) => s.id === servicoId);
        return {
          servicoId,
          nome: servico?.nome ?? "Serviço",
          precoNoMomento: servico?.preco ?? "0.00",
          duracaoNoMomento: servico?.duracaoMinutos ?? 0,
        };
      }),
    };

    estado.agendamentos.push(agendamento);
    return agendamento;
  }

  function comCliente(
    agendamento: AgendamentoSerializado & { clienteId?: string }
  ): AgendamentoComCliente {
    const dono =
      estado.clientes.find((c) => c.id === agendamento.clienteId) ??
      estado.cliente;
    return { ...agendamento, cliente: dono };
  }

  // Ajudantes que dois métodos chamam ficam aqui fora, e não como
  // `this.algo` dentro do objeto: o `this` de um método arrancado do
  // objeto (`const { cancelar } = falso.cliente`) chegaria undefined.
  function editarServico(
    id: string,
    edicao: EdicaoDoServico
  ): ServicoSerializado {
    const indice = estado.servicos.findIndex((s) => s.id === id);
    if (indice < 0) {
      throw new ErroDaApi(404, "nao_encontrado", "serviço não encontrado");
    }
    const { categoria, descricao, ...resto } = edicao;
    estado.servicos[indice] = {
      ...estado.servicos[indice],
      ...resto,
      ...(categoria !== undefined ? { categoria: categoriaValida(categoria) } : {}),
      ...(descricao !== undefined ? { descricao: limparTextoOpcional(descricao) } : {}),
    };
    return estado.servicos[indice];
  }

  // A foto não passa pelo PATCH, como na API: tem rota própria.
  function definirFotoDoServico(id: string, fotoUrl: string | null): void {
    const indice = estado.servicos.findIndex((s) => s.id === id);
    if (indice < 0) {
      throw new ErroDaApi(404, "nao_encontrado", "serviço não encontrado");
    }
    estado.servicos[indice] = { ...estado.servicos[indice]!, fotoUrl };
  }

  // Nome sem acento e sem caixa; telefone dígito a dígito. É o que a
  // busca de clientes da API faz em SQL cru com regexp_replace.
  function combina(cliente: ClienteSerializado, busca: string): boolean {
    const alvo = busca.trim();
    if (!alvo) return true;

    const semAcento = (texto: string) =>
      texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    if (semAcento(cliente.nome).includes(semAcento(alvo))) return true;

    const digitos = alvo.replace(/\D/g, "");
    return (
      digitos.length > 0 &&
      cliente.telefone.replace(/\D/g, "").includes(digitos)
    );
  }

  function cancelarAgendamento(id: string): AgendamentoSerializado {
    const indice = estado.agendamentos.findIndex((a) => a.id === id);
    if (indice < 0) {
      throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
    }
    estado.agendamentos[indice] = {
      ...estado.agendamentos[indice],
      status: "cancelado",
    };
    return estado.agendamentos[indice];
  }

  // A barbearia como o painel a lê: com a antecedência do lembrete, que a
  // página pública não mostra.
  function barbeariaDoPainel(): BarbeariaDoPainel {
    const { horarios: _horarios, barbeiros: _barbeiros, ...barbearia } = estado.perfil;
    return {
      ...barbearia,
      lembreteAntecedenciaHoras: estado.lembreteAntecedenciaHoras ?? 24,
      lembreteAtivo: estado.lembreteAtivo ?? true,
      areasDecididas: [...(estado.areasDecididas ?? [])],
      aparenciaRascunho: estado.aparenciaRascunho ?? null,
    };
  }

  // Mesma regra da API (@barchop/formato/areas): marca no salvar, sem
  // repetir, na ordem do índice.
  function decidir(novas: AreaDeConfiguracao[]): void {
    estado.areasDecididas = juntarAreas(estado.areasDecididas ?? [], novas);
  }

  // As recusas do schema da API pra página rica: 400, como lá.
  function exigirPaginaValida(edicao: EdicaoDaBarbearia): void {
    const invalida = (mensagem: string) => new ErroDaApi(400, "requisicao_invalida", mensagem);
    if (edicao.instagram && !new RegExp(PADRAO_INSTAGRAM).test(edicao.instagram)) {
      throw invalida("instagram é o @ sem o @, não uma URL");
    }
    for (const [lista, permitidos] of [
      [edicao.comodidades, COMODIDADES],
      [edicao.formasDePagamento, FORMAS_DE_PAGAMENTO],
    ] as const) {
      if (!lista) continue;
      if (new Set(lista).size !== lista.length) throw invalida("item repetido");
      if (lista.some((item) => !(permitidos as readonly string[]).includes(item))) {
        throw invalida("item fora da lista");
      }
    }
  }

  // As mesmas respostas da API pro token do link do lembrete.
  function indiceDoLembrete(token: string): number {
    if (estado.lembretesVencidos!.includes(token)) {
      throw new ErroDaApi(410, "link_expirado", "esse link venceu: o horário já começou");
    }
    const id = estado.lembretes![token];
    if (!id) throw new ErroDaApi(401, "link_invalido", "link inválido");
    const indice = estado.agendamentos.findIndex((a) => a.id === id);
    if (indice < 0) throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
    return indice;
  }

  function doLembrete(agendamento: AgendamentoSerializado): AgendamentoDoLembrete {
    return {
      id: agendamento.id,
      data: agendamento.data,
      horaInicio: agendamento.horaInicio,
      status: agendamento.status,
      presencaConfirmadaEm: agendamento.presencaConfirmadaEm,
      barbearia: {
        nome: estado.perfil.nome,
        slug: estado.perfil.slug,
        prazoCancelarHoras: estado.perfil.prazoCancelarHoras,
        whatsapp: estado.perfil.whatsapp,
        telefone: estado.perfil.telefone,
      },
      barbeiro: { nome: agendamento.barbeiro.nome },
      servicos: agendamento.servicos.map((s) => ({ nome: s.nome })),
    };
  }

  // As recusas da API pro upload: tipo pelos bytes (422) e teto (413).
  async function exigirImagem(arquivo: Blob, limite: number): Promise<void> {
    if (arquivo.size > limite) {
      throw new ErroDaApi(413, "arquivo_grande_demais", "a imagem é grande demais");
    }
    const b = new Uint8Array(await arquivo.slice(0, 12).arrayBuffer());
    const ascii = (i: number, j: number) => String.fromCharCode(...b.slice(i, j));
    const png = b[0] === 0x89 && ascii(1, 4) === "PNG";
    const jpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const webp = ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    if (!png && !jpeg && !webp) {
      throw new ErroDaApi(422, "tipo_de_imagem_invalido", "só png, jpeg ou webp");
    }
  }
  let imagensEnviadas = 0;
  const urlFalsa = (tipo: string) => `https://imagens.falsas/${tipo}-${++imagensEnviadas}.png`;

  // O garantirAlteravel da API, sem o relógio: o dublê não sabe que
  // horas são.
  // O caixa, como na API: plano sem o recurso é 403; dia fechado não
  // aceita mudança de pagamento.
  function exigirCaixa(): void {
    if (!temRecurso(estado.assinatura!.planoEfetivo, "caixa")) {
      throw new ErroDaApi(403, "recurso_do_plano", "o plano não tem este recurso: escolha um plano");
    }
  }

  function exigirPlanosDaBarbearia(): void {
    if (!temRecurso(estado.assinatura!.planoEfetivo, "planosDaBarbearia")) {
      throw new ErroDaApi(403, "recurso_do_plano", "o plano não tem este recurso: escolha um plano");
    }
  }

  function vendePlanos(membro: MembroDaEquipe): boolean {
    return membro.papel === "dono" || (membro.papel === "profissional" && membro.podeVenderPlanos);
  }

  // A conta de quem vende (routers/pagamentos-online.ts): a da casa é
  // do dono; a recepção não tem conta.
  function chaveDaConta(daCasa: boolean): string {
    if (estado.papel === "recepcao") {
      throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite isto");
    }
    if (daCasa && estado.papel !== "dono") {
      throw new ErroDaApi(403, "sem_permissao", "só o dono conecta a conta da casa");
    }
    return daCasa ? "casa" : "bb1";
  }

  function pagamentosOnlineFalsos(daCasa: boolean): PagamentosOnline {
    const conta = estado.contasOnline![daCasa ? "casa" : "bb1"];
    return { daCasa, modoAceito: estado.modoAceito!, conta: conta ? { ...conta } : null };
  }

  // A vitrine como a API a monta (GET /barbearias/:slug/planos): vitrine
  // ligada e no Completo; plano ativo, de quem atende e pode vender, com
  // serviço ativo; online só com a conta de quem vende ligada e do modo
  // aceito. Sem ela, o plano fica, com o online indisponível.
  function vitrineFalsa(): PlanoDaVitrine[] {
    if (!estado.vitrineDePlanos || !temRecurso(estado.assinatura!.planoEfetivo, "planosDaBarbearia")) return [];
    const ativos = new Set(estado.servicos.filter((s) => s.ativo).map((s) => s.id));
    return estado.planos!.flatMap((plano) => {
      if (!plano.ativo) return [];
      const vendedor = plano.vendedor ? equipe().find((m) => m.id === plano.vendedor!.id) : null;
      if (plano.vendedor && !(vendedor && vendedor.ativo && vendedor.atende && vendePlanos(vendedor))) return [];
      const servicos = plano.servicos.filter((s) => ativos.has(s.servicoId)).map((s) => ({ ...s }));
      const aceitaOnline = plano.aceitaOnline && recebeOnline(plano);
      const provedor = aceitaOnline ? estado.contasOnline![plano.vendedor ? plano.vendedor.id : "casa"]!.provedor : null;
      if (servicos.length === 0) return [];
      return [
        {
          id: plano.id,
          daCasa: plano.daCasa,
          vendedor: vendedor ? { id: vendedor.id, nome: vendedor.nome, fotoUrl: vendedor.fotoUrl } : null,
          nome: plano.nome,
          descricao: plano.descricao,
          ciclo: plano.ciclo,
          precoCentavos: plano.precoCentavos,
          diasDeTeste: plano.diasDeTeste,
          aceitaOnline,
          onlineIndisponivel: plano.aceitaOnline && !aceitaOnline,
          // O Asaas pede o CPF; a Stripe não.
          pagamento: provedor ? { provedor, pedeCpf: provedor === "asaas" } : null,
          aceitaNoBalcao: plano.aceitaNoBalcao,
          servicos,
        },
      ];
    });
  }

  // A conta de quem vende ligada e do modo aceito (contasQueRecebem).
  function recebeOnline(plano: PlanoDoPainel): boolean {
    const conta = estado.contasOnline![plano.vendedor ? plano.vendedor.id : "casa"];
    return conta !== undefined && conta.modo === estado.modoAceito;
  }

  // O plano como o painel recebe: o aviso do online calculado na hora,
  // como a API faz (a semente não precisa acertar o campo).
  function doPainel(plano: PlanoDoPainel): PlanoDoPainel {
    return { ...copiaDoPlano(plano), onlineIndisponivel: plano.aceitaOnline && !recebeOnline(plano) };
  }

  // A assinatura como o cliente a vê (GET /clientes/me/assinaturas).
  function naConta(assinatura: AssinaturaDoPainel): AssinaturaNaConta {
    const { cliente: _cliente, linkDoCiclo, ...resto } = copiaDaAssinatura(assinatura);
    const plano = estado.planos!.find((p) => p.id === assinatura.plano.id);
    const ativos = new Set(estado.servicos.filter((s) => s.ativo).map((s) => s.id));
    return {
      ...resto,
      linkParaPagar: linkDoCiclo?.url ?? null,
      servicos: (plano?.servicos ?? [])
        .filter((s) => ativos.has(s.servicoId))
        .map((s) => ({
          ...s,
          usosRestantes: usosRestantes(s.usosPorCiclo, estado.usosNoCiclo![`${assinatura.id}:${s.servicoId}`] ?? 0),
        })),
    };
  }

  // Um link de exemplo, nunca um de verdade: o código da fatura mostra
  // os dados de quem vende.
  // O link da fatura no provedor da conta de quem vende o plano.
  const faturaFalsa = (assinaturaId: string, provedor: ProvedorDePagamento) =>
    provedor === "stripe"
      ? `https://invoice.stripe.com/i/exemplo-${assinaturaId}`
      : provedor === "infinitepay"
        ? `https://checkout.infinitepay.io/exemplo/${assinaturaId}`
        : `https://sandbox.asaas.com/i/exemplo-${assinaturaId}`;
  const provedorDoPlano = (planoId: string): ProvedorDePagamento => {
    const plano = estado.planos!.find((p) => p.id === planoId);
    const conta = plano && estado.contasOnline![plano.vendedor ? plano.vendedor.id : "casa"];
    return conta?.provedor ?? "asaas";
  };

  function minhaAssinaturaOu404(id: string): AssinaturaDoPainel {
    const assinatura = estado.assinaturas!.find((a) => a.id === id && a.cliente.id === estado.cliente.id);
    if (!assinatura) throw new ErroDaApi(404, "nao_encontrado", "recurso não encontrado");
    return assinatura;
  }

  // O profissional só enxerga os dele; dono e recepção, todos.
  function planosVisiveis(): PlanoDoPainel[] {
    return estado.papel === "profissional"
      ? estado.planos!.filter((p) => p.vendedor?.id === "bb1")
      : estado.planos!;
  }

  function servicosDoPlano(servicos: NovoPlano["servicos"]): PlanoDoPainel["servicos"] {
    const ids = servicos.map((s) => s.servicoId);
    if (new Set(ids).size !== ids.length) {
      throw new ErroDaApi(422, "servico_repetido", "o mesmo serviço aparece duas vezes no plano");
    }
    return servicos.map((s) => {
      const servico = estado.servicos.find((x) => x.id === s.servicoId && x.ativo);
      if (!servico) throw new ErroDaApi(422, "servico_invalido", "o plano só cobre serviços ativos desta barbearia");
      return { servicoId: s.servicoId, nome: servico.nome, usosPorCiclo: s.usosPorCiclo };
    });
  }

  // As assinaturas seguem a regra dos planos: o profissional, só as dos
  // dele (a de outro é 404).
  function assinaturasVisiveis(): AssinaturaDoPainel[] {
    return estado.papel === "profissional"
      ? estado.assinaturas!.filter((a) => a.plano.vendedor?.id === "bb1")
      : estado.assinaturas!;
  }

  function assinaturaOu404(id: string): AssinaturaDoPainel {
    const achada = assinaturasVisiveis().find((a) => a.id === id);
    if (!achada) throw new ErroDaApi(404, "nao_encontrado", "recurso não encontrado");
    return achada;
  }

  // O marcarAtrasadas da API, na leitura: no balcão, passou do dia da
  // renovação sem "recebi".
  function marcarAtrasadas(): void {
    for (const a of estado.assinaturas!) {
      const emCiclo = a.situacao === "ativa" || a.situacao === "teste";
      if (a.forma === "no_balcao" && emCiclo && a.cicloTerminaEm !== null && cicloEmAtraso(a.cicloTerminaEm, estado.hoje)) {
        a.situacao = "em_atraso";
      }
    }
  }

  // O "assinantes" do plano, que a lista de planos mostra.
  function contarAssinante(planoId: string, quanto: 1 | -1): void {
    const plano = estado.planos!.find((p) => p.id === planoId);
    if (plano) plano.assinantes = Math.max(0, plano.assinantes + quanto);
  }

  function proximoDiaAberto(desde: string): string {
    let dia = desde;
    while (estado.diasFechados!.includes(dia)) dia = somarDias(dia, 1);
    return dia;
  }
  let recebimentos = 0;

  // O dia cai no ciclo pago: de `cicloComecaEm` até a véspera da
  // renovação (diaNoCiclo, em lib/planos-do-cliente.ts).
  function noCicloDe(ciclo: { cicloComecaEm: string | null; cicloTerminaEm: string | null }, dia: string): boolean {
    return (
      ciclo.cicloComecaEm !== null && ciclo.cicloTerminaEm !== null && ciclo.cicloComecaEm <= dia && dia < ciclo.cicloTerminaEm
    );
  }

  // Os usos de uma assinatura no ciclo, por serviço, contados nos
  // pagamentos pelo plano; `menos` = o pagamento que está sendo refeito.
  function usosNoCiclo(assinatura: AssinaturaDoPainel, menos: string | null): Map<string, number> {
    const usados = new Map<string, number>();
    for (const pagamento of estado.pagamentos!) {
      if (pagamento.assinatura?.id !== assinatura.id || pagamento.id === menos || !noCicloDe(assinatura, pagamento.data)) {
        continue;
      }
      for (const servico of pagamento.servicosPeloPlano) usados.set(servico.id, (usados.get(servico.id) ?? 0) + 1);
    }
    return usados;
  }

  // O conferirOPlano da API: a assinatura vale no dia, é do cliente, e o
  // plano de barbeiro só com quem vende. Cada linha que o plano tem gasta
  // um uso, até os do ciclo.
  function conferirOPlano(
    assinatura: AssinaturaDoPainel,
    agendamento: { data: string; barbeiro: { id: string }; servicos: { servicoId: string; nome: string }[] },
    clienteId: string,
    pagamentoId: string | null
  ): { id: string; nome: string }[] {
    if (assinatura.cliente.id !== clienteId) {
      throw new ErroDaApi(422, "assinatura_de_outro_cliente", "esta assinatura é de outro cliente");
    }
    if (!assinanteUsaOPlano(assinatura.situacao)) {
      throw new ErroDaApi(422, "assinatura_inativa", "esta assinatura não está valendo: pendente, em atraso ou cancelada");
    }
    if (!noCicloDe(assinatura, agendamento.data)) {
      throw new ErroDaApi(422, "fora_do_ciclo", "o dia do atendimento está fora do ciclo pago da assinatura");
    }
    const vendedor = assinatura.plano.vendedor?.id ?? null;
    if (vendedor !== null && vendedor !== agendamento.barbeiro.id) {
      throw new ErroDaApi(422, "plano_de_outro_barbeiro", "o plano de barbeiro só vale com quem vende");
    }
    const plano = estado.planos!.find((p) => p.id === assinatura.plano.id);
    const usados = usosNoCiclo(assinatura, pagamentoId);
    const cobertos: { id: string; nome: string }[] = [];
    let esgotou = false;
    for (const servico of agendamento.servicos) {
      const regra = plano?.servicos.find((s) => s.servicoId === servico.servicoId);
      if (!regra) continue;
      const ja = usados.get(servico.servicoId) ?? 0;
      if (usosRestantes(regra.usosPorCiclo, ja) === 0) {
        esgotou = true;
        continue;
      }
      cobertos.push({ id: servico.servicoId, nome: servico.nome });
      usados.set(servico.servicoId, ja + 1);
    }
    if (cobertos.length === 0) {
      throw esgotou
        ? new ErroDaApi(422, "usos_esgotados", "os usos do plano neste ciclo acabaram")
        : new ErroDaApi(422, "servico_fora_do_plano", "o plano não cobre nenhum serviço deste atendimento");
    }
    return cobertos;
  }

  // A mesma conta da API (problemaDoPlano), com o mesmo código.
  function exigirPlanoCerto(plano: PlanoDoPainel): void {
    const problema = problemaDoPlano(plano);
    if (problema !== null) throw new ErroDaApi(422, `plano_${problema}`, `o plano tem um problema: ${problema}`);
  }

  function exigirDiaAberto(data: string): void {
    if (estado.diasFechados!.includes(data)) {
      throw new ErroDaApi(409, "dia_fechado", "o caixa deste dia está fechado: o dono precisa reabrir");
    }
  }

  function agendamentoOu404(id: string) {
    const achado = estado.agendamentos.find((a) => a.id === id);
    if (!achado) throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
    return achado;
  }

  function apagarPagamento(agendamentoId: string): void {
    estado.pagamentos = estado.pagamentos!.filter((p) => p.agendamentoId !== agendamentoId);
  }

  function membroDoCaixa(id: string): MembroDoCaixa {
    return { id, nome: equipe().find((m) => m.id === id)?.nome ?? "" };
  }

  // A divisão como o GET /barbearias/me/divisao: os membros ativos que
  // atendem e a matriz entre eles, sem par em 0.
  function membrosDaDivisao() {
    return equipe().filter((m) => m.ativo && m.atende && m.papel !== "recepcao");
  }

  function divisaoFalsa(): DivisaoDoDinheiro {
    const membros = membrosDaDivisao();
    const ids = new Set(membros.map((m) => m.id));
    return {
      membros: membros.map((m) => ({ id: m.id, nome: m.nome, parteDaCasa: estado.divisao!.parteDaCasa[m.id] ?? 0 })),
      matriz: estado
        .divisao!.matriz.filter((r) => r.percentual > 0 && ids.has(r.donoDoCliente) && ids.has(r.atendente))
        .map((r) => ({ donoDoClienteId: r.donoDoCliente, atendenteId: r.atendente, percentual: r.percentual })),
    };
  }

  function exigirMembroDaDivisao(id: string): void {
    if (!membrosDaDivisao().some((m) => m.id === id)) {
      throw new ErroDaApi(422, "membro_invalido", "um dos membros não é um membro ativo que atende");
    }
  }

  // Quem fechou cada dia e quando. Dia fechado pela semente sem registro
  // aqui: fechado pelo dono, no fim do dia.
  const fechamentos = new Map<string, { fechadoEm: string; fechadoPor: MembroDoCaixa }>();

  // O GET /barbearias/me/caixa da API (lib/caixa.ts): a mesma conta do
  // acerto (acertoDoDia), recortada pro profissional logado. O dublê não
  // guarda a foto do fechamento: o dia fechado não muda, então a conta
  // de agora é a mesma.
  function caixaDoDiaFalso(data: string): CaixaDoDia {
    const somente = estado.papel === "profissional" ? "bb1" : undefined;
    const doDia = estado.agendamentos.filter((a) => a.data === data);
    const hora = (agendamentoId: string) => doDia.find((a) => a.id === agendamentoId)?.horaInicio ?? "";
    const todos = estado
      .pagamentos!.filter((p) => p.data === data)
      .sort((a, b) => hora(a.agendamentoId).localeCompare(hora(b.agendamentoId)));
    const todasAsMensalidades = estado.mensalidades!.filter((m) => m.data === data);
    // Como contarOAcerto: o fixo do plano da casa é a casa pagando quem
    // atendeu (recebido por ninguém), e a mensalidade divide com a parte
    // da casa congelada no "recebi".
    const acerto = acertoDoDia([
      ...todos.flatMap((p) => {
        const partes = p.partes.map((parte) => ({
          beneficiario: parte.beneficiario?.id ?? null,
          motivo: parte.motivo,
          valorCentavos: parte.valorCentavos,
        }));
        const doPlano = partes.filter((parte) => parte.motivo === "plano");
        return [
          { recebidoPor: p.recebidoPor.id, partes: partes.filter((parte) => parte.motivo !== "plano") },
          ...(doPlano.length > 0 ? [{ recebidoPor: null, partes: doPlano }] : []),
        ];
      }),
      ...todasAsMensalidades.map((m) => ({
        recebidoPor: m.recebidoPor?.id ?? null,
        partes: [
          {
            beneficiario: m.plano.vendedor?.id ?? null,
            motivo: "mensalidade" as const,
            valorCentavos: m.valorCentavos - m.casaCentavos,
          },
          { beneficiario: null, motivo: "casa" as const, valorCentavos: m.casaCentavos },
        ].filter((parte) => parte.valorCentavos > 0),
      })),
    ]);
    const entra = (p: PagamentoDoAgendamento) =>
      p.atendente.id === somente || p.recebidoPor.id === somente || p.partes.some((x) => x.beneficiario?.id === somente);
    const pagamentos = somente ? todos.filter(entra) : todos;
    const dele = (m: MensalidadeDoCaixa) => m.recebidoPor?.id === somente || m.plano.vendedor?.id === somente;
    const mensalidades = somente ? todasAsMensalidades.filter(dele) : todasAsMensalidades;
    // A mensalidade é dinheiro que entrou: entra nos totais, a online numa
    // linha à parte.
    const porForma = FORMAS_DA_MENSALIDADE.map((forma) => {
      const daForma = pagamentos.filter((p) => p.forma === forma);
      const mensalidadesDaForma = mensalidades.filter((m) => m.forma === forma);
      return {
        forma,
        quantidade: daForma.length + mensalidadesDaForma.length,
        valorCentavos:
          daForma.reduce((s, p) => s + p.totalCentavos, 0) + mensalidadesDaForma.reduce((s, m) => s + m.valorCentavos, 0),
      };
    });
    const pagos = new Set(todos.map((p) => p.agendamentoId));
    const pendencias = doDia
      .filter((a) => a.status === "pendente" || a.status === "confirmado" || (a.status === "concluido" && !pagos.has(a.id)))
      .filter((a) => !somente || a.barbeiro.id === somente)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
      .map((a) => {
        const { cliente } = comCliente(a);
        return {
          agendamentoId: a.id,
          horaInicio: a.horaInicio,
          status: a.status as PendenciaDoCaixa["status"],
          cliente: { id: cliente.id, nome: cliente.nome },
          barbeiro: { ...a.barbeiro },
        };
      });
    const dono = equipe().find((m) => m.papel === "dono")?.id ?? "bb1";
    return {
      data,
      fechamento: estado.diasFechados!.includes(data)
        ? (fechamentos.get(data) ?? { fechadoEm: `${data}T23:00:00.000Z`, fechadoPor: membroDoCaixa(dono) })
        : null,
      pagamentos: pagamentos.map((p) => {
        const agendamento = doDia.find((a) => a.id === p.agendamentoId);
        const cliente = agendamento ? comCliente(agendamento).cliente : estado.cliente;
        return { ...copiaDoPagamento(p), horaInicio: hora(p.agendamentoId), cliente: { id: cliente.id, nome: cliente.nome } };
      }),
      mensalidades: mensalidades.map(copiaDaMensalidade),
      totais: { totalCentavos: porForma.reduce((s, f) => s + f.valorCentavos, 0), porForma },
      acerto: {
        pessoas: acerto.pessoas
          .filter((l) => !somente || l.pessoa === somente)
          .map((l) => ({ ...l, pessoa: l.pessoa === null ? null : membroDoCaixa(l.pessoa) })),
        repasses: acerto.repasses
          .filter((r) => !somente || r.de === somente || r.para === somente)
          .map((r) => ({
            de: r.de === null ? null : membroDoCaixa(r.de),
            para: r.para === null ? null : membroDoCaixa(r.para),
            valorCentavos: r.valorCentavos,
          })),
      },
      pendencias,
    };
  }

  function exigirAtivo(agendamento: AgendamentoSerializado): void {
    if (agendamento.status !== "pendente" && agendamento.status !== "confirmado") {
      throw new ErroDaApi(
        422,
        "status_nao_permite",
        `agendamento ${agendamento.status} não pode ser alterado`
      );
    }
  }

  const sessaoDoBarbeiro = {
    token: "jwt-falso-barbeiro",
    barbeiro: { id: "bb1", nome: "Rafael", email: "rafael@gr.com" },
    barbearia: {
      id: estado.perfil.id,
      nome: estado.perfil.nome,
      slug: estado.perfil.slug,
    },
  };

  return {
    estado,

    publico: {
      // Os tipos vêm dos mesmos que o client real usa, e não de um
      // subconjunto escrito à mão: com um subconjunto, o objeto literal
      // do teste com `cliente` dentro viraria erro de propriedade
      // excedente, e afrouxar o tipo esconderia divergência de verdade.
      async perfilDaBarbearia(slug: string) {
        exigirSlug(slug);
        return estado.perfil;
      },
      async servicos(slug: string) {
        exigirSlug(slug);
        return estado.servicos.filter((servico) => servico.ativo);
      },
      async planos(slug: string) {
        exigirSlug(slug);
        return { planos: vitrineFalsa() };
      },
      // O filtro entra na assinatura mesmo sem ser usado: um dublê com
      // menos parâmetros que o client real deixa a tela chamar de um
      // jeito que só quebra contra a API de verdade.
      async disponibilidadeDoDia(slug: string, _filtro: FiltroDoDia, _opcoes?: OpcoesDaDisponibilidade) {
        exigirSlug(slug);
        return estado.horariosLivres;
      },
      async disponibilidadeDoMes(slug: string, _filtro: FiltroDoMes, _opcoes?: OpcoesDaDisponibilidade) {
        exigirSlug(slug);
        return estado.diasComVaga;
      },
      async agendar(slug: string, novo: NovoAgendamentoPublicoInput) {
        exigirSlug(slug);
        // O mesmo PADRAO_EMAIL da API, que responde 400 pelo schema.
        const email = novo.cliente.email;
        if (email !== undefined && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          throw new ErroDaApi(400, "requisicao_invalida", "e-mail inválido");
        }
        return novoAgendamento({ ...novo, origem: "cliente" });
      },
      async proximosHorarios(slug: string) {
        exigirSlug(slug);
        return (
          estado.proximosHorarios ??
          estado.servicos.filter((s) => s.ativo).map((s) => ({ servicoId: s.id, horarios: [] }))
        );
      },
      async lembrete(token: string) {
        return doLembrete(estado.agendamentos[indiceDoLembrete(token)]);
      },
      async confirmarPresenca(token: string) {
        const indice = indiceDoLembrete(token);
        const agendamento = estado.agendamentos[indice];
        exigirAtivo(agendamento);
        estado.agendamentos[indice] = {
          ...agendamento,
          presencaConfirmadaEm: agendamento.presencaConfirmadaEm ?? new Date().toISOString(),
        };
        return doLembrete(estado.agendamentos[indice]);
      },
      async cancelarPeloLembrete(token: string) {
        const indice = indiceDoLembrete(token);
        const agendamento = estado.agendamentos[indice];
        // Cancelar de novo é o mesmo cancelamento, como na API.
        if (agendamento.status !== "cancelado") {
          exigirAtivo(agendamento);
          estado.agendamentos[indice] = { ...agendamento, status: "cancelado" };
        }
        return doLembrete(estado.agendamentos[indice]);
      },
      async pedirCodigoDoCliente(slug: string, _destino: DestinoDoCodigo) {
        exigirSlug(slug);
      },
      // Recusa qualquer código que não seja o do dublê, com o mesmo erro
      // da API — é o que faz o ramo de "código inválido" das telas ser
      // testável.
      async definirSenhaDoCliente(slug: string, definicao: DefinicaoDeSenhaDoCliente) {
        exigirSlug(slug);
        if (definicao.codigo !== CODIGO_DO_CLIENTE_FALSO) {
          throw new ErroDaApi(422, "codigo_invalido", "código inválido ou vencido");
        }
        estado.cliente = {
          ...estado.cliente,
          nome: definicao.nome,
          temConta: true,
        };
        return { token: "jwt-falso-cliente", cliente: estado.cliente };
      },
      async loginCliente(slug: string, _credenciais: CredenciaisDoCliente) {
        exigirSlug(slug);
        return { token: "jwt-falso-cliente", cliente: estado.cliente };
      },
    },

    barbeiro: {
      async pedirCodigoDeCadastro(_email: string) {},
      async signup(nova: NovaBarbearia) {
        if (nova.codigo !== CODIGO_DO_CADASTRO_FALSO) {
          throw new ErroDaApi(422, "codigo_invalido", "código inválido ou vencido");
        }
        return {
          token: "jwt-falso-barbeiro",
          barbeiro: {
            id: "bb1",
            nome: nova.barbeiro.nome,
            email: nova.barbeiro.email,
          },
          barbearia: {
            id: estado.perfil.id,
            nome: nova.barbearia.nome,
            slug: nova.barbearia.slug,
          },
        };
      },
      async login() {
        return sessaoDoBarbeiro;
      },
      async pedirCodigo(_email: string) {},
      // Mesmo erro da API pra código errado — é o que deixa o ramo de
      // "código inválido" da tela testável.
      async redefinirSenha(redefinicao: RedefinicaoDeSenha) {
        if (redefinicao.codigo !== CODIGO_DO_BARBEIRO_FALSO) {
          throw new ErroDaApi(422, "codigo_invalido", "código inválido ou vencido");
        }
        return sessaoDoBarbeiro;
      },
      async meuPerfil() {
        return perfilDoLogado();
      },
      // Os mesmos filtros da API (GET /me/notificacoes).
      async notificacoes(filtro: "nao-lidas" | "todas" | "avisos") {
        return estado
          .notificacoes!.filter((n) =>
            filtro === "nao-lidas" ? !n.lida : filtro === "avisos" ? n.tipo === "plataforma" : true
          )
          .map((n) => ({ ...n }));
      },
      async contagemDeNotificacoes() {
        return estado.notificacoes!.filter((n) => !n.lida).length;
      },
      async marcarNotificacaoLida(id: string) {
        const achada = estado.notificacoes!.find((n) => n.id === id);
        if (!achada) throw new ErroDaApi(404, "nao_encontrado", "notificação não encontrada");
        achada.lida = true;
      },
      async lerTodasAsNotificacoes() {
        for (const n of estado.notificacoes!) n.lida = true;
      },
      // A Stripe não entra: o Checkout e o Portal devolvem um endereço
      // de mentira, e a situação só muda pela semente.
      async assinatura() {
        exigirDono();
        return { ...estado.assinatura!, foraDoLink: estado.assinatura!.foraDoLink.map((m) => ({ ...m })) };
      },
      async checkoutDaAssinatura(_pedido: PedidoDeAssinatura) {
        exigirDono();
        const { situacao } = estado.assinatura!;
        if (estado.assinatura!.temPortal && (situacao === "ativa" || situacao === "em_atraso")) {
          throw new ErroDaApi(409, "conflito", "a barbearia já tem assinatura: mude o plano em Gerenciar assinatura");
        }
        return { url: "https://checkout.stripe.test/1" };
      },
      async portalDaAssinatura() {
        exigirDono();
        if (!estado.assinatura!.temPortal) {
          throw new ErroDaApi(409, "conflito", "a barbearia ainda não assinou um plano");
        }
        return { url: "https://billing.stripe.test/1" };
      },
      async faturasDaAssinatura() {
        exigirDono();
        return estado.faturas!.map((f) => ({ ...f }));
      },
      async atualizarMeuPerfil(edicao: EdicaoDoPerfil) {
        Object.assign(membroOu404("bb1"), edicao);
        return perfilDoLogado();
      },
      async equipe() {
        return equipe().map((m) => ({ ...m }));
      },
      async salvarOrdemDaEquipe(ids: string[]) {
        exigirDono();
        estado.equipe = naOrdem(equipe(), ids, "membros");
        return equipe().map((m) => ({ ...m }));
      },
      async jornada(id: string) {
        membroOu404(id);
        return jornadaDe(id).map((dia) => ({ ...dia }));
      },
      // As mesmas recusas do PUT da API; hora em dia que não é próprio
      // é descartada, como lá, e a pausa na folga também.
      async salvarJornada(id: string, jornada: DiaDaJornada[]) {
        membroOu404(id);
        const dias = jornada.map((dia) => {
          const pausa = pausaDoDia(dia);
          if (dia.modo !== "proprio") return { ...dia, horaInicio: null, horaFim: null, ...pausa };
          if (!dia.horaInicio || !dia.horaFim) {
            throw new ErroDaApi(422, "horario_incompleto", "dia próprio sem entrada e saída");
          }
          if (dia.horaInicio >= dia.horaFim) {
            throw new ErroDaApi(422, "intervalo_invalido", "a entrada precisa ser antes da saída");
          }
          return { ...dia, ...pausa };
        });
        estado.jornadas![id] = dias.sort((a, b) => a.diaSemana - b.diaSemana);
        return jornadaDe(id).map((dia) => ({ ...dia }));
      },
      async servicosDoMembro(id: string) {
        membroOu404(id);
        return [...servicosDe(id)];
      },
      async salvarServicosDoMembro(id: string, servicoIds: string[]) {
        membroOu404(id);
        if (servicoIds.some((sid) => !estado.servicos.some((s) => s.id === sid))) {
          throw new ErroDaApi(422, "servico_invalido", "serviço não encontrado nesta barbearia");
        }
        estado.servicosPorMembro![id] = [...new Set(servicoIds)];
        return [...servicosDe(id)];
      },
      // Os que tocam o período; o profissional só vê os dele, como na API.
      async bloqueios(de: string, ate: string) {
        return estado.bloqueios!
          .filter((b) => b.dataInicio <= ate && b.dataFim >= de)
          .filter((b) => estado.papel !== "profissional" || b.barbeiroId === "bb1")
          .map((b) => ({ ...b }));
      },
      async criarBloqueio(novo: NovoBloqueio) {
        if (estado.papel === "profissional" && novo.barbeiroId !== "bb1") {
          throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite isto");
        }
        if (novo.dataInicio > novo.dataFim) {
          throw new ErroDaApi(422, "periodo_invalido", "o fim do período vem antes do início");
        }
        if (Boolean(novo.horaInicio) !== Boolean(novo.horaFim)) {
          throw new ErroDaApi(422, "horario_incompleto", "informe o início e o fim do horário");
        }
        if (novo.horaInicio && novo.horaFim && novo.horaInicio >= novo.horaFim) {
          throw new ErroDaApi(422, "intervalo_invalido", "o início precisa ser antes do fim");
        }
        if (!equipe().some((m) => m.id === novo.barbeiroId)) {
          throw new ErroDaApi(422, "barbeiro_invalido", "membro não encontrado nesta barbearia");
        }
        const bloqueio: BloqueioSerializado = {
          id: `x${estado.bloqueios!.length + 1}`,
          barbeiroId: novo.barbeiroId,
          dataInicio: novo.dataInicio,
          dataFim: novo.dataFim,
          horaInicio: novo.horaInicio ?? null,
          horaFim: novo.horaFim ?? null,
          motivo: novo.motivo?.trim() || null,
        };
        estado.bloqueios!.push(bloqueio);
        return { ...bloqueio };
      },
      async apagarBloqueio(id: string) {
        const indice = estado.bloqueios!.findIndex(
          (b) => b.id === id && (estado.papel !== "profissional" || b.barbeiroId === "bb1")
        );
        if (indice < 0) throw new ErroDaApi(404, "nao_encontrado", "bloqueio não encontrado");
        estado.bloqueios!.splice(indice, 1);
      },
      async convidarMembro(novo: NovoMembro) {
        const email = novo.email.trim().toLowerCase();
        if (equipe().some((m) => m.email === email)) {
          throw new ErroDaApi(409, "email_em_uso", "esse e-mail já tem conta no BarChop");
        }
        const membro: MembroDaEquipe = {
          id: `m${equipe().length + 1}`,
          nome: novo.nome,
          email,
          telefone: novo.telefone ?? null,
          papel: novo.papel,
          atende: novo.atende ?? novo.papel !== "recepcao",
          ativo: true,
          fotoUrl: null,
          convitePendente: true,
          podeVenderPlanos: false,
        };
        equipe().push(membro);
        return { ...membro };
      },
      async atualizarMembro(id: string, { cancelarAssinaturas, ...edicao }: EdicaoDoMembro) {
        const alvo = membroOu404(id);
        if (seriaOUltimoDono(alvo, edicao)) {
          throw new ErroDaApi(
            422,
            "ultimo_dono",
            "a barbearia precisa de pelo menos um dono ativo"
          );
        }
        // Como a API: quem sai com assinante nos planos que vende precisa
        // da confirmação, e com ela as assinaturas caem.
        if (edicao.ativo === false) {
          const dele = estado.planos!.filter((p) => p.vendedor?.id === id);
          const quantas = dele.reduce((soma, p) => soma + p.assinantes, 0);
          if (quantas > 0 && cancelarAssinaturas !== true) {
            throw new ErroDaApi(
              422,
              "assinaturas_ativas",
              quantas === 1
                ? "este membro tem 1 assinante nos planos que vende: cancele a assinatura para desativar"
                : `este membro tem ${quantas} assinantes nos planos que vende: cancele as assinaturas para desativar`
            );
          }
          for (const plano of dele) plano.assinantes = 0;
          for (const assinatura of estado.assinaturas!) {
            if (assinatura.plano.vendedor?.id === id && assinatura.situacao !== "cancelada") {
              assinatura.situacao = "cancelada";
              assinatura.canceladaEm = new Date().toISOString();
            }
          }
        }
        Object.assign(alvo, edicao);
        return { ...alvo };
      },
      async reenviarConvite(id: string) {
        const alvo = membroOu404(id);
        if (!alvo.ativo) throw new ErroDaApi(404, "nao_encontrado", "membro não encontrado");
        if (!alvo.convitePendente) {
          throw new ErroDaApi(422, "convite_desnecessario", "esse membro já aceitou o convite");
        }
      },
      // Toda falha com o mesmo erro, como a API: código errado, e-mail
      // sem convite, membro desativado ou que já tem senha.
      async aceitarConvite(aceite: AceiteDoConvite) {
        const email = aceite.email.trim().toLowerCase();
        const alvo = equipe().find((m) => m.email === email);
        if (
          aceite.codigo !== CODIGO_DO_CONVITE_FALSO ||
          !alvo?.ativo ||
          !alvo.convitePendente
        ) {
          throw new ErroDaApi(422, "codigo_invalido", "código inválido ou vencido");
        }
        alvo.convitePendente = false;
        return {
          token: "jwt-falso-convidado",
          barbeiro: { id: alvo.id, nome: alvo.nome, email: alvo.email },
          barbearia: sessaoDoBarbeiro.barbearia,
        };
      },
      async minhaBarbearia() {
        return barbeariaDoPainel();
      },
      async solicitacaoDeLink() {
        exigirDono();
        const pedido = meuPedidoMaisRecente();
        return pedido ? semBarbearia(pedido) : null;
      },
      // As recusas da API, na mesma ordem: reservado, igual ao atual,
      // pendente, de outra barbearia.
      async pedirTrocaDeLink(slug: string, motivo?: string) {
        exigirDono();
        if (slugReservado(slug)) {
          throw new ErroDaApi(422, "slug_reservado", "esse endereço é reservado pelo sistema");
        }
        if (slug === estado.perfil.slug) {
          throw new ErroDaApi(422, "slug_igual_ao_atual", "esse já é o link da barbearia");
        }
        if (estado.solicitacoesDeLink!.some((s) => daMinhaBarbearia(s) && s.status === "pendente")) {
          throw new ErroDaApi(409, "solicitacao_pendente", "já existe um pedido aguardando o suporte");
        }
        exigirSlugLivre(slug);
        const pedido: SolicitacaoNaFila = {
          id: `pedido-${++pedidosCriados}`,
          slugPedido: slug,
          motivo: motivo?.trim() || null,
          status: "pendente",
          resposta: null,
          criadoEm: new Date().toISOString(),
          decididoEm: null,
          barbearia: { id: estado.perfil.id, nome: estado.perfil.nome, slug: estado.perfil.slug },
        };
        estado.solicitacoesDeLink!.push(pedido);
        return semBarbearia(pedido);
      },
      async cancelarPedidoDeLink() {
        exigirDono();
        const pendente = estado.solicitacoesDeLink!.find(
          (s) => daMinhaBarbearia(s) && s.status === "pendente"
        );
        if (!pendente) {
          throw new ErroDaApi(404, "nao_encontrado", "nenhum pedido aguardando o suporte");
        }
        Object.assign(pendente, { status: "cancelada", decididoEm: new Date().toISOString() });
        return semBarbearia(pendente);
      },
      async atualizarMinhaBarbearia(edicao: EdicaoDaBarbearia) {
        exigirPaginaValida(edicao);
        const { lembreteAntecedenciaHoras, lembreteAtivo, ...doPerfil } = edicao;
        if (lembreteAtivo !== undefined) estado.lembreteAtivo = lembreteAtivo;
        if (lembreteAntecedenciaHoras !== undefined) {
          // O enum do schema da API: fora dele é 400.
          if (![2, 12, 24].includes(lembreteAntecedenciaHoras)) {
            throw new ErroDaApi(400, "requisicao_invalida", "antecedência fora de 2, 12 ou 24 h");
          }
          estado.lembreteAntecedenciaHoras = lembreteAntecedenciaHoras;
        }
        estado.perfil = { ...estado.perfil, ...doPerfil };
        // Como a API: sem arquivo não há moldura.
        if (!estado.perfil.logoUrl) estado.perfil = { ...estado.perfil, logoFormato: null };
        decidir(areasTocadas(edicao));
        return barbeariaDoPainel();
      },
      async horarios() {
        return estado.perfil.horarios;
      },
      async salvarHorarios(horarios: HorarioSerializado[]) {
        estado.perfil = { ...estado.perfil, horarios };
        decidir(["horarios"]);
        return horarios;
      },
      async excecoesDeHorario() {
        return estado.excecoesDeHorario!.map((excecao) => ({ ...excecao }));
      },
      // As recusas do PUT da API (routers/horarios.ts), menos a de data
      // passada: o dublê não tem relógio. Sem agendamentos ligados ao
      // horário, `foraDoHorario` sai sempre 0.
      async salvarExcecaoDeHorario(data: string, edicao: EdicaoDeExcecao) {
        exigirDono();
        const { fechado, horaAbertura, horaFechamento } = edicao;
        if (!fechado && (!horaAbertura || !horaFechamento)) {
          throw new ErroDaApi(422, "horario_incompleto", "a data está aberta sem hora de abertura e de fechamento");
        }
        if (!fechado && horaAbertura! >= horaFechamento!) {
          throw new ErroDaApi(422, "intervalo_invalido", "a abertura precisa ser antes do fechamento");
        }
        const excecao: ExcecaoDeHorario = {
          data,
          fechado,
          horaAbertura: fechado ? null : horaAbertura!,
          horaFechamento: fechado ? null : horaFechamento!,
          motivo: edicao.motivo?.trim() || null,
        };
        estado.excecoesDeHorario = [...estado.excecoesDeHorario!.filter((e) => e.data !== data), excecao].sort(
          (a, b) => a.data.localeCompare(b.data)
        );
        decidir(["horarios"]);
        return { excecao: { ...excecao }, foraDoHorario: 0 };
      },
      async apagarExcecaoDeHorario(data: string) {
        exigirDono();
        if (!estado.excecoesDeHorario!.some((e) => e.data === data)) {
          throw new ErroDaApi(404, "nao_encontrado", "não há exceção nessa data");
        }
        estado.excecoesDeHorario = estado.excecoesDeHorario!.filter((e) => e.data !== data);
      },
      async servicos() {
        return estado.servicos;
      },
      async salvarOrdemDosServicos(ids: string[]) {
        exigirDono();
        estado.servicos = naOrdem(estado.servicos, ids, "serviços");
        return estado.servicos;
      },
      async criarServico(novo: NovoServico) {
        const servico = {
          id: `s${estado.servicos.length + 1}`,
          ...novo,
          ativo: true,
          categoria: categoriaValida(novo.categoria),
          descricao: limparTextoOpcional(novo.descricao),
          fotoUrl: null,
        };
        estado.servicos.push(servico);
        return servico;
      },
      async atualizarServico(id: string, edicao: EdicaoDoServico) {
        return editarServico(id, edicao);
      },
      async desativarServico(id: string) {
        return editarServico(id, { ativo: false });
      },
      // Pagina como a API: mesma ordem (nome, e o id pra desempatar),
      // mesmo corte, mesmo `total` sobre o filtro — e não sobre a
      // carteira toda. Um dublê que devolvesse tudo de uma vez deixaria
      // a tela de "carregar mais" sem como ser testada, que é
      // exatamente o tipo de folga que faz o dublê aceitar o que a API
      // recusa.
      async clientes(busca?: string, cursor?: string, faixa: FaixaDeCliente = "todos") {
        const buscados = estado.clientes.filter((c) => combina(c, busca ?? ""));
        const contar = (qual: FaixaDeCliente) => buscados.filter((c) => naFaixa(c.id, qual)).length;
        const filtrados = buscados
          .filter((c) => naFaixa(c.id, faixa))
          .map((c) => ({ ...c, ultimoAgendamento: ultimoAgendamentoDe(c.id) }))
          .sort((a, b) => a.nome.localeCompare(b.nome) || a.id.localeCompare(b.id));

        const inicio = cursor
          ? filtrados.findIndex((c) => c.id === cursor) + 1
          : 0;
        const pagina = filtrados.slice(
          inicio,
          inicio + (estado.limiteDaPagina ?? 100)
        );
        const fim = inicio + pagina.length;

        return {
          clientes: pagina,
          total: filtrados.length,
          contagens: { todos: contar("todos"), recentes: contar("recentes"), sumidos: contar("sumidos") },
          proximoCursor: fim < filtrados.length ? pagina[pagina.length - 1].id : null,
        };
      },
      async criarCliente(novo: NovoCliente) {
        const repetido = estado.clientes.some(
          (c) => c.telefone.replace(/\D/g, "") === novo.telefone.replace(/\D/g, "")
        );
        if (repetido) {
          throw new ErroDaApi(409, "conflito", "esse telefone já tem cadastro");
        }
        const cliente: ClienteSerializado = {
          id: `c${estado.clientes.length + 1}`,
          nome: novo.nome,
          telefone: novo.telefone,
          email: novo.email ?? null,
          temConta: false,
        };
        estado.clientes.push(cliente);
        return cliente;
      },
      async cliente(id: string) {
        const achado = estado.clientes.find((c) => c.id === id);
        if (!achado) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        const dono = estado.donosDosClientes![id];
        return {
          ...achado,
          agendamentos: estado.agendamentos.filter((a) => a.clienteId === id),
          profissional: dono ? membroDoCaixa(dono) : null,
        };
      },
      async atualizarCliente(id: string, { profissionalId, ...edicao }: EdicaoDoCliente) {
        const indice = estado.clientes.findIndex((c) => c.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        // Como a API: trocar de quem o cliente é é só do dono, e vale um
        // membro ativo que atende.
        if (profissionalId !== undefined) {
          exigirDono();
          if (profissionalId === null) delete estado.donosDosClientes![id];
          else {
            exigirMembroDaDivisao(profissionalId);
            estado.donosDosClientes![id] = profissionalId;
          }
        }
        estado.clientes[indice] = { ...estado.clientes[indice], ...edicao };
        return estado.clientes[indice];
      },
      async agendamentosDoDia(data: string) {
        return estado.agendamentos
          .filter((a) => a.data === data)
          .map(comCliente);
      },
      // Sem jornada, pausa nem bloqueio — a conta é da API: o trabalho é
      // o horário da casa no dia, pra cada um que atende; o profissional
      // (bb1) vê só a dele, como na rota.
      async ocupacaoDoDia(data: string): Promise<OcupacaoDoDia> {
        const minutos = (hora: string) => {
          const [h, m] = hora.split(":").map(Number);
          return h * 60 + m;
        };
        const doDia = estado.perfil.horarios.find(
          (h) => h.diaSemana === new Date(`${data}T12:00:00Z`).getUTCDay()
        );
        const trabalho =
          !doDia || doDia.fechado || !doDia.horaAbertura || !doDia.horaFechamento
            ? 0
            : minutos(doDia.horaFechamento) - minutos(doDia.horaAbertura);
        // O expediente na regra da API (janelaEfetiva): data especial >
        // horário da casa, recortado pela jornada; pausa da jornada.
        const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
        const especial = estado.excecoesDeHorario!.find((e) => e.data === data);
        const casa = especial ?? doDia;
        const casaAberta =
          casa && !casa.fechado && casa.horaAbertura && casa.horaFechamento
            ? { abre: casa.horaAbertura, fecha: casa.horaFechamento }
            : null;
        const expedienteDe = (id: string) => {
          const dia = jornadaDe(id).find((j) => j.diaSemana === diaSemana);
          if (!casaAberta || dia?.modo === "folga") return { janela: null, pausa: null };
          let janela: { abre: string; fecha: string } | null = casaAberta;
          if (dia?.modo === "proprio" && dia.horaInicio && dia.horaFim) {
            const abre = dia.horaInicio > casaAberta.abre ? dia.horaInicio : casaAberta.abre;
            const fecha = dia.horaFim < casaAberta.fecha ? dia.horaFim : casaAberta.fecha;
            janela = abre < fecha ? { abre, fecha } : null;
          }
          const pausa =
            janela && dia?.pausaInicio && dia.pausaFim ? { inicio: dia.pausaInicio, fim: dia.pausaFim } : null;
          return { janela, pausa };
        };
        const profissionais = equipe()
          .filter((m) => m.atende && m.ativo && !m.convitePendente)
          .filter((m) => estado.papel !== "profissional" || m.id === "bb1")
          .map((m) => ({
            id: m.id,
            nome: m.nome,
            ...expedienteDe(m.id),
            minutosDeTrabalho: trabalho,
            minutosAgendados: estado.agendamentos
              .filter(
                (a) =>
                  a.data === data &&
                  a.barbeiro.id === m.id &&
                  ["pendente", "confirmado", "concluido"].includes(a.status)
              )
              .reduce((total, a) => total + minutos(a.horaFim) - minutos(a.horaInicio), 0),
          }));
        return {
          data,
          casa: {
            minutosDeTrabalho: profissionais.reduce((t, p) => t + p.minutosDeTrabalho, 0),
            minutosAgendados: profissionais.reduce((t, p) => t + p.minutosAgendados, 0),
          },
          profissionais,
        };
      },
      async agendamentosDoIntervalo(de: string, ate: string) {
        return estado.agendamentos
          .filter((a) => a.data >= de && a.data <= ate)
          .map(comCliente);
      },
      async agendamento(id: string) {
        const achado = estado.agendamentos.find((a) => a.id === id);
        if (!achado) {
          throw new ErroDaApi(
            404,
            "nao_encontrado",
            "agendamento não encontrado"
          );
        }
        return comCliente(achado);
      },
      async criarAgendamento(novo: NovoAgendamentoBarbeiroInput) {
        return comCliente(novoAgendamento({ ...novo, origem: "barbeiro" }));
      },
      async enviarCapa(arquivo: Blob) {
        await exigirImagem(arquivo, 4 * 1024 * 1024);
        const capaUrl = urlFalsa("capa");
        estado.perfil = { ...estado.perfil, capaUrl };
        decidir(["dados_do_negocio"]);
        return capaUrl;
      },
      async removerCapa() {
        estado.perfil = { ...estado.perfil, capaUrl: null };
      },
      async enviarLogo(arquivo: Blob, formato: FormatoDaLogo) {
        await exigirImagem(arquivo, 2 * 1024 * 1024);
        if (!["redonda", "quadrada", "livre"].includes(formato)) {
          throw new ErroDaApi(400, "requisicao_invalida", "formato da logo fora da lista");
        }
        const logoUrl = urlFalsa("logo");
        estado.perfil = { ...estado.perfil, logoUrl, logoFormato: formato };
        decidir(["dados_do_negocio"]);
        return { logoUrl, logoFormato: formato };
      },
      async removerLogo() {
        estado.perfil = { ...estado.perfil, logoUrl: null, logoFormato: null };
      },
      // As regras da API: rascunho igual ao que está no ar é nada
      // pendente; publicar sem rascunho é 409; só o dono.
      async salvarRascunhoDaAparencia(aparencia: AparenciaDaPagina) {
        exigirDono();
        const rascunho = normalizarAparencia(aparencia);
        const igual = JSON.stringify(rascunho) === JSON.stringify(normalizarAparencia(estado.perfil.aparencia));
        estado.aparenciaRascunho = igual ? null : rascunho;
        return barbeariaDoPainel();
      },
      async publicarAparencia() {
        exigirDono();
        if (!estado.aparenciaRascunho) {
          throw new ErroDaApi(409, "conflito", "não há rascunho da aparência para publicar");
        }
        estado.perfil = { ...estado.perfil, aparencia: estado.aparenciaRascunho };
        estado.aparenciaRascunho = null;
        decidir(["aparencia"]);
        return barbeariaDoPainel();
      },
      async salvarOrdemDasCategorias(categorias: CategoriaDeServico[]) {
        exigirDono();
        if (categorias.some((categoria) => !(CATEGORIAS_DE_SERVICO as readonly string[]).includes(categoria))) {
          throw new ErroDaApi(400, "requisicao_invalida", "categoria fora da lista");
        }
        estado.perfil = { ...estado.perfil, ordemCategorias: ordenarCategorias(categorias) };
        return barbeariaDoPainel();
      },
      async salvarLayoutDosServicos(layoutDosServicos: AparenciaDaPagina["layoutDosServicos"]) {
        exigirDono();
        if (layoutDosServicos !== "agrupada" && layoutDosServicos !== "abas") {
          throw new ErroDaApi(400, "requisicao_invalida", "layout dos serviços fora da lista");
        }
        const noAr = { ...normalizarAparencia(estado.perfil.aparencia), layoutDosServicos };
        estado.perfil = { ...estado.perfil, aparencia: noAr };
        if (estado.aparenciaRascunho) {
          const rascunho = { ...normalizarAparencia(estado.aparenciaRascunho), layoutDosServicos };
          estado.aparenciaRascunho = JSON.stringify(rascunho) === JSON.stringify(noAr) ? null : rascunho;
        }
        decidir(["aparencia"]);
        return barbeariaDoPainel();
      },
      async descartarRascunhoDaAparencia() {
        exigirDono();
        estado.aparenciaRascunho = null;
        return barbeariaDoPainel();
      },
      async enviarFotoDoMembro(id: string, arquivo: Blob) {
        membroOu404(id);
        await exigirImagem(arquivo, 2 * 1024 * 1024);
        const fotoUrl = urlFalsa("foto");
        definirFoto(id, fotoUrl);
        return fotoUrl;
      },
      async removerFotoDoMembro(id: string) {
        membroOu404(id);
        definirFoto(id, null);
      },
      async enviarFotoDoServico(id: string, arquivo: Blob) {
        await exigirImagem(arquivo, 2 * 1024 * 1024);
        const fotoUrl = urlFalsa("servico");
        definirFotoDoServico(id, fotoUrl);
        return fotoUrl;
      },
      async removerFotoDoServico(id: string) {
        definirFotoDoServico(id, null);
      },
      async onboarding() {
        exigirDono();
        return trilha();
      },
      async marcarTrabalhoSozinho(trabalhoSozinho: boolean) {
        exigirDono();
        estado.onboarding!.equipe = trabalhoSozinho;
        return trilha();
      },
      async marcarLinkCopiado() {
        estado.onboarding!.link = true;
      },
      async lembreteWhatsApp(id: string) {
        const achado = estado.agendamentos.find((a) => a.id === id);
        if (!achado) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        exigirAtivo(achado);
        const { cliente } = comCliente(achado);
        const texto =
          `Olá, ${cliente.nome.split(" ")[0]}! Passando pra lembrar do seu horário na ` +
          `${estado.perfil.nome}, às ${achado.horaInicio}, com ${achado.barbeiro.nome}.`;
        return `https://wa.me/55${cliente.telefone.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
      },
      // As recusas do remarcar da API (routers/agendamentos.ts): o do
      // colega some pro profissional (404), e ele não passa o próprio pra
      // outro (403); pago, 409; só pendente e confirmado mudam. O antigo
      // cancela antes de criar o novo, e volta se o novo não couber.
      async remarcarAgendamento(id: string, remarcacao: RemarcacaoDoPainel) {
        const eu = perfilDoLogado().id;
        const antigo = estado.agendamentos.find((a) => a.id === id);
        if (!antigo || (estado.papel === "profissional" && antigo.barbeiro.id !== eu)) {
          throw new ErroDaApi(404, "nao_encontrado", "agendamento não encontrado");
        }
        const destino = remarcacao.barbeiroId ?? antigo.barbeiro.id;
        if (estado.papel === "profissional" && destino !== eu) {
          throw new ErroDaApi(403, "sem_permissao", "você só remarca na sua própria agenda");
        }
        if (estado.pagamentos!.some((p) => p.agendamentoId === id)) {
          throw new ErroDaApi(409, "com_pagamento", "esse atendimento já tem pagamento no caixa");
        }
        if (antigo.status !== "pendente" && antigo.status !== "confirmado") {
          throw new ErroDaApi(422, "status_nao_permite", `agendamento ${antigo.status} não pode ser alterado`);
        }
        const statusAntigo = antigo.status;
        antigo.status = "cancelado";
        try {
          return comCliente(
            novoAgendamento({
              data: remarcacao.data,
              horaInicio: remarcacao.horaInicio,
              servicoIds: antigo.servicos.map((s) => s.servicoId),
              origem: "barbeiro",
              observacoes: antigo.observacoes ?? undefined,
              clienteId: (antigo as { clienteId?: string }).clienteId,
              barbeiroId: destino,
            })
          );
        } catch (erro) {
          antigo.status = statusAntigo;
          throw erro;
        }
      },
      async atualizarAgendamento(id: string, edicao: EdicaoDoAgendamento) {
        const indice = estado.agendamentos.findIndex((a) => a.id === id);
        if (indice < 0) {
          throw new ErroDaApi(
            404,
            "nao_encontrado",
            "agendamento não encontrado"
          );
        }
        // Sair do concluído leva o pagamento junto, como na API.
        const pago = estado.pagamentos!.some((p) => p.agendamentoId === id);
        if (pago && edicao.status !== undefined && edicao.status !== "concluido") {
          exigirDiaAberto(estado.agendamentos[indice].data);
          apagarPagamento(id);
        }
        estado.agendamentos[indice] = {
          ...estado.agendamentos[indice],
          ...edicao,
        };
        return comCliente(estado.agendamentos[indice]);
      },
      async pagamentoDoAgendamento(id: string) {
        exigirCaixa();
        const achado = agendamentoOu404(id);
        const pagamento = estado.pagamentos!.find((p) => p.agendamentoId === id);
        // Como assinaturasNoPagamento: as vivas do cliente, e o
        // profissional só as da casa e as dele.
        marcarAtrasadas();
        const clienteId = achado.clienteId ?? estado.cliente.id;
        const assinaturas: AssinaturaNoPagamento[] = estado
          .assinaturas!.filter((a) => a.cliente.id === clienteId && a.situacao !== "cancelada")
          .filter((a) => estado.papel !== "profissional" || a.plano.vendedor === null || a.plano.vendedor.id === "bb1")
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
          .map((a) => {
            const usados = usosNoCiclo(a, pagamento?.id ?? null);
            const servicos = estado.planos!.find((p) => p.id === a.plano.id)?.servicos ?? [];
            return {
              id: a.id,
              situacao: a.situacao,
              cicloComecaEm: a.cicloComecaEm,
              cicloTerminaEm: a.cicloTerminaEm,
              noCiclo: noCicloDe(a, achado.data),
              valeComOAtendente: a.plano.vendedor === null || a.plano.vendedor.id === achado.barbeiro.id,
              plano: { ...a.plano },
              servicos: [...servicos]
                .sort((x, y) => x.nome.localeCompare(y.nome))
                .map((s) => ({
                  servicoId: s.servicoId,
                  nome: s.nome,
                  usosPorCiclo: s.usosPorCiclo,
                  usosRestantes: usosRestantes(s.usosPorCiclo, usados.get(s.servicoId) ?? 0),
                })),
            };
          });
        return {
          pagamento: pagamento ? copiaDoPagamento(pagamento) : null,
          diaFechado: estado.diasFechados!.includes(achado.data),
          assinaturas,
        };
      },
      // A mesma conta da API (dividirPagamento); o resto, como em
      // lib/caixa.ts: conclui, e o cliente sem dono passa a ser de quem
      // atendeu.
      async registrarPagamento(id: string, dados: RegistrarPagamento) {
        exigirCaixa();
        const achado = agendamentoOu404(id);
        exigirDiaAberto(achado.data);
        const atendente = achado.barbeiro.id;
        const clienteId = achado.clienteId ?? estado.cliente.id;
        if (dados.forma === "plano" && dados.assinaturaId === undefined) {
          throw new ErroDaApi(422, "forma_invalida", "pelo plano, só com a assinatura do cliente");
        }
        const anterior = estado.pagamentos!.find((p) => p.agendamentoId === id);
        // Refazer com a mesma assinatura não confere de novo: ciclo
        // renovado ou cancelada não travam a correção.
        let peloPlano: { assinatura: AssinaturaDoPainel; cobertos: { id: string; nome: string }[] } | null = null;
        if (dados.assinaturaId !== undefined) {
          marcarAtrasadas();
          const assinatura = assinaturaOu404(dados.assinaturaId);
          peloPlano = {
            assinatura,
            cobertos:
              anterior?.assinatura?.id === assinatura.id
                ? anterior.servicosPeloPlano.map((s) => ({ ...s }))
                : conferirOPlano(assinatura, achado, clienteId, anterior?.id ?? null),
          };
        }
        // O que o plano cobriu sai da soma, uma linha por uso.
        const aCobrar = [...achado.servicos];
        for (const coberto of peloPlano?.cobertos ?? []) {
          const linha = aCobrar.findIndex((s) => s.servicoId === coberto.id);
          if (linha >= 0) aCobrar.splice(linha, 1);
        }
        const soma = aCobrar.reduce((total, s) => total + Math.round(Number(s.precoNoMomento) * 100), 0);
        const servicosCentavos = dados.servicosCentavos ?? soma;
        const descontoCentavos = dados.descontoCentavos ?? 0;
        const gorjetaCentavos = dados.gorjetaCentavos ?? 0;
        if (descontoCentavos > servicosCentavos) {
          throw new ErroDaApi(422, "valor_invalido", "o desconto passa do valor dos serviços");
        }
        // `plano` só quando nada foi cobrado; recusar, e não trocar sozinho.
        const nadaCobrado = servicosCentavos === 0 && gorjetaCentavos === 0;
        if (dados.forma === "plano" && !nadaCobrado) {
          throw new ErroDaApi(422, "forma_invalida", "com valor a cobrar, a forma é a do dinheiro");
        }
        if (dados.forma !== "plano" && peloPlano && nadaCobrado) {
          throw new ErroDaApi(422, "forma_invalida", "nada a cobrar: a forma é pelo plano");
        }
        const recebidoPorId = dados.recebidoPorId ?? atendente;
        if (dados.recebidoPorId !== undefined && !equipe().some((m) => m.id === recebidoPorId && m.ativo)) {
          throw new ErroDaApi(422, "membro_invalido", "quem recebeu não é um membro ativo da equipe");
        }
        const donos = estado.donosDosClientes!;
        donos[clienteId] ??= atendente;
        const fixoCentavos = peloPlano
          ? (estado.planos!.find((p) => p.id === peloPlano.assinatura.plano.id)?.fixoPorAtendimentoCentavos ?? null)
          : null;
        const partes = [
          ...dividirPagamento(
            { atendente, donoDoCliente: donos[clienteId], servicosCentavos, descontoCentavos, gorjetaCentavos },
            { ativos: equipe().filter((m) => m.ativo).map((m) => m.id), ...estado.divisao! }
          ),
          // O fixo do plano da casa, sobre o atendimento, não sobre o avulso.
          ...(peloPlano ? parteDoPlano({ atendente, fixoCentavos }) : []),
        ];
        const pagamento: PagamentoDoAgendamento = {
          id: anterior?.id ?? `p${estado.pagamentos!.length + 1}`,
          agendamentoId: id,
          data: achado.data,
          forma: dados.forma,
          servicosCentavos,
          descontoCentavos,
          gorjetaCentavos,
          totalCentavos: servicosCentavos - descontoCentavos + gorjetaCentavos,
          atendente: membroDoCaixa(atendente),
          donoDoCliente: membroDoCaixa(donos[clienteId]),
          recebidoPor: membroDoCaixa(recebidoPorId),
          registradoPor: membroDoCaixa("bb1"),
          registradoEm: new Date().toISOString(),
          partes: partes.map((parte) => ({
            beneficiario: parte.beneficiario === null ? null : membroDoCaixa(parte.beneficiario),
            motivo: parte.motivo,
            valorCentavos: parte.valorCentavos,
          })),
          assinatura: peloPlano
            ? { id: peloPlano.assinatura.id, plano: { id: peloPlano.assinatura.plano.id, nome: peloPlano.assinatura.plano.nome } }
            : null,
          servicosPeloPlano: peloPlano?.cobertos ?? [],
        };
        apagarPagamento(id);
        estado.pagamentos!.push(pagamento);
        achado.status = "concluido";
        return copiaDoPagamento(pagamento);
      },
      async removerPagamento(id: string) {
        exigirCaixa();
        const achado = agendamentoOu404(id);
        exigirDiaAberto(achado.data);
        apagarPagamento(id);
      },
      async caixaDoDia(data: string) {
        exigirCaixa();
        return caixaDoDiaFalso(data);
      },
      // Como a API: o papel antes do plano; dia já fechado é 409.
      async fecharODia(data: string) {
        exigirDono();
        exigirCaixa();
        exigirDiaAberto(data);
        estado.diasFechados!.push(data);
        fechamentos.set(data, { fechadoEm: new Date().toISOString(), fechadoPor: membroDoCaixa("bb1") });
        return caixaDoDiaFalso(data);
      },
      async reabrirODia(data: string) {
        exigirDono();
        exigirCaixa();
        estado.diasFechados = estado.diasFechados!.filter((d) => d !== data);
        fechamentos.delete(data);
      },
      async divisao() {
        exigirDono();
        exigirCaixa();
        return divisaoFalsa();
      },
      // Como lib/caixa.ts: a matriz enviada substitui a dos pares entre os
      // membros da divisão; a parte da casa muda só pra quem veio.
      async salvarDivisao(divisao: SalvarDivisao) {
        exigirDono();
        exigirCaixa();
        for (const { membroId } of divisao.parteDaCasa) exigirMembroDaDivisao(membroId);
        const pares = new Set<string>();
        for (const regra of divisao.matriz) {
          exigirMembroDaDivisao(regra.donoDoClienteId);
          exigirMembroDaDivisao(regra.atendenteId);
          const par = `${regra.donoDoClienteId}:${regra.atendenteId}`;
          if (regra.donoDoClienteId === regra.atendenteId || pares.has(par)) {
            throw new ErroDaApi(422, "regra_invalida", "par com a mesma pessoa ou repetido");
          }
          pares.add(par);
        }
        const ids = new Set(membrosDaDivisao().map((m) => m.id));
        const parteDaCasa = { ...estado.divisao!.parteDaCasa };
        for (const { membroId, percentual } of divisao.parteDaCasa) parteDaCasa[membroId] = percentual;
        estado.divisao!.parteDaCasa = parteDaCasa;
        estado.divisao!.matriz = [
          ...estado.divisao!.matriz.filter((r) => !(ids.has(r.donoDoCliente) && ids.has(r.atendente))),
          ...divisao.matriz
            .filter((r) => r.percentual > 0)
            .map((r) => ({ donoDoCliente: r.donoDoClienteId, atendente: r.atendenteId, percentual: r.percentual })),
        ];
        return divisaoFalsa();
      },

      // Os planos (Onda 2, marco 3), com as recusas da API
      // (apps/api/src/routers/planos.ts). O dublê não confere os serviços
      // que o vendedor faz: isso é da API.
      async planos() {
        exigirPlanosDaBarbearia();
        const eu = membroOu404("bb1");
        return {
          vitrine: estado.vitrineDePlanos!,
          podeCriarDaCasa: estado.papel === "dono",
          podeCriarProprio: vendePlanos(eu) && eu.atende,
          planos: planosVisiveis().map(doPainel),
        };
      },
      async criarPlano(novo: NovoPlano) {
        const eu = membroOu404("bb1");
        if (!vendePlanos(eu) || (novo.daCasa && estado.papel !== "dono")) {
          throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite isto");
        }
        exigirPlanosDaBarbearia();
        const plano: PlanoDoPainel = {
          id: `pl${estado.planos!.length + 1}`,
          daCasa: novo.daCasa,
          vendedor: novo.daCasa ? null : { id: eu.id, nome: eu.nome },
          nome: novo.nome,
          descricao: novo.descricao ?? null,
          ciclo: novo.ciclo,
          precoCentavos: novo.precoCentavos,
          diasDeTeste: novo.diasDeTeste ?? 0,
          fixoPorAtendimentoCentavos: novo.fixoPorAtendimentoCentavos ?? null,
          aceitaOnline: novo.aceitaOnline ?? true,
          aceitaNoBalcao: novo.aceitaNoBalcao ?? false,
          onlineIndisponivel: false,
          ativo: true,
          servicos: servicosDoPlano(novo.servicos),
          assinantes: 0,
        };
        exigirPlanoCerto(plano);
        estado.planos!.push(plano);
        return doPainel(plano);
      },
      async editarPlano(id: string, mudanca: MudancaDoPlano) {
        if (!vendePlanos(membroOu404("bb1"))) {
          throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite isto");
        }
        exigirPlanosDaBarbearia();
        const atual = planosVisiveis().find((p) => p.id === id);
        if (!atual) throw new ErroDaApi(404, "nao_encontrado", "plano não encontrado");
        const { servicos, ...campos } = mudanca;
        const novo: PlanoDoPainel = {
          ...atual,
          ...campos,
          servicos: servicos ? servicosDoPlano(servicos) : atual.servicos,
        };
        exigirPlanoCerto(novo);
        Object.assign(atual, novo);
        return doPainel(atual);
      },
      // A conta de quem vende (routers/pagamentos-online.ts). O dublê
      // reconhece a chave pelo prefixo, como o `modoDaChave` da API, e
      // não fala com provedor nenhum.
      async pagamentosOnline(daCasa: boolean) {
        chaveDaConta(daCasa);
        return pagamentosOnlineFalsos(daCasa);
      },
      async conectarPagamentosOnline(daCasa: boolean, provedor: ProvedorDePagamento, chave: string, tag?: string) {
        const qual = chaveDaConta(daCasa);
        if (!vendePlanos(membroOu404("bb1"))) {
          throw new ErroDaApi(403, "sem_permissao", "seu papel na equipe não permite vender planos");
        }
        exigirPlanosDaBarbearia();
        // As frases da API (routers/pagamentos-online.ts), pelo provedor.
        const nome = NOME_DO_PROVEDOR[provedor];
        const limpa = chave.trim();
        const modo = modoDaChave(provedor, limpa);
        if (modo === null) {
          throw new ErroDaApi(422, "chave_invalida", `isso não é uma chave de API ${nome.do}: ela começa com ${nome.inicio}`);
        }
        if (modo !== estado.modoAceito) {
          let mensagem = `esta é uma chave de produção ${nome.do}: aqui só vale a ${nome.teste}`;
          if (modo === "teste") {
            mensagem = `esta é uma chave ${nome.teste} ${nome.do}, que não move dinheiro: use a chave de produção`;
          } else if (provedor === "infinitepay") {
            mensagem = `a InfinitePay não tem chave ${nome.teste}, e aqui só vale a ${nome.teste}`;
          }
          throw new ErroDaApi(422, "modo_errado", mensagem);
        }
        const infiniteTag = provedor === "infinitepay" ? tagDaInfinitePay(tag) : null;
        const atual = estado.contasOnline![qual];
        if (atual && atual.provedor !== provedor) {
          throw new ErroDaApi(
            422,
            "outra_conta",
            `a conta conectada é ${NOME_DO_PROVEDOR[atual.provedor].do}: desconecte antes de conectar a ${nome.do}`
          );
        }
        if (atual && infiniteTag !== null && atual.infiniteTag !== infiniteTag) {
          throw new ErroDaApi(
            422,
            "outra_conta",
            `a conta conectada é a da InfiniteTag ${atual.infiniteTag}: desconecte antes de conectar outra`
          );
        }
        estado.contasOnline![qual] = {
          provedor,
          modo,
          chaveFinal: limpa.slice(-4),
          conectadaEm: atual?.conectadaEm ?? new Date().toISOString(),
          infiniteTag,
          // Trocar a chave mantém os dias que quem vende escolheu.
          diasParaCancelar: infiniteTag === null ? null : (atual?.diasParaCancelar ?? DIAS_PARA_CANCELAR.padrao),
        };
        return pagamentosOnlineFalsos(daCasa);
      },
      // Como a API: o schema recusa fora de 3 a 30 (400); a conta de
      // outro provedor, 422.
      async mudarDiasParaCancelar(daCasa: boolean, diasParaCancelar: number) {
        const qual = chaveDaConta(daCasa);
        if (
          !Number.isInteger(diasParaCancelar) ||
          diasParaCancelar < DIAS_PARA_CANCELAR.minimo ||
          diasParaCancelar > DIAS_PARA_CANCELAR.maximo
        ) {
          throw new ErroDaApi(400, "requisicao_invalida", "os dias para cancelar vão de 3 a 30");
        }
        const atual = estado.contasOnline![qual];
        if (!atual) throw new ErroDaApi(404, "nao_encontrado", "nenhuma conta conectada");
        if (atual.provedor !== "infinitepay") {
          throw new ErroDaApi(
            422,
            "so_na_infinitepay",
            `os dias para cancelar são só da InfinitePay: ${NOME_DO_PROVEDOR[atual.provedor].o} cancela pelas próprias regras`
          );
        }
        estado.contasOnline![qual] = { ...atual, diasParaCancelar };
        return pagamentosOnlineFalsos(daCasa);
      },
      // Recusado com assinatura online viva nos planos da conta: os da
      // casa na da casa, os de quem está logado na dele.
      async desconectarPagamentosOnline(daCasa: boolean) {
        const qual = chaveDaConta(daCasa);
        if (!estado.contasOnline![qual]) throw new ErroDaApi(404, "nao_encontrado", "nenhuma conta conectada");
        const vivas = estado.assinaturas!.filter(
          (a) =>
            a.forma === "online" &&
            a.situacao !== "cancelada" &&
            (daCasa ? a.plano.daCasa : a.plano.vendedor?.id === "bb1")
        ).length;
        if (vivas > 0) {
          throw new ErroDaApi(
            422,
            "assinaturas_ativas",
            vivas === 1
              ? "há 1 assinatura online viva nesta conta: cancele a assinatura antes de desconectar"
              : `há ${vivas} assinaturas online vivas nesta conta: cancele as assinaturas antes de desconectar`
          );
        }
        delete estado.contasOnline![qual];
      },

      async ligarVitrine(ligada: boolean) {
        exigirDono();
        exigirPlanosDaBarbearia();
        estado.vitrineDePlanos = ligada;
        return { ligada };
      },

      // O assinante no balcão (apps/api/src/routers/assinantes.ts). Só
      // assinar pede o Completo. O dublê não confere se quem vende segue
      // liberado: isso é da API.
      async assinantes(clienteId?: string) {
        marcarAtrasadas();
        const lista = assinaturasVisiveis()
          .filter((a) => clienteId === undefined || a.cliente.id === clienteId)
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || a.id.localeCompare(b.id));
        return { assinantes: lista.map(copiaDaAssinatura) };
      },
      async assinarPlano(clienteId: string, planoId: string) {
        exigirPlanosDaBarbearia();
        const cliente = estado.clientes.find((c) => c.id === clienteId);
        const plano = planosVisiveis().find((p) => p.id === planoId);
        if (!cliente || !plano) throw new ErroDaApi(404, "nao_encontrado", "recurso não encontrado");
        if (!plano.ativo) throw new ErroDaApi(422, "plano_inativo", "este plano está desativado");
        if (!plano.aceitaNoBalcao) {
          throw new ErroDaApi(422, "plano_sem_balcao", "este plano não aceita pagamento no balcão");
        }
        const viva = estado.assinaturas!.some(
          (a) => a.plano.id === plano.id && a.cliente.id === cliente.id && a.situacao !== "cancelada"
        );
        if (viva) throw new ErroDaApi(422, "ja_assina", "este cliente já assina este plano");

        const emTeste = plano.diasDeTeste > 0;
        const nova: AssinaturaDoPainel = {
          id: `as${estado.assinaturas!.length + 1}`,
          situacao: emTeste ? "teste" : "pendente",
          forma: "no_balcao",
          linkDoCiclo: null,
          precoCentavos: plano.precoCentavos,
          ciclo: plano.ciclo,
          cicloComecaEm: emTeste ? estado.hoje : null,
          cicloTerminaEm: emTeste ? somarDias(estado.hoje, plano.diasDeTeste) : null,
          canceladaEm: null,
          criadoEm: new Date().toISOString(),
          cliente: { id: cliente.id, nome: cliente.nome, telefone: cliente.telefone },
          plano: { id: plano.id, nome: plano.nome, daCasa: plano.daCasa, vendedor: plano.vendedor },
        };
        estado.assinaturas!.push(nova);
        contarAssinante(plano.id, 1);
        return copiaDaAssinatura(nova);
      },
      async receberMensalidade(assinaturaId: string, forma: FormaDoPagamento) {
        if (!(FORMAS_DE_PAGAMENTO as readonly string[]).includes(forma)) {
          throw new ErroDaApi(400, "requisicao_invalida", "forma fora da lista");
        }
        marcarAtrasadas();
        const atual = assinaturaOu404(assinaturaId);
        // A da InfinitePay aceita (decisão 10), e o link aberto fica fechado.
        const porLink = estado.contasOnline![atual.plano.vendedor?.id ?? "casa"]?.provedor === "infinitepay";
        if (atual.forma === "online" && !porLink) {
          throw new ErroDaApi(422, "assinatura_online", "assinatura online: o pagamento entra pelo provedor");
        }
        const problema = problemaDoRecebimento(atual, estado.hoje);
        if (problema === "cancelada") {
          throw new ErroDaApi(422, "assinatura_cancelada", "esta assinatura foi cancelada");
        }
        if (problema === "ciclo_em_dia") {
          const oQue = atual.situacao === "teste" ? "o teste grátis" : "o ciclo pago";
          throw new ErroDaApi(
            422,
            "ciclo_em_dia",
            `${oQue} vai até ${diaEMes(atual.cicloTerminaEm!)}: marque o próximo pagamento a partir desse dia`
          );
        }
        const vendedor = atual.plano.vendedor?.id ?? null;
        const partes = dividirMensalidade({
          precoCentavos: atual.precoCentavos,
          vendedor,
          parteDaCasa: vendedor === null ? 0 : (estado.divisao!.parteDaCasa[vendedor] ?? 0),
        });
        Object.assign(atual, {
          situacao: "ativa",
          linkDoCiclo: null,
          cicloComecaEm: estado.hoje,
          cicloTerminaEm: fimDoCiclo(estado.hoje, atual.ciclo),
        });
        // Quem recebe é quem está logado (bb1, no dublê).
        const mensalidade: MensalidadeDoCaixa = {
          id: `rc${++recebimentos}`,
          assinaturaId: atual.id,
          data: proximoDiaAberto(estado.hoje),
          registradoEm: new Date().toISOString(),
          forma,
          meio: null,
          valorCentavos: atual.precoCentavos,
          casaCentavos: partes.find((parte) => parte.beneficiario === null)?.valorCentavos ?? 0,
          recebidoPor: membroDoCaixa("bb1"),
          cliente: { id: atual.cliente.id, nome: atual.cliente.nome },
          plano: { ...atual.plano },
        };
        estado.mensalidades!.push(mensalidade);
        const { id: idDoRecebimento, data, valorCentavos, casaCentavos } = mensalidade;
        return {
          assinatura: copiaDaAssinatura(atual),
          recebimento: { id: idDoRecebimento, data, valorCentavos, casaCentavos, forma },
        };
      },
      async cancelarAssinaturaDoPlano(assinaturaId: string) {
        const atual = assinaturaOu404(assinaturaId);
        if (atual.situacao === "cancelada") return;
        atual.situacao = "cancelada";
        atual.canceladaEm = new Date().toISOString();
        contarAssinante(atual.plano.id, -1);
      },
    },

    cliente: {
      async meuCadastro() {
        return estado.cliente;
      },
      async atualizarMeuCadastro(edicao: EdicaoDoMeuCadastro) {
        estado.cliente = { ...estado.cliente, ...edicao };
        return estado.cliente;
      },
      // A marca "pelo plano" (previsaoPeloPlano na API), com os usos que
      // a Minha conta mostra no plano.
      async meusAgendamentos(): Promise<AgendamentoDoCliente[]> {
        marcarAtrasadas();
        const assinaturas = (estado.assinaturas ?? [])
          .filter((a) => a.cliente.id === estado.cliente.id)
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm) || a.id.localeCompare(b.id))
          .map((a) => {
            const plano = estado.planos?.find((p) => p.id === a.plano.id);
            const servicos = plano?.servicos ?? [];
            return {
              situacao: a.situacao,
              forma: a.forma,
              ciclo: a.ciclo,
              cicloComecaEm: a.cicloComecaEm,
              cicloTerminaEm: a.cicloTerminaEm,
              pagoAte: null,
              vendedorId: a.plano.vendedor?.id ?? null,
              servicos,
              usados: Object.fromEntries(
                servicos.map((s) => [s.servicoId, estado.usosNoCiclo?.[`${a.id}:${s.servicoId}`] ?? 0])
              ),
            };
          });
        const marcados = estado.agendamentos.filter(
          (a) => (a.status === "pendente" || a.status === "confirmado") && a.data >= estado.hoje
        );
        const peloPlano = preverPeloPlano(
          assinaturas,
          marcados.map((a) => ({ ...a, barbeiroId: a.barbeiro.id, servicoIds: a.servicos.map((s) => s.servicoId) }))
        );
        return estado.agendamentos.map((a) => ({ ...a, peloPlano: peloPlano.get(a.id) ?? [] }));
      },
      async cancelar(id: string) {
        return cancelarAgendamento(id);
      },
      async remarcar(id: string, remarcacao: Remarcacao) {
        const antigo = estado.agendamentos.find((a) => a.id === id);
        if (!antigo) {
          throw new ErroDaApi(
            404,
            "nao_encontrado",
            "agendamento não encontrado"
          );
        }
        // Cancela antes de criar, na mesma ordem da transação da API —
        // é o que permite remarcar pra um horário que sobrepõe o
        // próprio agendamento.
        cancelarAgendamento(id);
        return novoAgendamento({
          // Remarcar não troca de profissional, como na API.
          barbeiroId: antigo.barbeiro.id,
          data: remarcacao.data,
          horaInicio: remarcacao.horaInicio,
          servicoIds:
            remarcacao.servicoIds ?? antigo.servicos.map((s) => s.servicoId),
          origem: "cliente",
        });
      },

      // O cliente que assina online (routers/assinaturas-do-cliente.ts),
      // com as mesmas recusas. A fatura é um link de exemplo.
      async minhasAssinaturas() {
        marcarAtrasadas();
        return estado
          .assinaturas!.filter((a) => a.cliente.id === estado.cliente.id)
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || a.id.localeCompare(b.id))
          .map(naConta);
      },
      async assinarPlano(planoId: string, cpf?: string): Promise<AssinaturaOnlineCriada> {
        const plano = estado.planos!.find((p) => p.id === planoId);
        if (!plano) throw new ErroDaApi(404, "nao_encontrado", "recurso não encontrado");
        // Antes das regras de venda, como na API: quem tem fatura a pagar
        // volta pra ela.
        const viva = estado.assinaturas!.find(
          (a) => a.plano.id === planoId && a.cliente.id === estado.cliente.id && a.situacao !== "cancelada"
        );
        if (viva) {
          if (viva.forma === "online" && (viva.situacao === "pendente" || viva.situacao === "em_atraso")) {
            return { assinatura: naConta(viva), linkDaFatura: faturaFalsa(viva.id, provedorDoPlano(planoId)) };
          }
          throw new ErroDaApi(422, "ja_assina", "você já assina este plano");
        }
        const naVitrine = vitrineFalsa().find((p) => p.id === planoId && p.aceitaOnline);
        if (!naVitrine?.pagamento) {
          throw new ErroDaApi(422, "plano_indisponivel", "este plano não está à venda online agora");
        }
        // O CPF só no provedor que pede (o Asaas); na Stripe, ignorado.
        if (naVitrine.pagamento.pedeCpf) {
          let doCadastro: string | null = estado.cpfDoCliente ?? null;
          if (cpf?.trim()) {
            doCadastro = normalizarCpf(cpf);
            if (doCadastro === null) throw new ErroDaApi(422, "cpf_invalido", "o CPF não confere: confira os números");
          }
          if (doCadastro === null) throw new ErroDaApi(422, "cpf_obrigatorio", "o Asaas pede o CPF de quem assina");
          estado.cpfDoCliente = doCadastro;
        }

        const emTeste = plano.diasDeTeste > 0;
        const nova: AssinaturaDoPainel = {
          id: `as${estado.assinaturas!.length + 1}`,
          situacao: emTeste ? "teste" : "pendente",
          forma: "online",
          // Na InfinitePay, o link do primeiro pagamento; em teste, ele sai
          // na varredura (fora do dublê).
          linkDoCiclo:
            naVitrine.pagamento.provedor === "infinitepay" && !emTeste
              ? { url: faturaFalsa(`as${estado.assinaturas!.length + 1}`, "infinitepay"), vencimento: estado.hoje }
              : null,
          precoCentavos: plano.precoCentavos,
          ciclo: plano.ciclo,
          cicloComecaEm: emTeste ? estado.hoje : null,
          cicloTerminaEm: emTeste ? somarDias(estado.hoje, plano.diasDeTeste) : null,
          canceladaEm: null,
          criadoEm: new Date().toISOString(),
          cliente: { id: estado.cliente.id, nome: estado.cliente.nome, telefone: estado.cliente.telefone },
          plano: { id: plano.id, nome: plano.nome, daCasa: plano.daCasa, vendedor: plano.vendedor },
        };
        estado.assinaturas!.push(nova);
        contarAssinante(plano.id, 1);
        // Na Stripe, a fatura de R$ 0 do teste grátis nasce paga: não há
        // fatura aberta até o fim do teste (o conector devolve null).
        // Na InfinitePay, em teste, o link do primeiro pagamento sai na
        // varredura, 3 dias antes do fim do teste.
        const semFaturaAgora =
          emTeste && (naVitrine.pagamento.provedor === "stripe" || naVitrine.pagamento.provedor === "infinitepay");
        return {
          assinatura: naConta(nova),
          linkDaFatura: semFaturaAgora ? null : faturaFalsa(nova.id, naVitrine.pagamento.provedor),
        };
      },
      async cancelarAssinatura(id: string) {
        const atual = minhaAssinaturaOu404(id);
        if (atual.situacao === "cancelada") return;
        atual.situacao = "cancelada";
        atual.canceladaEm = new Date().toISOString();
        contarAssinante(atual.plano.id, -1);
      },
    },

    suporte: {
      async login(email: string, senha: string): Promise<SessaoSuporte> {
        if (email.trim().toLowerCase() !== EMAIL_DO_SUPORTE_FALSO || senha !== SENHA_DO_SUPORTE_FALSA) {
          throw new ErroDaApi(401, "credenciais_invalidas", "");
        }
        return {
          token: "jwt-falso-suporte",
          operador: { id: "op1", nome: "Suporte", email: EMAIL_DO_SUPORTE_FALSO },
        };
      },
      // A barbearia do dublê sai com o nome e o link de agora, como a API
      // lê do banco na hora.
      async solicitacoes() {
        return estado.solicitacoesDeLink!
          .filter((s) => s.status === "pendente")
          .sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
          .map((s) => ({
            ...s,
            barbearia: daMinhaBarbearia(s)
              ? { id: estado.perfil.id, nome: estado.perfil.nome, slug: estado.perfil.slug }
              : { ...s.barbearia },
          }));
      },
      // 409 desfaz tudo: o pedido fica pendente e o link não muda.
      async aprovar(id: string) {
        const pedido = pedidoPendente(id);
        exigirSlugLivre(pedido.slugPedido);
        if (daMinhaBarbearia(pedido)) {
          estado.perfil = { ...estado.perfil, slug: pedido.slugPedido };
        }
        Object.assign(pedido, { status: "aprovada", decididoEm: new Date().toISOString() });
        return semBarbearia(pedido);
      },
      async avisos() {
        return estado.avisosPublicados!.map((a) => ({ ...a }));
      },
      // O mesmo schema da API: link só do painel ou https. Quem recebe
      // são os membros ativos — no dublê, a equipe.
      async publicarAviso(aviso: NovoAviso) {
        const link = aviso.link ?? null;
        if (link !== null && !/^(\/painel(\/\S*)?|https:\/\/\S+)$/.test(link)) {
          throw new ErroDaApi(400, "requisicao_invalida", "link inválido");
        }
        const publicado: AvisoPublicado = {
          id: `aviso-${estado.avisosPublicados!.length + 1}`,
          titulo: aviso.titulo.trim(),
          texto: aviso.texto.trim(),
          link,
          criadoEm: new Date().toISOString(),
          destinatarios: estado.equipe!.filter((m) => m.ativo).length,
          lidas: 0,
        };
        estado.avisosPublicados!.unshift(publicado);
        return { ...publicado };
      },
      async recusar(id: string, resposta: string) {
        const pedido = pedidoPendente(id);
        Object.assign(pedido, {
          status: "recusada",
          resposta: resposta.trim(),
          decididoEm: new Date().toISOString(),
        });
        return semBarbearia(pedido);
      },
    },
  };
}
