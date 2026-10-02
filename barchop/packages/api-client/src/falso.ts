import type {
  AgendamentoComCliente,
  AgendamentoSerializado,
  ClienteSerializado,
  HorarioSerializado,
  NovoAgendamentoBarbeiroInput,
  NovoAgendamentoPublicoInput,
  PerfilPublicoBarbearia,
  ServicoSerializado,
} from "@barchop/types";
import type {
  EdicaoDaBarbearia,
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
  FiltroDoDia,
  FiltroDoMes,
  DefinicaoDeSenhaDoCliente,
} from "./publico";

// O único código que o dublê aceita na definição de senha do cliente.
export const CODIGO_DO_CLIENTE_FALSO = "123456";

// O único código que o dublê aceita no esqueci-a-senha do barbeiro.
export const CODIGO_DO_BARBEIRO_FALSO = "654321";

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
}

const PERFIL_PADRAO: PerfilPublicoBarbearia = {
  id: "b1",
  nome: "GR Barber",
  slug: "gr-barber",
  telefone: "(11) 3333-4444",
  endereco: "Rua das Tesouras, 123",
  logoUrl: null,
  sobre: "Barbearia de bairro desde 2012. Corte na tesoura e barba na navalha.",
  horarios: [0, 1, 2, 3, 4, 5, 6].map((diaSemana) => ({
    diaSemana,
    horaAbertura: diaSemana === 0 ? null : "09:00",
    horaFechamento: diaSemana === 0 ? null : "18:00",
    fechado: diaSemana === 0,
  })),
  barbeiros: [{ id: "bb1", nome: "Rafael" }],
};

const CLIENTE_PADRAO: ClienteSerializado = {
  id: "c1",
  nome: "João Silva",
  telefone: "(11) 99999-8888",
  email: null,
  temConta: true,
};

const SERVICOS_PADRAO: ServicoSerializado[] = [
  { id: "s1", nome: "Corte", duracaoMinutos: 30, preco: "40.00", ativo: true },
  { id: "s2", nome: "Barba", duracaoMinutos: 20, preco: "25.00", ativo: true },
];

// Dublê com estado em memória. Existe pra teste de tela rodar sem rede
// e sem Postgres; o que ele NÃO faz é provar que a API real responde
// assim — os tipos compartilhados pegam divergência de forma, não de
// comportamento.
export function criarApiClientFalso(semente: Partial<EstadoFalso> = {}) {
  // Cópia de toda lista, tanto do padrão quanto da semente: o dublê faz
  // `push` em `agendamentos` e em `servicos`, e sem a cópia dois testes
  // do mesmo arquivo veriam o estado um do outro — o padrão é um só
  // objeto de módulo, e a semente costuma ser reaproveitada.
  const estado: EstadoFalso = {
    perfil: semente.perfil ?? PERFIL_PADRAO,
    servicos: [...(semente.servicos ?? SERVICOS_PADRAO)],
    horariosLivres: [...(semente.horariosLivres ?? ["09:00", "09:30", "10:00"])],
    diasComVaga: { ...(semente.diasComVaga ?? {}) },
    agendamentos: [...(semente.agendamentos ?? [])],
    cliente: semente.cliente ?? CLIENTE_PADRAO,
    clientes: [...(semente.clientes ?? [CLIENTE_PADRAO])],
    // O mesmo padrão da API (LIMITE_PADRAO em routers/clientes.ts).
    limiteDaPagina: semente.limiteDaPagina ?? 100,
  };

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
  }): AgendamentoSerializado & { clienteId?: string } {
    // A trava do banco não deixa dois ativos no mesmo horário; o dublê
    // reproduz isso porque a tela precisa saber tratar horario_ocupado
    // mesmo tendo acabado de ver o horário como livre.
    const conflito = estado.agendamentos.some(
      (a) =>
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
      clienteId: entrada.clienteId,
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
    estado.servicos[indice] = { ...estado.servicos[indice], ...edicao };
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
        return novoAgendamento({ ...novo, origem: "cliente" });
      },
      async pedirCodigoDoCliente(slug: string, _telefone: string) {
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
        return {
          id: "bb1",
          nome: "Rafael",
          email: "rafael@gr.com",
          telefone: null,
          barbeariaId: estado.perfil.id,
        };
      },
      async atualizarMeuPerfil(edicao: EdicaoDoPerfil) {
        return {
          id: "bb1",
          nome: edicao.nome ?? "Rafael",
          email: "rafael@gr.com",
          telefone: edicao.telefone ?? null,
          barbeariaId: estado.perfil.id,
        };
      },
      async minhaBarbearia() {
        const { id, nome, slug, telefone, endereco, logoUrl, sobre } =
          estado.perfil;
        return { id, nome, slug, telefone, endereco, logoUrl, sobre };
      },
      async trocarSlug(slug: string) {
        estado.perfil = { ...estado.perfil, slug };
        const { id, nome, telefone, endereco, logoUrl, sobre } = estado.perfil;
        return { id, nome, slug, telefone, endereco, logoUrl, sobre };
      },
      async atualizarMinhaBarbearia(edicao: EdicaoDaBarbearia) {
        estado.perfil = { ...estado.perfil, ...edicao };
        return estado.perfil;
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
