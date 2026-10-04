import { prisma } from "@barchop/database";
import type { CanalDeMensagem } from "./canal";
import type { Fila } from "./fila";
import { dateParaData, dateParaHora, instanteNaBarbearia } from "./horas";

export { instanteNaBarbearia } from "./horas";

// O lembrete do agendamento, por e-mail (Onda 1, Bloco D).
//
// Quem cria ou reativa um agendamento chama `agendarLembrete` DEPOIS do
// commit; o worker (registrado no server.ts) roda `enviarLembrete` na
// hora marcada. O trabalho leva só o id: o tratador relê o agendamento
// e decide ali — cancelado, horário já começado ou já lembrado não
// recebem nada. Por isso não há "desagendar": o trabalho velho que
// sobra na fila se descarta sozinho.
export const TRABALHO_LEMBRETE = "lembrete";

const STATUS_QUE_LEMBRA = ["pendente", "confirmado"] as const;

export interface DadosDoLembrete {
  agendamentoId: string;
}

interface Log {
  info(objeto: object, mensagem: string): void;
  error(objeto: object, mensagem: string): void;
}

function lembraDe(status: string): boolean {
  return (STATUS_QUE_LEMBRA as readonly string[]).includes(status);
}

// Quando o lembrete sai: o início do horário, no fuso da barbearia,
// menos a antecedência. No passado quando se marca em cima da hora
// (15h pras 18h com 24 h de antecedência) — e aí sai na hora: o dono
// preferiu lembrete imediato a nenhum.
export function momentoDoLembrete(data: string, hora: string, antecedenciaHoras: number): Date {
  return new Date(instanteNaBarbearia(data, hora).getTime() - antecedenciaHoras * 60 * 60 * 1000);
}

// Chamado pelas rotas depois que a transação commitou. Dentro dela, o
// trabalho sobreviveria ao rollback (o pg-boss tem pool próprio) e o
// retry de impasse agendaria duas vezes.
//
// Falha aqui só vai pro log: o agendamento já está gravado, e um 500
// faria o cliente tentar de novo e bater no 409 do próprio horário.
export async function agendarLembrete(
  { fila, log }: { fila: Fila; log: Log },
  agendamento: { id: string; barbeariaId: string; data: Date; horaInicio: Date; status: string }
): Promise<void> {
  if (!lembraDe(agendamento.status)) return;
  try {
    // Lida agora: mudar a antecedência depois não move os lembretes que
    // já estão na fila.
    const { lembreteAntecedenciaHoras } = await prisma.barbearia.findUniqueOrThrow({
      where: { id: agendamento.barbeariaId },
      select: { lembreteAntecedenciaHoras: true },
    });
    const dados: DadosDoLembrete = { agendamentoId: agendamento.id };
    await fila.agendar(TRABALHO_LEMBRETE, dados, {
      quando: momentoDoLembrete(
        dateParaData(agendamento.data),
        dateParaHora(agendamento.horaInicio),
        lembreteAntecedenciaHoras
      ),
      // O horário de um agendamento não muda (remarcar cria outro), então
      // o id basta: reativar um cancelado não duplica o que ainda espera.
      chave: `${TRABALHO_LEMBRETE}:${agendamento.id}`,
    });
  } catch (erro) {
    log.error({ err: erro, agendamentoId: agendamento.id }, "lembrete não agendado");
  }
}

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  // `@db.Date` chega como meia-noite UTC: formatar em UTC é ler o dia
  // gravado, sem o fuso da máquina puxar pra véspera.
  timeZone: "UTC",
});

// O tratador. Cada saída antecipada é um "não há o que mandar" e
// termina sem erro; só a falha no envio lança — é o único caso em que
// o pg-boss repetir ajuda.
export async function enviarLembrete(
  { agendamentoId }: DadosDoLembrete,
  { canal, log, agora = () => new Date() }: { canal: CanalDeMensagem; log: Log; agora?: () => Date }
): Promise<void> {
  const agendamento = await prisma.agendamento.findUnique({
    where: { id: agendamentoId },
    include: {
      cliente: { select: { nome: true, email: true } },
      barbearia: { select: { nome: true } },
      barbeiro: { select: { nome: true } },
      servicos: { include: { servico: { select: { nome: true } } } },
    },
  });
  // Sumiu: a barbearia foi apagada e levou o agendamento junto.
  if (!agendamento) return;
  if (!lembraDe(agendamento.status)) return;

  const data = dateParaData(agendamento.data);
  const hora = dateParaHora(agendamento.horaInicio);
  if (agora() >= instanteNaBarbearia(data, hora)) return;

  // Antes de reivindicar a marca: marcar sem mandar impediria o lembrete
  // de sair se o e-mail entrar depois e o trabalho for agendado de novo.
  const email = agendamento.cliente.email;
  if (!email) {
    log.info({ agendamentoId }, "lembrete não enviado: cliente sem e-mail");
    return;
  }

  // A marca é reivindicada antes do envio, e o status vai no WHERE: um
  // cancelamento que commitou depois da leitura acima ganha. `count` 0 =
  // já lembrado (o pg-boss repetiu um trabalho que tinha mandado) ou
  // cancelado no meio — nos dois casos, nada a fazer.
  const { count } = await prisma.agendamento.updateMany({
    where: { id: agendamentoId, status: { in: [...STATUS_QUE_LEMBRA] }, lembreteEnviadoEm: null },
    data: { lembreteEnviadoEm: new Date() },
  });
  if (count === 0) return;

  const servicos = agendamento.servicos.map((s) => s.servico.nome).join(" + ");
  const primeiroNome = agendamento.cliente.nome.split(" ")[0];
  try {
    await canal.enviar({
      para: email,
      assunto: `Lembrete: seu horário na ${agendamento.barbearia.nome}`,
      texto:
        `Olá, ${primeiroNome}! Passando pra lembrar do seu horário na ` +
        `${agendamento.barbearia.nome}: ${DIA_DA_SEMANA.format(agendamento.data)}, às ${hora}, ` +
        `com ${agendamento.barbeiro.nome} (${servicos}).\n\n` +
        `Se não puder ir, avise a barbearia.`,
    });
  } catch (erro) {
    // Devolve a marca pra repetição do pg-boss conseguir mandar.
    await prisma.agendamento.updateMany({
      where: { id: agendamentoId },
      data: { lembreteEnviadoEm: null },
    });
    throw erro;
  }
  log.info({ agendamentoId }, "lembrete enviado");
}

export function registrarLembrete(
  fila: Fila,
  deps: { canal: CanalDeMensagem; log: Log }
): Promise<void> {
  return fila.trabalhar<DadosDoLembrete>(TRABALHO_LEMBRETE, (dados) => enviarLembrete(dados, deps));
}
