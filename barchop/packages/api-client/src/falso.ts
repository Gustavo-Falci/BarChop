import { COMODIDADES, FORMAS_DE_PAGAMENTO, PADRAO_INSTAGRAM } from "@barchop/formato";
import type {
  AgendamentoComCliente,
  AgendamentoDoLembrete,
  AgendamentoSerializado,
  AntecedenciaDoLembrete,
  BarbeariaDoPainel,
  ClienteSerializado,
  BloqueioSerializado,
  DiaDaJornada,
  HorarioSerializado,
  MembroDaEquipe,
  NovoAgendamentoBarbeiroInput,
  NovoAgendamentoPublicoInput,
  PapelMembro,
  PerfilPublicoBarbearia,
  ProximosHorariosDoServico,
  ServicoSerializado,
} from "@barchop/types";
import type {
  AceiteDoConvite,
  EdicaoDaBarbearia,
  EdicaoDoMembro,
  NovoBloqueio,
  NovoMembro,
  EdicaoDoAgendamento,
  EdicaoDoCliente,
  EdicaoDoPerfil,
  EdicaoDoServico,
  NovaBarbearia,
  NovoCliente,
  NovoServico,
  RedefinicaoDeSenha,
} from "./barbeiro";
import type { EdicaoDoMeuCadastro, Remarcacao } from "./cliente";
import { ErroDaApi } from "./erro";
import type {
  CredenciaisDoCliente,
  DestinoDoCodigo,
  FiltroDoDia,
  FiltroDoMes,
  DefinicaoDeSenhaDoCliente,
} from "./publico";

// O único código que o dublê aceita na definição de senha do cliente.
export const CODIGO_DO_CLIENTE_FALSO = "123456";

// O único código que o dublê aceita no esqueci-a-senha do barbeiro.
export const CODIGO_DO_BARBEIRO_FALSO = "654321";

// O único código que o dublê aceita no convite da equipe.
export const CODIGO_DO_CONVITE_FALSO = "246810";

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
  // A configuração do lembrete, que só o painel lê. 24 h, como na API.
  lembreteAntecedenciaHoras?: AntecedenciaDoLembrete;
  // Os tokens do link do lembrete que o dublê reconhece, por token o id
  // do agendamento. Qualquer outro é 401, como na API; os vencidos, 410.
  lembretes?: Record<string, string>;
  lembretesVencidos?: string[];
  // Os próximos horários da página pública. Sem semente, cada serviço
  // ativo vem sem horário: calcular a agenda é da API, não do dublê.
  proximosHorarios?: ProximosHorariosDoServico[];
}

