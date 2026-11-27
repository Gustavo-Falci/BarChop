import { describe, expect, it, vi } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import {
  conferirAgendaCheia,
  CRON_DA_AGENDA_CHEIA,
  limparAgendasQueVagaram,
  pedirConferenciaDaAgenda,
  registrarAgendaCheia,
  TRABALHO_AGENDA_CHEIA,
  TRABALHO_LIMPAR_AGENDAS_CHEIAS,
} from "../../src/lib/agenda-cheia-avisos";
import { canalDeMemoria, type CanalDeMensagem, type CanalDeMemoria } from "../../src/lib/canal";
import { filaDeMemoria } from "../../src/lib/fila";
import { agoraNaBarbearia, dataParaDate, dateParaData, instanteNaBarbearia } from "../../src/lib/horas";
import { criarMembroComToken } from "../helpers/barbearia";
import { encher, JANELA_CURTA, prepararJanelaCurta, type Agenda } from "../helpers/agenda";

// O aviso de agenda cheia pro dono (plano agenda-cheia-dono, marco 2 do
// PRD agenda-cheia). Quando um agendamento lota a barbearia — o link não
// oferece mais horário nenhum até o fim da janela —, os donos ativos
// recebem o sininho e, os que têm e-mail, o e-mail. Um aviso por
// lotação, no máximo um por dia. A conta é a mesma da página pública.

const UM_DIA = 24 * 60 * 60 * 1000;
const HOJE = agoraNaBarbearia().data;
const diaMais = (dias: number) => dateParaData(new Date(dataParaDate(HOJE).getTime() + dias * UM_DIA));
// 8h de São Paulo: antes da hora aberta (9 às 10), nada do dia passou.
const AS_8H = (dia: string) => instanteNaBarbearia(dia, "08:00");
const AGORA = AS_8H(HOJE);
const AMANHA = AS_8H(diaMais(1));
const ddmm = (dia: string) => dia.slice(8, 10) + "/" + dia.slice(5, 7);

function silencioso() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function conferir(agenda: Agenda, agora: Date, canal: CanalDeMensagem, log = silencioso(), urlDoPainel?: string) {
  return conferirAgendaCheia(agenda.barbeariaId, { canal, log, agora, urlDoPainel });
}

async function sininhos(barbeiroId: string) {
  return prisma.notificacao.findMany({ where: { barbeiroId }, orderBy: { criadaEm: "asc" } });
}

async function preparar(sufixo = "um") {
  const app = buildApp({ canal: canalDeMemoria() });
  const agenda = await prepararJanelaCurta(app, { sufixo });
  return { app, agenda };
}

