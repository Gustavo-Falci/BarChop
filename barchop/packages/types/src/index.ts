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
  cliente: { nome: string; telefone: string };
  observacoes?: string;
}

// Os DTOs de resposta moram aqui, e não em apps/api, pelo mesmo motivo
// do ClientePublico acima: o serializador importa o tipo, então
// divergir os dois quebra o type-check em vez de quebrar uma tela.

export interface BarbeariaSerializada {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  logoUrl: string | null;
  // Texto de apresentação da home pública. Anulável porque toda
  // barbearia nasce sem ele — a home tem que funcionar assim.
  sobre: string | null;
}

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
  total: number;
  proximoCursor: string | null;
}

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
  barbeiros: { id: string; nome: string; servicoIds: string[] }[];
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
