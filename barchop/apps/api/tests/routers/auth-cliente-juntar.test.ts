import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria, Mensagem } from "../../src/lib/canal";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import { QUINTA } from "../helpers/datas";
import { decodificarPayload } from "../helpers/decodificar-token";
import type { App } from "../../src/tipos";

// Quem agendou sem conta e depois cria a conta com o mesmo telefone
// (06/11). O agendamento público cria o cadastro pelo telefone, sem
// e-mail e sem senha; a conta nova acha esse cadastro e, até aqui,
// recusava com telefone_ja_cadastrado. O telefone nunca é provado (o
// código só sai por e-mail), então juntar pelo número sozinho seria
// entregar o histórico de outra pessoa. Junta só com prova:
//   A) todos os horários do cadastro foram marcados pela página com o
//      e-mail que acabou de ser provado;
//   B) o token que a criação do agendamento devolve a quem marcou, e o
//      cadastro nasceu nesse agendamento (é o único).
// Fora disso, a mesma recusa de sempre.

const SENHA = "senha-forte-123";
const EMAIL = "joao@exemplo.com";
const TELEFONE = "11999998888";

function canalSoDeEmail(): CanalDeMemoria {
  const enviadas: Mensagem[] = [];
  return {
    nome: "email",
    destinos: ["email"],
    enviadas,
    async enviar(mensagem) {
      enviadas.push(mensagem);
    },
  };
}

function codigoEnviadoPara(app: App, para: string): string {
  const mensagem = (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === para).at(-1);
  const codigo = mensagem?.texto.match(/\b(\d{6})\b/)?.[1];
  if (!codigo) throw new Error(`nenhum código enviado para ${para}`);
  return codigo;
}

async function prepararAgenda(app: App, sufixo = "um") {
  const barbearia = await criarBarbeariaComToken(app, sufixo);
  await app.inject({
    method: "PUT",
    url: "/barbearias/me/horarios",
    headers: auth(barbearia.token),
    payload: {
      horarios: [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
        diaSemana,
        horaAbertura: "09:00",
        horaFechamento: "18:00",
      })),
    },
  });
  const servico = (
    await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(barbearia.token),
      payload: { nome: "Corte", duracaoMinutos: 45, preco: "45.00" },
    })
  ).json();
  return { ...barbearia, servico };
}

type Agenda = Awaited<ReturnType<typeof prepararAgenda>>;

async function agendarPelaPagina(
  app: App,
  agenda: Agenda,
  { horaInicio = "10:00", email, telefone = TELEFONE }: { horaInicio?: string; email?: string; telefone?: string } = {}
): Promise<{ id: string; tokenDaConta: string }> {
  const resposta = await app.inject({
    method: "POST",
    url: `/barbearias/${agenda.slug}/agendamentos`,
    payload: {
      barbeiroId: agenda.barbeiroId,
      servicoIds: [agenda.servico.id],
      data: QUINTA,
      horaInicio,
      cliente: { nome: "João da Silva", telefone, ...(email ? { email } : {}) },
    },
  });
  if (resposta.statusCode !== 201) {
    throw new Error(`agendamento falhou: ${resposta.statusCode} ${resposta.body}`);
  }
  return resposta.json();
}

