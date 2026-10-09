import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { CATEGORIAS_DE_SERVICO, COMODIDADES, FORMAS_DE_PAGAMENTO } from "@barchop/formato";
import { buildApp } from "../../src/app";
import { agoraNaBarbearia } from "../../src/lib/horas";
import type { App } from "../../src/tipos";
import { auth } from "../helpers/barbearia";
import { prepararAgenda, type Agenda } from "../helpers/agenda";

// A página pública rica (Onda 1, bloco E1): contatos, comodidades,
// formas de pagamento, serviços por categoria e os próximos horários
// livres de cada serviço. Capa e fotos entram no E2, com o upload.

function patch(app: App, agenda: Agenda, payload: Record<string, unknown>) {
  return app.inject({ method: "PATCH", url: "/barbearias/me", headers: auth(agenda.token), payload });
}

describe("contatos, comodidades e pagamento", () => {
  it("o dono grava, e a página pública mostra", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const resposta = await patch(app, agenda, {
      whatsapp: "11988887777",
      instagram: "gr.barber",
      comodidades: ["wifi", "cafe"],
      formasDePagamento: ["pix", "credito"],
    });

    expect(resposta.statusCode).toBe(200);
    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();
    expect(publico).toMatchObject({
      whatsapp: "(11) 98888-7777",
      instagram: "gr.barber",
      comodidades: ["wifi", "cafe"],
      formasDePagamento: ["pix", "credito"],
    });
  });

  it("barbearia nova nasce sem nada disso", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const publico = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}` })).json();

    expect(publico).toMatchObject({ whatsapp: null, instagram: null, comodidades: [], formasDePagamento: [] });
  });

  it("instagram é o @, sem o @ e sem URL: a página monta o link", async () => {
    // Aceitar URL deixaria qualquer endereço virar link na página mais
    // pública do produto.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const ruim of ["@gr.barber", "https://instagram.com/gr", "javascript:alert(1)", "a".repeat(31)]) {
      expect((await patch(app, agenda, { instagram: ruim })).statusCode).toBe(400);
    }
  });

  it("comodidade ou forma de pagamento fora da lista, ou repetida, é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    expect((await patch(app, agenda, { comodidades: ["piscina"] })).statusCode).toBe(400);
    expect((await patch(app, agenda, { comodidades: ["wifi", "wifi"] })).statusCode).toBe(400);
    expect((await patch(app, agenda, { formasDePagamento: ["cheque"] })).statusCode).toBe(400);
  });

  it("o banco aceita toda a lista do código, e nada fora dela", async () => {
    // A lista mora no @barchop/formato e o CHECK na migration: este teste
    // é o que impede os dois de divergirem.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    await prisma.barbearia.update({
      where: { id: agenda.barbeariaId },
      data: { comodidades: [...COMODIDADES], formasDePagamento: [...FORMAS_DE_PAGAMENTO] },
    });
    await expect(
      prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { comodidades: ["piscina"] } })
    ).rejects.toThrow();
    await expect(
      prisma.barbearia.update({ where: { id: agenda.barbeariaId }, data: { formasDePagamento: ["cheque"] } })
    ).rejects.toThrow();
  });
});

describe("categoria do serviço", () => {
  it("o serviço guarda a categoria da lista, e a lista pública a devolve", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const criado = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00", categoria: "barba" },
    });

    expect(criado.statusCode).toBe(201);
    expect(criado.json().categoria).toBe("barba");
    const publicos = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/servicos` })).json().servicos;
    expect(publicos.find((s: { nome: string }) => s.nome === "Barba").categoria).toBe("barba");
    expect(publicos.find((s: { nome: string }) => s.nome === "Corte").categoria).toBeNull();
  });

  it("categoria fora da lista é 400, no cadastro e na edição", async () => {
    // A categoria era texto livre e virou "CEBELO" na página pública: a
    // lista fechada é a correção, então texto à mão, mesmo parecido com
    // um valor ("Cabelo", com maiúscula), não passa.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const categoria of ["CEBELO", "Cabelo", "", " cabelo "]) {
      const criado = await app.inject({
        method: "POST",
        url: "/servicos",
        headers: auth(agenda.token),
        payload: { nome: "Novo", duracaoMinutos: 30, preco: "30.00", categoria },
      });
      expect(criado.statusCode).toBe(400);

      const editado = await app.inject({
        method: "PATCH",
        url: `/servicos/${agenda.servico.id}`,
        headers: auth(agenda.token),
        payload: { categoria },
      });
      expect(editado.statusCode).toBe(400);
    }
  });

  it("o banco aceita toda a lista do código, e nada fora dela", async () => {
    // A lista mora no @barchop/formato e o CHECK na migration: este teste
    // é o que impede os dois de divergirem.
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    for (const categoria of CATEGORIAS_DE_SERVICO) {
      await prisma.servico.update({ where: { id: agenda.servico.id }, data: { categoria } });
    }
    await expect(
      prisma.servico.update({ where: { id: agenda.servico.id }, data: { categoria: "Cabelo" } })
    ).rejects.toThrow();
  });

  it("o dono troca ou limpa a categoria", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const trocado = await app.inject({
      method: "PATCH",
      url: `/servicos/${agenda.servico.id}`,
      headers: auth(agenda.token),
      payload: { categoria: "cabelo" },
    });
    expect(trocado.json().categoria).toBe("cabelo");

    const limpo = await app.inject({
      method: "PATCH",
      url: `/servicos/${agenda.servico.id}`,
      headers: auth(agenda.token),
      payload: { categoria: null },
    });
    expect(limpo.json().categoria).toBeNull();
  });
});

