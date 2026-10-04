import type { Prisma } from "@barchop/database";
import type {
  AgendamentoComCliente,
  AgendamentoSerializado,
  AgendamentoServicoSerializado,
  BarbeariaSerializada,
  ClienteSerializado,
  HorarioSerializado,
  ServicoSerializado,
} from "@barchop/types";
import { dateParaData, dateParaHora } from "./horas";

// Reexportados porque routers/horarios.ts e os testes importam daqui. A
// declaração agora mora em @barchop/types, junto do que as telas
// consomem — o serializador importa o tipo, então divergir os dois
// quebra o type-check em vez de quebrar uma tela.
export type {
  AgendamentoComCliente,
  AgendamentoSerializado,
  AgendamentoServicoSerializado,
  BarbeariaSerializada,
  ClienteSerializado,
  HorarioSerializado,
  ServicoSerializado,
};

// O que sai pelo HTTP não é o registro do Prisma. Dois motivos, os dois
// silenciosos se ninguém cuidar: `Decimal` vira `{}` no JSON.stringify
// (o preço sumiria da resposta), e coluna @db.Time chega como Date, que
// serializa como "1970-01-01T09:00:00.000Z" em vez de "09:00". De
// quebra, montar a resposta campo a campo é o que garante que
// `senhaHash` nunca escape por um spread distraído.

export function serializarBarbearia(barbearia: {
  id: string;
  nome: string;
  slug: string;
  telefone: string | null;
  endereco: string | null;
  logoUrl: string | null;
  sobre: string | null;
}): BarbeariaSerializada {
  return {
    id: barbearia.id,
    nome: barbearia.nome,
    slug: barbearia.slug,
    telefone: barbearia.telefone,
    endereco: barbearia.endereco,
    logoUrl: barbearia.logoUrl,
    sobre: barbearia.sobre,
  };
}

export function serializarHorario(horario: {
  diaSemana: number;
  horaAbertura: Date | null;
  horaFechamento: Date | null;
  fechado: boolean;
}): HorarioSerializado {
  return {
    diaSemana: horario.diaSemana,
    horaAbertura: horario.horaAbertura
      ? dateParaHora(horario.horaAbertura)
      : null,
    horaFechamento: horario.horaFechamento
      ? dateParaHora(horario.horaFechamento)
      : null,
    fechado: horario.fechado,
  };
}

export function serializarServico(servico: {
  id: string;
  nome: string;
  duracaoMinutos: number;
  preco: Prisma.Decimal;
  ativo: boolean;
}): ServicoSerializado {
  return {
    id: servico.id,
    nome: servico.nome,
    duracaoMinutos: servico.duracaoMinutos,
    // toFixed(2) do decimal.js, não do Number: arredonda em decimal e
    // não passa por float em momento nenhum.
    preco: servico.preco.toFixed(2),
    ativo: servico.ativo,
  };
}

export function serializarCliente(cliente: {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  senhaHash: string | null;
}): ClienteSerializado {
  return {
    id: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    // Único lugar da API que olha pro senhaHash do cliente, e olha só
    // pra saber se ele existe. O valor nunca entra na resposta.
    temConta: cliente.senhaHash !== null,
  };
}

export function serializarAgendamento(agendamento: {
  id: string;
  data: Date;
  horaInicio: Date;
  horaFim: Date;
  status: string;
  origem: string;
  observacoes: string | null;
  servicos: {
    servicoId: string;
    precoNoMomento: Prisma.Decimal;
    duracaoNoMomento: number;
    servico: { nome: string };
  }[];
  barbeiro: { id: string; nome: string };
}): AgendamentoSerializado {
  return {
    id: agendamento.id,
    // Com quem: no "qualquer um" o cliente só sabe depois de marcar.
    barbeiro: { id: agendamento.barbeiro.id, nome: agendamento.barbeiro.nome },
    data: dateParaData(agendamento.data),
    horaInicio: dateParaHora(agendamento.horaInicio),
    horaFim: dateParaHora(agendamento.horaFim),
    status: agendamento.status,
    origem: agendamento.origem,
    observacoes: agendamento.observacoes,
    // `precoNoMomento` e `duracaoNoMomento` são o preço e a duração
    // congelados no dia do agendamento — nunca os do serviço hoje. Só o
    // nome vem do serviço atual, pra tela ter o que exibir.
    servicos: agendamento.servicos.map((s) => ({
      servicoId: s.servicoId,
      nome: s.servico.nome,
      precoNoMomento: s.precoNoMomento.toFixed(2),
      duracaoNoMomento: s.duracaoNoMomento,
    })),
  };
}

// A agenda do barbeiro mostra o nome do cliente em cada linha, então as
// rotas de agendamento devolvem os dois juntos. Serializador separado, e
// não um campo opcional no de cima, pra o fluxo público não devolver o
// cadastro do cliente sem querer.
export function serializarAgendamentoComCliente(
  agendamento: Parameters<typeof serializarAgendamento>[0] & {
    cliente: Parameters<typeof serializarCliente>[0];
  }
): AgendamentoComCliente {
  return {
    ...serializarAgendamento(agendamento),
    cliente: serializarCliente(agendamento.cliente),
  };
}