describe("conferirAgendaCheia", () => {
  it("lotou: sininho pro dono e e-mail com até quando está cheia e o dia que abre", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal, silencioso(), "https://painel.exemplo.com");

    const ultimo = ddmm(diaMais(JANELA_CURTA));
    const proximo = ddmm(diaMais(JANELA_CURTA + 1));
    const [aviso, ...resto] = await sininhos(agenda.barbeiroId);
    expect(resto).toHaveLength(0);
    expect(aviso).toMatchObject({
      tipo: "agendamento",
      titulo: "Agenda cheia",
      texto: `Todos os horários até ${ultimo} estão reservados. O dia ${proximo} abre amanhã.`,
      link: "/painel/configuracoes/horarios",
    });

    expect(canal.enviadas).toHaveLength(1);
    const [email] = canal.enviadas;
    expect(email!.para).toBe("um@exemplo.com");
    expect(email!.assunto).toBe("A agenda da sua barbearia está cheia");
    expect(email!.texto).toContain(ultimo);
    expect(email!.texto).toContain(`O dia ${proximo} abre amanhã`);
    expect(email!.texto).toContain("https://painel.exemplo.com/painel/configuracoes/horarios");

    const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(barbearia.agendaCheiaDesde).toEqual(AGORA);
    expect(dateParaData(barbearia.agendaCheiaAvisadaEm!)).toBe(HOJE);
  });

  it("sem o endereço do painel, o e-mail cita o caminho sem link", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal);

    expect(canal.enviadas[0]!.texto).toContain("Configurações › Horários");
    expect(canal.enviadas[0]!.texto).not.toContain("http");
  });

  it("conferir de novo com a agenda ainda cheia não repete", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal);
    await conferir(agenda, new Date(AGORA.getTime() + 60_000), canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(1);
    expect(canal.enviadas).toHaveLength(1);
  });

  it("com horário livre, não avisa e não marca", async () => {
    const { agenda } = await preparar();
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(0);
    expect(canal.enviadas).toHaveLength(0);
    const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(barbearia.agendaCheiaDesde).toBeNull();
  });

  it("sem limite de dias, não avisa", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    await prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { janelaDias: null } });
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(0);
    expect(canal.enviadas).toHaveLength(0);
  });

  it("vagou e lotou de novo no mesmo dia: um aviso só", async () => {
    const { agenda } = await preparar();
    const [primeiro] = await encher(agenda);
    const canal = canalDeMemoria();
    await conferir(agenda, AGORA, canal);

    await prisma.agendamento.update({ where: { id: primeiro!.id }, data: { status: "cancelado" } });
    await conferir(agenda, new Date(AGORA.getTime() + 60_000), canal);
    const vagou = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(vagou.agendaCheiaDesde).toBeNull();

    await prisma.agendamento.update({ where: { id: primeiro!.id }, data: { status: "confirmado" } });
    await conferir(agenda, new Date(AGORA.getTime() + 120_000), canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(1);
    expect(canal.enviadas).toHaveLength(1);
    // A lotação nova fica marcada, mesmo sem aviso: só vagar e lotar de
    // novo noutro dia avisa outra vez.
    const lotou = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(lotou.agendaCheiaDesde).not.toBeNull();
  });

  it("vagou hoje e lotou amanhã: avisa de novo", async () => {
    const { agenda } = await preparar();
    // Um dia além da janela: amanhã a janela anda e ainda está cheia.
    await encher(agenda, { dias: JANELA_CURTA + 2 });
    const canal = canalDeMemoria();
    await conferir(agenda, AGORA, canal);

    const deAmanha = await prisma.agendamento.findFirstOrThrow({
      where: { barbeariaId: agenda.barbeariaId, data: dataParaDate(diaMais(1)) },
    });
    await prisma.agendamento.update({ where: { id: deAmanha.id }, data: { status: "cancelado" } });
    await conferir(agenda, new Date(AGORA.getTime() + 60_000), canal);

    await prisma.agendamento.update({ where: { id: deAmanha.id }, data: { status: "confirmado" } });
    await conferir(agenda, AMANHA, canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(2);
    expect(canal.enviadas).toHaveLength(2);
  });

  it("só os donos ativos recebem; e-mail só pra quem tem", async () => {
    const { app, agenda } = await preparar();
    // Quem não atende não entra na conta da agenda: a do teste continua
    // sendo só a do dono que atende.
    const naoAtende = { atende: false };
    const socio = await criarMembroComToken(app, agenda.barbeariaId, "dono", "socio");
    await prisma.barbeiro.update({ where: { id: socio.barbeiroId }, data: { ...naoAtende, email: null } });
    const recepcao = await criarMembroComToken(app, agenda.barbeariaId, "recepcao", "rec");
    const profissional = await criarMembroComToken(app, agenda.barbeariaId, "profissional", "pro");
    await prisma.barbeiro.update({ where: { id: profissional.barbeiroId }, data: naoAtende });
    const inativo = await criarMembroComToken(app, agenda.barbeariaId, "dono", "inativo");
    await prisma.barbeiro.update({ where: { id: inativo.barbeiroId }, data: { ...naoAtende, ativo: false } });
    await encher(agenda);
    const canal = canalDeMemoria();

    await conferir(agenda, AGORA, canal);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(1);
    expect(await sininhos(socio.barbeiroId)).toHaveLength(1);
    expect(await sininhos(recepcao.barbeiroId)).toHaveLength(0);
    expect(await sininhos(profissional.barbeiroId)).toHaveLength(0);
    expect(await sininhos(inativo.barbeiroId)).toHaveLength(0);
    expect(canal.enviadas.map((m) => m.para)).toEqual(["um@exemplo.com"]);
  });

  it("o e-mail que falha fica no log e não desfaz o sininho nem a marca", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    const canal: CanalDeMensagem = {
      nome: "quebrado",
      destinos: ["email"],
      enviar: async () => {
        throw new Error("Resend respondeu 500");
      },
    };
    const log = silencioso();

    await conferir(agenda, AGORA, canal, log);

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(1);
    expect(log.warn).toHaveBeenCalled();
    const barbearia = await prisma.barbearia.findUniqueOrThrow({ where: { id: agenda.barbeariaId } });
    expect(barbearia.agendaCheiaDesde).not.toBeNull();
  });
});