describe("descrição do serviço", () => {
  it("o serviço guarda a descrição, sem espaços nas pontas, e a lista pública a devolve", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const criado = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { nome: "Barba", duracaoMinutos: 30, preco: "30.00", descricao: "  Navalha e toalha quente \n" },
    });

    expect(criado.statusCode).toBe(201);
    expect(criado.json().descricao).toBe("Navalha e toalha quente");
    const publicos = (await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/servicos` })).json().servicos;
    expect(publicos.find((s: { nome: string }) => s.nome === "Barba").descricao).toBe("Navalha e toalha quente");
    // Sem descrição e sem foto: null, nunca ausente — a tela decide pelo null.
    const corte = publicos.find((s: { nome: string }) => s.nome === "Corte");
    expect(corte.descricao).toBeNull();
    expect(corte.fotoUrl).toBeNull();
  });

  it("só espaço vira null; passar de 300 caracteres é 400", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const base = { nome: "Barba", duracaoMinutos: 30, preco: "30.00" };

    const vazia = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { ...base, descricao: "   " },
    });
    const longa = await app.inject({
      method: "POST",
      url: "/servicos",
      headers: auth(agenda.token),
      payload: { ...base, descricao: "a".repeat(301) },
    });

    expect(vazia.json().descricao).toBeNull();
    expect(longa.statusCode).toBe(400);
  });

  it("o dono troca ou limpa a descrição, e um PATCH sem ela não mexe", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const url = `/servicos/${agenda.servico.id}`;

    const trocado = await app.inject({ method: "PATCH", url, headers: auth(agenda.token), payload: { descricao: "Máquina e tesoura" } });
    const outro = await app.inject({ method: "PATCH", url, headers: auth(agenda.token), payload: { nome: "Corte social" } });
    const limpo = await app.inject({ method: "PATCH", url, headers: auth(agenda.token), payload: { descricao: null } });

    expect(trocado.json().descricao).toBe("Máquina e tesoura");
    expect(outro.json().descricao).toBe("Máquina e tesoura");
    expect(limpo.json().descricao).toBeNull();
  });
});

describe("GET /barbearias/:slug/proximos-horarios", () => {
  async function proximos(app: App, slug: string) {
    const resposta = await app.inject({ method: "GET", url: `/barbearias/${slug}/proximos-horarios` });
    expect(resposta.statusCode).toBe(200);
    return resposta.json().servicos as {
      servicoId: string;
      horarios: { data: string; horaInicio: string }[];
    }[];
  }

  it("os 3 próximos horários livres de cada serviço, no futuro e em ordem", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const [corte] = await proximos(app, agenda.slug);

    expect(corte!.servicoId).toBe(agenda.servico.id);
    expect(corte!.horarios).toHaveLength(3);
    const agora = agoraNaBarbearia();
    const chaves = corte!.horarios.map((h) => `${h.data} ${h.horaInicio}`);
    expect([...chaves].sort()).toEqual(chaves);
    for (const h of corte!.horarios) {
      expect(`${h.data} ${h.horaInicio}` > `${agora.data} ${agora.hora}`).toBe(true);
    }
  });

  it("são os mesmos que a escolha de horário oferece pra aquele dia", async () => {
    // Todo horário mostrado tem que ser marcável: a mesma regra do "qualquer um".
    const app = buildApp();
    const agenda = await prepararAgenda(app);

    const [corte] = await proximos(app, agenda.slug);
    const primeiro = corte!.horarios[0]!;
    const params = new URLSearchParams({ data: primeiro.data });
    params.append("servicoIds", agenda.servico.id);
    const doDia = (
      await app.inject({ method: "GET", url: `/barbearias/${agenda.slug}/disponibilidade?${params}` })
    ).json().horarios as string[];

    const mesmosDias = corte!.horarios.filter((h) => h.data === primeiro.data).map((h) => h.horaInicio);
    expect(doDia.slice(0, mesmosDias.length)).toEqual(mesmosDias);
  });

  it("o primeiro horário mostrado é marcável, e depois some da lista", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    const [antes] = await proximos(app, agenda.slug);
    const primeiro = antes!.horarios[0]!;

    const marcado = await app.inject({
      method: "POST",
      url: `/barbearias/${agenda.slug}/agendamentos`,
      payload: {
        servicoIds: [agenda.servico.id],
        data: primeiro.data,
        horaInicio: primeiro.horaInicio,
        cliente: { nome: "Maria", telefone: "11977776666" },
      },
    });
    expect(marcado.statusCode).toBe(201);

    const [depois] = await proximos(app, agenda.slug);
    expect(depois!.horarios).not.toContainEqual(primeiro);
  });

  it("serviço que ninguém da equipe faz não tem horário", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await prisma.profissionalServico.deleteMany({ where: { servicoId: agenda.servico.id } });

    const [corte] = await proximos(app, agenda.slug);

    expect(corte!.horarios).toEqual([]);
  });

  it("serviço desativado não aparece", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await prisma.servico.update({ where: { id: agenda.servico.id }, data: { ativo: false } });

    expect(await proximos(app, agenda.slug)).toEqual([]);
  });

  it("barbearia sem horário de funcionamento não tem horário nenhum", async () => {
    const app = buildApp();
    const agenda = await prepararAgenda(app);
    await prisma.horarioFuncionamento.deleteMany({ where: { barbeariaId: agenda.barbeariaId } });

    const [corte] = await proximos(app, agenda.slug);

    expect(corte!.horarios).toEqual([]);
  });

  it("slug inexistente é 404", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/barbearias/nao-existe/proximos-horarios" });

    expect(resposta.statusCode).toBe(404);
  });
});