async function criarConta(app: App, slug: string, extra: Record<string, unknown> = {}) {
  await app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/codigo`,
    payload: { email: EMAIL },
  });
  const codigo = codigoEnviadoPara(app, EMAIL);
  return app.inject({
    method: "POST",
    url: `/barbearias/${slug}/auth/cliente/senha`,
    payload: { email: EMAIL, codigo, senha: SENHA, nome: "Outro nome", telefone: TELEFONE, ...extra },
  });
}

async function cadastroDoTelefone(barbeariaId: string) {
  return prisma.cliente.findUniqueOrThrow({
    where: { barbeariaId_telefone: { barbeariaId, telefone: "(11) 99999-8888" } },
  });
}

function esperarRecusa(resposta: { statusCode: number; json: () => { erro: string } }) {
  expect(resposta.statusCode).toBe(422);
  expect(resposta.json().erro).toBe("telefone_ja_cadastrado");
}

describe("A: horários marcados com o e-mail provado", () => {
  it("junta: a conta fica no cadastro do telefone, com o nome dele, e entra com a senha", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    const primeiro = await agendarPelaPagina(app, agenda, { email: EMAIL });
    // Maiúsculas no agendamento: o e-mail é comparado já normalizado.
    await agendarPelaPagina(app, agenda, { email: "Joao@Exemplo.com", horaInicio: "11:00" });
    const antes = await cadastroDoTelefone(agenda.barbeariaId);

    const resposta = await criarConta(app, agenda.slug);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.id).toBe(antes.id);
    expect(await prisma.cliente.count({ where: { barbeariaId: agenda.barbeariaId } })).toBe(1);
    const depois = await cadastroDoTelefone(agenda.barbeariaId);
    expect(depois.email).toBe(EMAIL);
    expect(depois.senhaHash).not.toBeNull();
    // Mesma regra de sempre: o nome digitado não renomeia o cadastro.
    expect(depois.nome).toBe("João da Silva");

    const meus = await app.inject({
      method: "GET",
      url: "/clientes/me/agendamentos",
      headers: auth(resposta.json().token),
    });
    expect(meus.statusCode).toBe(200);
    expect(JSON.stringify(meus.json())).toContain(primeiro.id);

    const login = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/auth/cliente/login`,
      payload: { email: EMAIL, senha: SENHA },
    });
    expect(login.statusCode).toBe(200);
    await app.close();
  });

  it("recusa quando um dos horários foi marcado sem e-mail", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda, { email: EMAIL });
    await agendarPelaPagina(app, agenda, { horaInicio: "11:00" });

    esperarRecusa(await criarConta(app, agenda.slug));
    const cadastro = await cadastroDoTelefone(agenda.barbeariaId);
    expect(cadastro.email).toBeNull();
    expect(cadastro.senhaHash).toBeNull();
    await app.close();
  });

  it("recusa quando o horário foi marcado com outro e-mail", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda, { email: "maria@exemplo.com" });

    esperarRecusa(await criarConta(app, agenda.slug));
    await app.close();
  });

  it("recusa quando o cadastro tem horário marcado pelo balcão", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda, { email: EMAIL });
    const cadastro = await cadastroDoTelefone(agenda.barbeariaId);
    const balcao = await app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        clienteId: cadastro.id,
        servicoIds: [agenda.servico.id],
        data: QUINTA,
        horaInicio: "14:00",
      },
    });
    expect(balcao.statusCode).toBe(201);

    esperarRecusa(await criarConta(app, agenda.slug));
    await app.close();
  });

  it("recusa quando o cadastro tem assinatura", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda, { email: EMAIL });
    const cadastro = await cadastroDoTelefone(agenda.barbeariaId);
    const plano = await prisma.planoDeAssinatura.create({
      data: {
        barbeariaId: agenda.barbeariaId,
        nome: "Corte ilimitado",
        ciclo: "mensal",
        precoCentavos: 12000,
        fixoPorAtendimentoCentavos: 2500,
      },
    });
    await prisma.assinaturaDoCliente.create({
      data: {
        barbeariaId: agenda.barbeariaId,
        planoId: plano.id,
        clienteId: cadastro.id,
        forma: "no_balcao",
        precoCentavos: 12000,
        ciclo: "mensal",
      },
    });

    esperarRecusa(await criarConta(app, agenda.slug));
    await app.close();
  });

  it("cadastro do balcão sem horário nenhum continua recusado", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(agenda.token),
      payload: { nome: "João do balcão", telefone: TELEFONE },
    });

    esperarRecusa(await criarConta(app, agenda.slug));
    await app.close();
  });
});