describe("limparAgendasQueVagaram (00:05)", () => {
  it("apaga a marca de quem voltou a ter horário e mantém a de quem segue cheia, sem avisar", async () => {
    const { agenda: vagou } = await preparar("vagou");
    const { agenda: cheia } = await preparar("cheia");
    // Amanhã, a janela abre um dia que só a "cheia" tem ocupado.
    await encher(vagou);
    await encher(cheia, { dias: JANELA_CURTA + 2 });
    const canal: CanalDeMemoria = canalDeMemoria();
    await conferir(vagou, AGORA, canal);
    await conferir(cheia, AGORA, canal);
    expect(canal.enviadas).toHaveLength(2);

    await limparAgendasQueVagaram({ canal, log: silencioso(), agora: AMANHA });

    const [depoisVagou, depoisCheia] = await Promise.all([
      prisma.barbearia.findUniqueOrThrow({ where: { id: vagou.barbeariaId } }),
      prisma.barbearia.findUniqueOrThrow({ where: { id: cheia.barbeariaId } }),
    ]);
    expect(depoisVagou.agendaCheiaDesde).toBeNull();
    expect(depoisCheia.agendaCheiaDesde).not.toBeNull();
    expect(canal.enviadas).toHaveLength(2);
    expect(await sininhos(cheia.barbeiroId)).toHaveLength(1);
  });
});

describe("na fila", () => {
  it("pedirConferenciaDaAgenda enfileira a conferência da barbearia, sem chave", async () => {
    const fila = filaDeMemoria();

    await pedirConferenciaDaAgenda({ fila, log: silencioso() }, "barbearia-1");
    await pedirConferenciaDaAgenda({ fila, log: silencioso() }, "barbearia-1");

    expect(fila.pendentes.filter((p) => p.trabalho === TRABALHO_AGENDA_CHEIA)).toHaveLength(2);
    expect(fila.pendentes[0]).toMatchObject({ dados: { barbeariaId: "barbearia-1" }, chave: undefined });
  });

  it("a fila que falha fica no log e não derruba quem pediu", async () => {
    const log = silencioso();
    const fila = {
      ...filaDeMemoria(),
      agendar: async () => {
        throw new Error("banco fora");
      },
    };

    await expect(pedirConferenciaDaAgenda({ fila, log }, "barbearia-1")).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalled();
  });

  it("registra o trabalho da conferência e a limpeza às 00:05", async () => {
    const fila = filaDeMemoria();

    await registrarAgendaCheia(fila, { canal: canalDeMemoria(), log: silencioso() });

    expect(CRON_DA_AGENDA_CHEIA).toBe("5 0 * * *");
    expect(fila.repeticoes).toEqual([{ trabalho: TRABALHO_LIMPAR_AGENDAS_CHEIAS, cron: CRON_DA_AGENDA_CHEIA }]);
  });

  it("o trabalho da fila confere a barbearia que veio nos dados", async () => {
    const { agenda } = await preparar();
    await encher(agenda);
    const fila = filaDeMemoria();
    const canal = canalDeMemoria();
    await registrarAgendaCheia(fila, { canal, log: silencioso() });

    await pedirConferenciaDaAgenda({ fila, log: silencioso() }, agenda.barbeariaId);
    await fila.rodarVencidos(new Date(Date.now() + 1000));

    expect(await sininhos(agenda.barbeiroId)).toHaveLength(1);
    expect(canal.enviadas).toHaveLength(1);
  });
});
