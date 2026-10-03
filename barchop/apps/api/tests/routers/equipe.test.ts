import { describe, expect, it } from "vitest";
import { prisma } from "@barchop/database";
import { buildApp } from "../../src/app";
import type { CanalDeMemoria, CanalDeMensagem } from "../../src/lib/canal";
import type { App } from "../../src/tipos";
import { auth, criarBarbeariaComToken, criarMembroComToken } from "../helpers/barbearia";

// Onda 1, A4: o dono monta a equipe. Criar o membro já manda o convite
// por e-mail — o membro nasce sem senha e só entra depois de aceitar
// (auth-convite.test.ts). Quem pode o quê está na matriz de
// auth-papeis.test.ts; aqui fica o comportamento das rotas.

function enviadasPara(app: App, para: string) {
  return (app.canal as CanalDeMemoria).enviadas.filter((m) => m.para === para);
}

function convidar(
  app: App,
  token: string,
  corpo: Record<string, unknown> = {}
) {
  return app.inject({
    method: "POST",
    url: "/equipe",
    headers: auth(token),
    payload: { nome: "Ana Souza", email: "ana@exemplo.com", papel: "profissional", ...corpo },
  });
}

function mudar(app: App, token: string, id: string, corpo: Record<string, unknown>) {
  return app.inject({
    method: "PATCH",
    url: `/equipe/${id}`,
    headers: auth(token),
    payload: corpo,
  });
}

describe("GET /equipe", () => {
  it("lista a equipe com papel, status e convite pendente — sem senha", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    await convidar(app, dono.token);

    const resposta = await app.inject({ method: "GET", url: "/equipe", headers: auth(dono.token) });

    expect(resposta.statusCode).toBe(200);
    const membros = resposta.json().membros;
    expect(membros).toHaveLength(2);
    expect(membros[0]).toMatchObject({
      id: dono.barbeiroId,
      papel: "dono",
      ativo: true,
      atende: true,
      convitePendente: false,
    });
    expect(membros[1]).toMatchObject({
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      papel: "profissional",
      convitePendente: true,
    });
    for (const membro of membros) {
      expect(membro).not.toHaveProperty("senhaHash");
    }
    await app.close();
  });

  it("não mostra a equipe de outra barbearia", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    const resposta = await app.inject({ method: "GET", url: "/equipe", headers: auth(um.token) });

    const ids = resposta.json().membros.map((m: { id: string }) => m.id);
    expect(ids).toEqual([um.barbeiroId]);
    expect(ids).not.toContain(dois.barbeiroId);
    await app.close();
  });

  it("recepção e profissional também leem — a agenda precisa saber quem atende", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const recepcao = await criarMembroComToken(app, dono.barbeariaId, "recepcao", "r");
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");

    for (const membro of [recepcao, profissional]) {
      const resposta = await app.inject({ method: "GET", url: "/equipe", headers: auth(membro.token) });
      expect(resposta.statusCode).toBe(200);
      expect(resposta.json().membros).toHaveLength(3);
    }
    await app.close();
  });
});