describe("B: o token que a criação do agendamento devolve", () => {
  it("a criação devolve um token de tipo próprio, que vence em 1 hora", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);

    const { id, tokenDaConta } = await agendarPelaPagina(app, agenda);

    const payload = decodificarPayload(tokenDaConta);
    expect(payload.tipo).toBe("conta_do_agendamento");
    expect(payload.agendamentoId).toBe(id);
    const agora = Math.floor(Date.now() / 1000);
    expect(payload.exp).toBeGreaterThan(agora + 3500);
    expect(payload.exp).toBeLessThanOrEqual(agora + 3600);
    await app.close();
  });

  it("o token não abre a conta do cliente nem o link do horário", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    const { tokenDaConta } = await agendarPelaPagina(app, agenda);

    const conta = await app.inject({ method: "GET", url: "/clientes/me", headers: auth(tokenDaConta) });
    expect(conta.statusCode).toBe(401);
    const lembrete = await app.inject({ method: "GET", url: `/lembretes/${tokenDaConta}` });
    expect(lembrete.statusCode).toBe(401);
    await app.close();
  });

  it("junta o cadastro que nasceu nesse agendamento, mesmo marcado sem e-mail", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    const { tokenDaConta } = await agendarPelaPagina(app, agenda);
    const antes = await cadastroDoTelefone(agenda.barbeariaId);

    const resposta = await criarConta(app, agenda.slug, { tokenDaConta });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().cliente.id).toBe(antes.id);
    expect((await cadastroDoTelefone(agenda.barbeariaId)).email).toBe(EMAIL);
    await app.close();
  });

  it("recusa quando o cadastro já tinha outro horário", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda);
    const { tokenDaConta } = await agendarPelaPagina(app, agenda, { horaInicio: "11:00" });

    esperarRecusa(await criarConta(app, agenda.slug, { tokenDaConta }));
    await app.close();
  });

  it("recusa o token de um agendamento de outro telefone", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    await agendarPelaPagina(app, agenda);
    const { tokenDaConta } = await agendarPelaPagina(app, agenda, {
      horaInicio: "11:00",
      telefone: "11977776666",
    });

    esperarRecusa(await criarConta(app, agenda.slug, { tokenDaConta }));
    await app.close();
  });

  it("recusa o token de um agendamento de outra barbearia", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const um = await prepararAgenda(app, "um");
    const dois = await prepararAgenda(app, "dois");
    await agendarPelaPagina(app, um);
    const { tokenDaConta } = await agendarPelaPagina(app, dois);

    esperarRecusa(await criarConta(app, um.slug, { tokenDaConta }));
    await app.close();
  });

  it("recusa token vencido, token de outro tipo e lixo", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    const { id } = await agendarPelaPagina(app, agenda);
    const agora = Math.floor(Date.now() / 1000);

    const vencido = app.jwt.sign({ tipo: "conta_do_agendamento", agendamentoId: id, exp: agora - 60 });
    const doLembrete = app.jwt.sign({ tipo: "lembrete", agendamentoId: id, exp: agora + 3600 });
    for (const tokenDaConta of [vencido, doLembrete, "lixo"]) {
      esperarRecusa(await criarConta(app, agenda.slug, { tokenDaConta }));
    }
    expect((await cadastroDoTelefone(agenda.barbeariaId)).email).toBeNull();
    await app.close();
  });

  it("código errado responde codigo_invalido, com ou sem token", async () => {
    const app = buildApp({ canal: canalSoDeEmail() });
    const agenda = await prepararAgenda(app);
    const { tokenDaConta } = await agendarPelaPagina(app, agenda);

    const resposta = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/auth/cliente/senha`,
      payload: { email: EMAIL, codigo: "000000", senha: SENHA, nome: "João", telefone: TELEFONE, tokenDaConta },
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("codigo_invalido");
    await app.close();
  });
});
