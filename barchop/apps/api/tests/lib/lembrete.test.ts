import { randomUUID } from "node:crypto";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import { canalDeMemoria, type CanalDeMensagem } from "../../src/lib/canal";
import { filaDoPgBoss, urlDoPg } from "../../src/lib/fila";
import {
  criarLinkDoLembrete,
  enviarLembrete,
  instanteNaBarbearia,
  momentoDoLembrete,
  registrarLembrete,
  telefoneParaWhatsApp,
} from "../../src/lib/lembrete";
import { QUINTA } from "../helpers/datas";
import { marcarPeloPainel, prepararAgenda } from "../helpers/agenda";

const log = { info: () => {}, error: () => {} };

describe("instanteNaBarbearia", () => {
  it("lê data e hora no fuso da barbearia", () => {
    expect(instanteNaBarbearia("2026-10-10", "10:00").toISOString()).toBe(
      "2026-10-10T13:00:00.000Z"
    );
  });

  it("respeita o fuso de cada data, não um deslocamento fixo", () => {
    // Dezembro de 2018 ainda tinha horário de verão em São Paulo (-02:00).
    expect(instanteNaBarbearia("2018-12-01", "10:00").toISOString()).toBe(
      "2018-12-01T12:00:00.000Z"
    );
  });
});

describe("telefoneParaWhatsApp", () => {
  it("só dígitos, com o 55 do Brasil na frente", () => {
    expect(telefoneParaWhatsApp("(11) 99999-8888")).toBe("5511999998888");
    expect(telefoneParaWhatsApp("(11) 3333-4444")).toBe("551133334444");
  });
});

describe("momentoDoLembrete", () => {
  it("é o início do horário menos a antecedência", () => {
    expect(momentoDoLembrete("2026-10-10", "10:00", 24).toISOString()).toBe(
      "2026-10-09T13:00:00.000Z"
    );
    expect(momentoDoLembrete("2026-10-10", "10:00", 2).toISOString()).toBe(
      "2026-10-10T11:00:00.000Z"
    );
  });
});

describe("enviarLembrete", () => {
  // Antes do horário: o relógio do tratador é injetado.
  const antes = new Date("2000-01-01T00:00:00.000Z");

  async function cenario({ email }: { email?: string } = { email: "joao@exemplo.com" }) {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    return { app, agenda, agendamento };
  }

  it("manda o e-mail pro cliente com a barbearia, o dia, a hora e com quem", async () => {
    const { agendamento } = await cenario();
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => antes });

    expect(canal.enviadas).toHaveLength(1);
    const [mensagem] = canal.enviadas;
    expect(mensagem!.para).toBe("joao@exemplo.com");
    expect(mensagem!.assunto).toContain("Barbearia um");
    expect(mensagem!.texto).toContain("10:00");
    expect(mensagem!.texto).toContain("Barbeiro um");
    expect(mensagem!.texto).toContain("Corte");
    const [dia, mes] = [QUINTA.slice(8, 10), QUINTA.slice(5, 7)];
    expect(mensagem!.texto).toContain(`${dia}/${mes}`);

    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.lembreteEnviadoEm).not.toBeNull();
  });

  it("não manda duas vezes: o pg-boss repete o trabalho e o cliente receberia de novo", async () => {
    const { agendamento } = await cenario();
    const canal = canalDeMemoria();
    const deps = { canal, log, agora: () => antes };

    await enviarLembrete({ agendamentoId: agendamento.id }, deps);
    await enviarLembrete({ agendamentoId: agendamento.id }, deps);

    expect(canal.enviadas).toHaveLength(1);
  });

  it("agendamento cancelado não recebe lembrete", async () => {
    const { agendamento } = await cenario();
    await prisma.agendamento.update({ where: { id: agendamento.id }, data: { status: "cancelado" } });
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => antes });

    expect(canal.enviadas).toEqual([]);
  });

  it("cliente sem e-mail: não manda, não falha e não marca como enviado", async () => {
    // Não marcar é o que deixa o lembrete sair se o e-mail entrar depois
    // e o trabalho for agendado de novo.
    const { agendamento } = await cenario({});
    const canal = canalDeMemoria();

    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => antes });

    expect(canal.enviadas).toEqual([]);
    const gravado = await prisma.agendamento.findUniqueOrThrow({ where: { id: agendamento.id } });
    expect(gravado.lembreteEnviadoEm).toBeNull();
  });

  it("horário que já começou não recebe lembrete", async () => {
    const { agendamento } = await cenario();
    const canal = canalDeMemoria();
    const depois = new Date(instanteNaBarbearia(QUINTA, "10:00").getTime() + 60_000);

    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => depois });

    expect(canal.enviadas).toEqual([]);
  });

  it("agendamento que sumiu (barbearia apagada) termina sem erro", async () => {
    // Lançar faria o pg-boss repetir um trabalho que nunca vai dar certo.
    const canal = canalDeMemoria();

    await expect(
      enviarLembrete({ agendamentoId: randomUUID() }, { canal, log, agora: () => antes })
    ).resolves.toBeUndefined();
    expect(canal.enviadas).toEqual([]);
  });

  it("envio que falha lança e devolve a marca: a repetição do pg-boss manda", async () => {
    const { agendamento } = await cenario();
    const quebrado: CanalDeMensagem = {
      nome: "quebrado",
      destinos: ["email"],
      async enviar() {
        throw new Error("provedor fora do ar");
      },
    };

    await expect(
      enviarLembrete({ agendamentoId: agendamento.id }, { canal: quebrado, log, agora: () => antes })
    ).rejects.toThrow(/fora do ar/);

    const canal = canalDeMemoria();
    await enviarLembrete({ agendamentoId: agendamento.id }, { canal, log, agora: () => antes });
    expect(canal.enviadas).toHaveLength(1);
  });
});