const PERFIL_PADRAO: PerfilPublicoBarbearia = {
  id: "b1",
  nome: "GR Barber",
  slug: "gr-barber",
  telefone: "(11) 3333-4444",
  endereco: "Rua das Tesouras, 123",
  logoUrl: null,
  sobre: "Barbearia de bairro desde 2012. Corte na tesoura e barba na navalha.",
  whatsapp: null,
  instagram: null,
  comodidades: [],
  formasDePagamento: [],
  capaUrl: null,
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
  { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true, categoria: null },
  { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true, categoria: null },
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

// Como a API: aparada, e vazia vira null.
function limparCategoria(categoria: string | null | undefined): string | null {
  return categoria?.trim() || null;
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
    papel: semente.papel ?? "dono",
    equipe: (semente.equipe ?? equipePadrao(semente.papel ?? "dono")).map((m) => ({ ...m })),
    jornadas: { ...(semente.jornadas ?? {}) },
    servicosPorMembro: { ...(semente.servicosPorMembro ?? {}) },
    bloqueios: [...(semente.bloqueios ?? [])],
    lembreteAntecedenciaHoras: semente.lembreteAntecedenciaHoras ?? 24,
    lembretes: { ...(semente.lembretes ?? {}) },
    lembretesVencidos: [...(semente.lembretesVencidos ?? [])],
    proximosHorarios: semente.proximosHorarios,
  };

  // O que o trigger da API dá a todo membro, criado na primeira leitura.
  function jornadaDe(id: string): DiaDaJornada[] {
    estado.jornadas![id] ??= [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
      diaSemana,
      modo: "barbearia",
      horaInicio: null,
      horaFim: null,
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
  // todos os agendamentos do cliente, sem janela de tempo nenhuma.
  //
  // É a ausência de janela que mantém este dublê honesto. Com uma, ele
  // precisaria saber que dia é hoje — e como a API responde a partir do
  // relógio do servidor e o teste fixa o seu, os dois passariam a
  // discordar sem ninguém notar. Sem relógio aqui, não há como divergir:
  // quem compara com hoje é a tela, e o teste já lhe passa o instante.
  function ultimoAgendamentoDe(clienteId: string): string | null {
    let maior: string | null = null;
    for (const agendamento of estado.agendamentos) {
      if (agendamento.clienteId !== clienteId) continue;
      // ISO compara como texto, então `>` basta pra ficar com a maior.
      if (!maior || agendamento.data > maior) maior = agendamento.data;
    }
    return maior;
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
    const { categoria, ...resto } = edicao;
    estado.servicos[indice] = {
      ...estado.servicos[indice],
      ...resto,
      ...(categoria !== undefined ? { categoria: limparCategoria(categoria) } : {}),
    };
    return estado.servicos[indice];
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
    return { ...barbearia, lembreteAntecedenciaHoras: estado.lembreteAntecedenciaHoras ?? 24 };
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
      barbearia: { nome: estado.perfil.nome, slug: estado.perfil.slug },
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
      // O filtro entra na assinatura mesmo sem ser usado: um dublê com
      // menos parâmetros que o client real deixa a tela chamar de um
      // jeito que só quebra contra a API de verdade.
      async disponibilidadeDoDia(slug: string, _filtro: FiltroDoDia) {
        exigirSlug(slug);
        return estado.horariosLivres;
      },
      async disponibilidadeDoMes(slug: string, _filtro: FiltroDoMes) {
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
      async signup(nova: NovaBarbearia) {
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
      async atualizarMeuPerfil(edicao: EdicaoDoPerfil) {
        Object.assign(membroOu404("bb1"), edicao);
        return perfilDoLogado();
      },
      async equipe() {
        return equipe().map((m) => ({ ...m }));
      },
      async jornada(id: string) {
        membroOu404(id);
        return jornadaDe(id).map((dia) => ({ ...dia }));
      },
      // As mesmas recusas do PUT da API; hora em dia que não é próprio
      // é descartada, como lá.
      async salvarJornada(id: string, jornada: DiaDaJornada[]) {
        membroOu404(id);
        const dias = jornada.map((dia) => {
          if (dia.modo !== "proprio") return { ...dia, horaInicio: null, horaFim: null };
          if (!dia.horaInicio || !dia.horaFim) {
            throw new ErroDaApi(422, "horario_incompleto", "dia próprio sem entrada e saída");
          }
          if (dia.horaInicio >= dia.horaFim) {
            throw new ErroDaApi(422, "intervalo_invalido", "a entrada precisa ser antes da saída");
          }
          return { ...dia };
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
        };
        equipe().push(membro);
        return { ...membro };
      },
      async atualizarMembro(id: string, edicao: EdicaoDoMembro) {
        const alvo = membroOu404(id);
        if (seriaOUltimoDono(alvo, edicao)) {
          throw new ErroDaApi(
            422,
            "ultimo_dono",
            "a barbearia precisa de pelo menos um dono ativo"
          );
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
      async trocarSlug(slug: string) {
        estado.perfil = { ...estado.perfil, slug };
        return barbeariaDoPainel();
      },
      async atualizarMinhaBarbearia(edicao: EdicaoDaBarbearia) {
        exigirPaginaValida(edicao);
        const { lembreteAntecedenciaHoras, ...doPerfil } = edicao;
        if (lembreteAntecedenciaHoras !== undefined) {
          // O enum do schema da API: fora dele é 400.
          if (![2, 12, 24].includes(lembreteAntecedenciaHoras)) {
            throw new ErroDaApi(400, "requisicao_invalida", "antecedência fora de 2, 12 ou 24 h");
          }
          estado.lembreteAntecedenciaHoras = lembreteAntecedenciaHoras;
        }
        estado.perfil = { ...estado.perfil, ...doPerfil };
        return barbeariaDoPainel();
      },
      async horarios() {
        return estado.perfil.horarios;
      },
      async salvarHorarios(horarios: HorarioSerializado[]) {
        estado.perfil = { ...estado.perfil, horarios };
        return horarios;
      },
      async servicos() {
        return estado.servicos;
      },
      async criarServico(novo: NovoServico) {
        const servico = {
          id: `s${estado.servicos.length + 1}`,
          ...novo,
          ativo: true,
          categoria: limparCategoria(novo.categoria),
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
      async clientes(busca?: string, cursor?: string) {
        const filtrados = estado.clientes
          .filter((c) => combina(c, busca ?? ""))
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
        return {
          ...achado,
          agendamentos: estado.agendamentos.filter((a) => a.clienteId === id),
        };
      },
      async atualizarCliente(id: string, edicao: EdicaoDoCliente) {
        const indice = estado.clientes.findIndex((c) => c.id === id);
        if (indice < 0) {
          throw new ErroDaApi(404, "nao_encontrado", "cliente não encontrado");
        }
        estado.clientes[indice] = { ...estado.clientes[indice], ...edicao };
        return estado.clientes[indice];
      },
      async agendamentosDoDia(data: string) {
        return estado.agendamentos
          .filter((a) => a.data === data)
          .map(comCliente);
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
        return capaUrl;
      },
      async removerCapa() {
        estado.perfil = { ...estado.perfil, capaUrl: null };
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
      async atualizarAgendamento(id: string, edicao: EdicaoDoAgendamento) {
        const indice = estado.agendamentos.findIndex((a) => a.id === id);
        if (indice < 0) {
          throw new ErroDaApi(
            404,
            "nao_encontrado",
            "agendamento não encontrado"
          );
        }
        estado.agendamentos[indice] = {
          ...estado.agendamentos[indice],
          ...edicao,
        };
        return comCliente(estado.agendamentos[indice]);
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
      async meusAgendamentos() {
        return estado.agendamentos;
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
    },
  };
}