describe("POST /equipe", () => {
  it("cria o membro sem senha e manda o convite pro e-mail dele", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const resposta = await convidar(app, dono.token, { email: "Ana@Exemplo.com" });

    expect(resposta.statusCode).toBe(201);
    const criado = resposta.json();
    expect(criado).toMatchObject({
      nome: "Ana Souza",
      email: "ana@exemplo.com",
      papel: "profissional",
      atende: true,
      ativo: true,
      convitePendente: true,
    });

    const noBanco = await prisma.barbeiro.findUniqueOrThrow({ where: { id: criado.id } });
    expect(noBanco.barbeariaId).toBe(dono.barbeariaId);
    expect(noBanco.senhaHash).toBeNull();

    const enviadas = enviadasPara(app, "ana@exemplo.com");
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0].assunto).toMatch(/convite/i);
    expect(enviadas[0].texto).toMatch(/\b\d{6}\b/);
    expect(enviadas[0].texto).toContain("Barbearia um");
    await app.close();
  });

  it("recepção nasce sem atender; o dono pode dizer o contrário", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const recepcao = await convidar(app, dono.token, { email: "r@exemplo.com", papel: "recepcao" });
    const recepcaoQueAtende = await convidar(app, dono.token, {
      email: "r2@exemplo.com",
      papel: "recepcao",
      atende: true,
    });

    expect(recepcao.json().atende).toBe(false);
    expect(recepcaoQueAtende.json().atende).toBe(true);
    await app.close();
  });

  it("e-mail já usado na plataforma: 409 email_em_uso, e nenhum convite sai", async () => {
    // O e-mail é a chave do login, única na plataforma inteira: no
    // piloto um profissional não está em duas barbearias.
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await criarBarbeariaComToken(app, "dois");

    const resposta = await convidar(app, um.token, { email: "dois@exemplo.com" });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json().erro).toBe("email_em_uso");
    expect(enviadasPara(app, "dois@exemplo.com")).toHaveLength(0);
    await app.close();
  });

  it("corpo com campo a mais ou papel inventado: 400", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const comBarbearia = await convidar(app, dono.token, { barbeariaId: dono.barbeariaId });
    const papelInventado = await convidar(app, dono.token, { papel: "gerente" });

    expect(comBarbearia.statusCode).toBe(400);
    expect(papelInventado.statusCode).toBe(400);
    await app.close();
  });

  it("canal que não entrega e-mail: 422 destino_indisponivel, e ninguém é criado", async () => {
    // Um membro criado sem convite que chegue ficaria pendurado: sem
    // senha e sem código pra definir uma.
    const soTelefone: CanalDeMensagem = {
      nome: "so-telefone",
      destinos: ["telefone"],
      async enviar() {},
    };
    const app = buildApp({ canal: soTelefone });
    const dono = await criarBarbeariaComToken(app);

    const resposta = await convidar(app, dono.token);

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("destino_indisponivel");
    expect(await prisma.barbeiro.count({ where: { email: "ana@exemplo.com" } })).toBe(0);
    await app.close();
  });

  it("criar um membro não muda o barbeiro do fluxo público", async () => {
    // O fluxo público ainda usa o primeiro da lista (até o bloco C).
    // Ordenada por nome, a "Ana" convidada passaria na frente do dono e
    // começaria a receber os agendamentos dele — sem nem ter senha.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    await convidar(app, dono.token);

    const publica = await app.inject({ method: "GET", url: `/barbearias/${dono.slug}` });

    expect(publica.json().barbeiros).toEqual([{ id: dono.barbeiroId, nome: "Barbeiro um" }]);
    await app.close();
  });
});

describe("PATCH /equipe/:id", () => {
  it("muda papel, atende, nome e telefone", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = (await convidar(app, dono.token)).json();

    const resposta = await mudar(app, dono.token, ana.id, {
      nome: "Ana S.",
      telefone: "11999998888",
      papel: "recepcao",
      atende: false,
    });

    expect(resposta.statusCode).toBe(200);
    // Gravado no formato único de lib/telefone.ts.
    expect(resposta.json()).toMatchObject({
      nome: "Ana S.",
      telefone: "(11) 99999-8888",
      papel: "recepcao",
      atende: false,
    });
    await app.close();
  });

  it("mudar o papel não mexe no atende", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = (await convidar(app, dono.token)).json();

    const resposta = await mudar(app, dono.token, ana.id, { papel: "recepcao" });

    expect(resposta.json().atende).toBe(true);
    await app.close();
  });

  it("desativar não apaga o membro, e tira o acesso dele na hora", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");

    const resposta = await mudar(app, dono.token, profissional.barbeiroId, { ativo: false });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().ativo).toBe(false);
    expect(await prisma.barbeiro.count({ where: { id: profissional.barbeiroId } })).toBe(1);
    const comTokenAntigo = await app.inject({
      method: "GET",
      url: "/me",
      headers: auth(profissional.token),
    });
    expect(comTokenAntigo.statusCode).toBe(401);
    await app.close();
  });

  it("membro de outra barbearia: 404", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");

    const resposta = await mudar(app, um.token, dois.barbeiroId, { nome: "Invadido" });

    expect(resposta.statusCode).toBe(404);
    const intacto = await prisma.barbeiro.findUniqueOrThrow({ where: { id: dois.barbeiroId } });
    expect(intacto.nome).toBe("Barbeiro dois");
    await app.close();
  });

  it("corpo vazio ou com e-mail: 400 — e-mail é a chave do login", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = (await convidar(app, dono.token)).json();

    expect((await mudar(app, dono.token, ana.id, {})).statusCode).toBe(400);
    expect((await mudar(app, dono.token, ana.id, { email: "x@exemplo.com" })).statusCode).toBe(400);
    await app.close();
  });
});