describe("o link de confirmar ou cancelar", () => {
  it("aponta pra página do lembrete, com um token que vence no início do horário", async () => {
    const app = buildApp();
    await app.ready();
    const inicio = instanteNaBarbearia(QUINTA, "10:00");

    const link = criarLinkDoLembrete(app, "http://localhost:3000/")!;
    const url = link({ agendamentoId: "a1", slug: "barbearia-um", inicio });

    const prefixo = "http://localhost:3000/barbearia-um/lembrete/";
    expect(url.startsWith(prefixo)).toBe(true);
    const token = url.slice(prefixo.length);
    expect(app.jwt.verify(token)).toMatchObject({
      tipo: "lembrete",
      agendamentoId: "a1",
      exp: Math.floor(inicio.getTime() / 1000),
    });
  });

  it("sem URL do site configurada, não há link", () => {
    expect(criarLinkDoLembrete(buildApp(), undefined)).toBeUndefined();
  });

  it("o e-mail leva o link", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const canal = canalDeMemoria();
    const vistos: unknown[] = [];

    await enviarLembrete(
      { agendamentoId: agendamento.id },
      {
        canal,
        log,
        agora: () => new Date("2000-01-01T00:00:00.000Z"),
        link: (dados) => {
          vistos.push(dados);
          return "https://exemplo.com/barbearia-um/lembrete/TOKEN";
        },
      }
    );

    expect(vistos).toEqual([
      { agendamentoId: agendamento.id, slug: "barbearia-um", inicio: instanteNaBarbearia(QUINTA, "10:00") },
    ]);
    expect(canal.enviadas[0]!.texto).toContain("https://exemplo.com/barbearia-um/lembrete/TOKEN");
  });
});

describe("lembrete no pg-boss de verdade", () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = new PgBoss({ connectionString: urlDoPg(process.env.DATABASE_URL ?? ""), max: 2 });
    boss.on("error", () => {});
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
  });

  it("o trabalho agendado chega no tratador e o e-mail sai", async () => {
    // O único caso que passa pelo JSON do banco e pela assinatura real
    // do `work`: os outros chamam o tratador direto.
    const app = buildApp();
    const agenda = await prepararAgenda(app, { email: "joao@exemplo.com" });
    const agendamento = await marcarPeloPainel(app, agenda, { data: QUINTA, horaInicio: "10:00" });
    const canal = canalDeMemoria();
    const fila = filaDoPgBoss(boss, { segundosEntreBuscas: 0.5 });

    await registrarLembrete(fila, { canal, log });
    await fila.agendar("lembrete", { agendamentoId: agendamento.id });

    const limite = Date.now() + 10_000;
    while (canal.enviadas.length === 0 && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(canal.enviadas.map((m) => m.para)).toEqual(["joao@exemplo.com"]);
  });
});