describe("a barbearia nunca fica sem dono", () => {
  it("o último dono não se rebaixa nem se desativa: 422 ultimo_dono", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);

    const rebaixar = await mudar(app, dono.token, dono.barbeiroId, { papel: "profissional" });
    const desativar = await mudar(app, dono.token, dono.barbeiroId, { ativo: false });

    for (const resposta of [rebaixar, desativar]) {
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().erro).toBe("ultimo_dono");
    }
    const intacto = await prisma.barbeiro.findUniqueOrThrow({ where: { id: dono.barbeiroId } });
    expect(intacto).toMatchObject({ papel: "dono", ativo: true });
    await app.close();
  });

  it("com outro dono ativo, rebaixar passa", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    await criarMembroComToken(app, dono.barbeariaId, "dono", "d2");

    const resposta = await mudar(app, dono.token, dono.barbeiroId, { papel: "profissional" });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json().papel).toBe("profissional");
    await app.close();
  });

  it("dono convidado que ainda não aceitou não conta como dono", async () => {
    // Ele não consegue entrar até aceitar o convite: contar com ele
    // deixaria a barbearia nas mãos de alguém que nunca entrou.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    await convidar(app, dono.token, { papel: "dono" });

    const resposta = await mudar(app, dono.token, dono.barbeiroId, { papel: "profissional" });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("ultimo_dono");
    await app.close();
  });

  it("dois donos se rebaixando ao mesmo tempo: o segundo espera e leva 422", async () => {
    // Checar e gravar em passos separados deixaria os dois lerem "há
    // outro dono" e os dois gravarem — a barbearia acabaria sem dono.
    //
    // Duas requisições em Promise.all não provam nada: terminam rápido
    // demais pra se cruzarem, e o teste passava até sem a trava. Aqui o
    // primeiro rebaixamento é uma transação do próprio teste, parada com
    // a trava na mão e a escrita feita, sem commit. Sem a trava, a rota
    // leria o outro ainda como dono e passaria; com ela, espera o commit
    // e conta de novo.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const outro = await criarMembroComToken(app, dono.barbeariaId, "dono", "d2");

    let soltar!: () => void;
    const segurando = new Promise<void>((resolver) => (soltar = resolver));
    let travou!: () => void;
    const comATrava = new Promise<void>((resolver) => (travou = resolver));

    const primeiro = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM barbearia WHERE id = ${dono.barbeariaId}::uuid FOR NO KEY UPDATE`;
      await tx.barbeiro.update({
        where: { id: outro.barbeiroId },
        data: { papel: "profissional" },
      });
      travou();
      await segurando;
    });

    await comATrava;
    const segundo = mudar(app, dono.token, dono.barbeiroId, { papel: "profissional" });
    // Tempo pra rota chegar à trava (ou, sem ela, passar direto e gravar).
    await new Promise((resolver) => setTimeout(resolver, 300));
    soltar();
    await primeiro;

    const resposta = await segundo;
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("ultimo_dono");
    const donos = await prisma.barbeiro.count({
      where: { barbeariaId: dono.barbeariaId, papel: "dono", ativo: true },
    });
    expect(donos).toBe(1);
    await app.close();
  });
});

describe("POST /equipe/:id/convite", () => {
  it("reenvia o convite pro membro que ainda não aceitou", async () => {
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const ana = (await convidar(app, dono.token)).json();

    const resposta = await app.inject({
      method: "POST",
      url: `/equipe/${ana.id}/convite`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(202);
    expect(enviadasPara(app, "ana@exemplo.com")).toHaveLength(2);
    await app.close();
  });

  it("membro que já tem senha: 422 convite_desnecessario, nada é enviado", async () => {
    // Um convite pra quem já tem senha seria um código de redefinição
    // que vale 7 dias, em vez dos 10 minutos do esqueci-a-senha.
    const app = buildApp();
    const dono = await criarBarbeariaComToken(app);
    const profissional = await criarMembroComToken(app, dono.barbeariaId, "profissional", "p");

    const resposta = await app.inject({
      method: "POST",
      url: `/equipe/${profissional.barbeiroId}/convite`,
      headers: auth(dono.token),
    });

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json().erro).toBe("convite_desnecessario");
    expect(enviadasPara(app, "profissional-p@exemplo.com")).toHaveLength(0);
    await app.close();
  });

  it("membro desativado ou de outra barbearia: 404", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const dois = await criarBarbeariaComToken(app, "dois");
    const ana = (await convidar(app, um.token)).json();
    await mudar(app, um.token, ana.id, { ativo: false });

    for (const id of [ana.id, dois.barbeiroId]) {
      const resposta = await app.inject({
        method: "POST",
        url: `/equipe/${id}/convite`,
        headers: auth(um.token),
      });
      expect(resposta.statusCode).toBe(404);
    }
    await app.close();
  });
});
