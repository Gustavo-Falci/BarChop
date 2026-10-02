import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { auth, criarBarbeariaComToken } from "../helpers/barbearia";
import type { App } from "../../src/tipos";

const JOAO = { nome: "João da Silva", telefone: "11999998888" };

describe("POST /clientes", () => {
  it("cadastra o cliente na barbearia do token", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    expect(resposta.statusCode).toBe(201);
    expect(resposta.json()).toMatchObject({
      nome: "João da Silva",
      // Guardado no formato único do cadastro, não como veio no corpo:
      // é o que faz a chave [barbearia, telefone] identificar a pessoa.
      telefone: "(11) 99999-8888",
      email: null,
      // Cliente cadastrado pelo barbeiro não tem conta: o fluxo público
      // não pede senha, e o app com login é passo posterior.
      temConta: false,
    });

    await app.close();
  });

  it("aparece na listagem na hora, sem depender de agendamento", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    // É o motivo de o Cliente ter ganhado barbeariaId: com o vínculo
    // saindo só do agendamento, este cadastro sumiria da tela até o
    // primeiro atendimento.
    const lista = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(lista.json().clientes).toHaveLength(1);

    await app.close();
  });

  it("normaliza o email pra caixa baixa", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { ...JOAO, email: "Joao@Exemplo.com" },
    });

    // Mesma razão do login: a coluna é VARCHAR com índice único, que
    // compara caixa a caixa. Sem normalizar, o mesmo email vira dois
    // cadastros.
    expect(resposta.json().email).toBe("joao@exemplo.com");

    await app.close();
  });

  it("recusa telefone repetido na mesma barbearia com 409", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const segunda = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "João de novo", telefone: "11999998888" },
    });

    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().erro).toBe("conflito");

    await app.close();
  });

  it("aceita o mesmo telefone em barbearias diferentes", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const naOutra = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(outra.token),
      payload: JOAO,
    });

    // O mesmo cliente pode ser cliente das duas barbearias. Um 409 aqui
    // impediria a segunda barbearia de cadastrar quem já é cliente da
    // primeira.
    expect(naOutra.statusCode).toBe(201);

    await app.close();
  });

  it("recusa telefone fora do formato com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "João", telefone: "telefone" },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa barbeariaId no corpo com 400", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { ...JOAO, barbeariaId: outra.barbeariaId },
    });

    expect(resposta.statusCode).toBe(400);

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({
      method: "POST",
      url: "/clientes",
      payload: JOAO,
    });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /clientes", () => {
  it("lista só os clientes da barbearia do token, em ordem de nome", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    for (const cliente of [
      { nome: "Zeca", telefone: "11911111111" },
      { nome: "Ana", telefone: "11922222222" },
    ]) {
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(um.token),
        payload: cliente,
      });
    }
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(outra.token),
      payload: { nome: "Cliente da outra", telefone: "11933333333" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(resposta.statusCode).toBe(200);
    expect(
      resposta.json().clientes.map((c: { nome: string }) => c.nome)
    ).toEqual(["Ana", "Zeca"]);

    await app.close();
  });

  it("acha pelo telefone digitado de qualquer jeito", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    // Guardado como "(11) 99999-8888" pela normalização.
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    // O barbeiro digita o pedaço que lembra. Com a coluna pontuada, um
    // `contains` cru só acharia a forma exata — a busca compara dígito
    // com dígito dos dois lados justamente por isso.
    for (const busca of ["999998888", "11999998888", "(11) 99999-8888", "99999-8888"]) {
      const resposta = await app.inject({
        method: "GET",
        url: `/clientes?busca=${encodeURIComponent(busca)}`,
        headers: auth(um.token),
      });

      expect(resposta.statusCode).toBe(200);
      expect(resposta.json().clientes).toHaveLength(1);
      expect(resposta.json().clientes[0].telefone).toBe("(11) 99999-8888");
    }

    await app.close();
  });

  it("não deixa a busca por telefone atravessar barbearias", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    const outra = await criarBarbeariaComToken(app, "outra");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(outra.token),
      payload: JOAO,
    });

    // A consulta do telefone é SQL escrito à mão; o filtro por
    // barbearia precisa estar lá dentro, senão a lista de clientes de
    // uma barbearia vazaria pela busca da outra.
    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?busca=999998888",
      headers: auth(um.token),
    });

    expect(resposta.json().clientes).toEqual([]);

    await app.close();
  });

  it("filtra por parte do nome, sem diferenciar caixa", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });
    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: { nome: "Maria", telefone: "11922222222" },
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?busca=jo",
      headers: auth(um.token),
    });

    expect(resposta.json().clientes).toHaveLength(1);
    expect(resposta.json().clientes[0].nome).toBe("João da Silva");

    await app.close();
  });

  it("filtra por parte do telefone", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?busca=99999",
      headers: auth(um.token),
    });

    expect(resposta.json().clientes).toHaveLength(1);

    await app.close();
  });

  it("nunca devolve senhaHash", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    await app.inject({
      method: "POST",
      url: "/clientes",
      headers: auth(um.token),
      payload: JOAO,
    });

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(um.token),
    });

    expect(resposta.body).not.toContain("senhaHash");

    await app.close();
  });

  it("recusa requisição sem token com 401", async () => {
    const app = buildApp();

    const resposta = await app.inject({ method: "GET", url: "/clientes" });

    expect(resposta.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /clientes: ultimoAgendamento", () => {
  // A lista do painel mostra numa coluna quando cada cliente esteve
  // aqui pela última vez. Antes ela descobria isso baixando os
  // agendamentos de 90 dias inteiros — com cliente e serviços aninhados
  // em cada registro — pra jogar fora tudo menos a maior data por
  // pessoa. Custava o MOVIMENTO da barbearia, não o número de clientes.
  async function prepararComAgenda(app: App, sufixo = "um") {
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

  async function cadastrar(
    app: App,
    token: string,
    nome: string,
    telefone: string
  ) {
    return (
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(token),
        payload: { nome, telefone },
      })
    ).json();
  }

  async function agendar(
    app: App,
    agenda: Awaited<ReturnType<typeof prepararComAgenda>>,
    clienteId: string,
    data: string,
    horaInicio: string
  ) {
    return app.inject({
      method: "POST",
      url: "/agendamentos",
      headers: auth(agenda.token),
      payload: {
        barbeiroId: agenda.barbeiroId,
        clienteId,
        servicoIds: [agenda.servico.id],
        data,
        horaInicio,
      },
    });
  }

  it("devolve a maior data de cada cliente, e null pra quem nunca veio", async () => {
    const app = buildApp();
    const agenda = await prepararComAgenda(app);

    const joao = await cadastrar(app, agenda.token, "João", "11999990001");
    const maria = await cadastrar(app, agenda.token, "Maria", "11999990002");
    await cadastrar(app, agenda.token, "Zeca", "11999990003");

    // Fora de ordem de propósito: o campo é um MAX, não "o último que
    // entrou". Com a ordem trocada, um `findFirst` passaria igual.
    await agendar(app, agenda, joao.id, "2026-09-10", "10:00");
    await agendar(app, agenda, joao.id, "2026-09-02", "10:00");
    await agendar(app, agenda, maria.id, "2026-09-04", "11:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(agenda.token),
    });

    expect(resposta.statusCode).toBe(200);

    const porNome = new Map(
      resposta
        .json()
        .clientes.map((c: { nome: string; ultimoAgendamento: string | null }) => [
          c.nome,
          c.ultimoAgendamento,
        ])
    );

    expect(porNome.get("João")).toBe("2026-09-10");
    expect(porNome.get("Maria")).toBe("2026-09-04");
    // `null`, e não a ausência do campo nem uma string vazia: quem lê
    // precisa distinguir "nunca veio" de "não perguntei".
    expect(porNome.get("Zeca")).toBeNull();

    await app.close();
  });

  it("não enxerga o agendamento de outra barbearia", async () => {
    const app = buildApp();
    const uma = await prepararComAgenda(app, "uma");
    const outra = await prepararComAgenda(app, "outra");

    const daUma = await cadastrar(app, uma.token, "João", "11999990010");
    const daOutra = await cadastrar(app, outra.token, "João", "11999990011");

    await agendar(app, uma, daUma.id, "2026-09-10", "10:00");
    await agendar(app, outra, daOutra.id, "2026-09-11", "10:00");

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes",
      headers: auth(uma.token),
    });

    const [cliente] = resposta.json().clientes;
    // A data da outra barbearia é mais recente. Se o filtro por
    // barbearia vazasse na agregação, seria ela que apareceria aqui.
    expect(cliente.ultimoAgendamento).toBe("2026-09-10");

    await app.close();
  });
});

describe("GET /clientes: páginas", () => {
  async function cadastrarVarios(app: App, token: string, nomes: string[]) {
    let sequencia = 0;
    for (const nome of nomes) {
      sequencia += 1;
      await app.inject({
        method: "POST",
        url: "/clientes",
        headers: auth(token),
        payload: {
          nome,
          telefone: `1198888${String(sequencia).padStart(4, "0")}`,
        },
      });
    }
  }

  async function pagina(app: App, token: string, query = "") {
    const resposta = await app.inject({
      method: "GET",
      url: `/clientes${query}`,
      headers: auth(token),
    });
    expect(resposta.statusCode).toBe(200);
    return resposta.json();
  }

  it("devolve o total da barbearia, e não o tamanho da página", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await cadastrarVarios(app, um.token, ["Ana", "Bruno", "Carla", "Davi"]);

    const primeira = await pagina(app, um.token, "?limite=2");

    expect(primeira.clientes).toHaveLength(2);
    // O ponto inteiro do campo: a tela precisa saber que faltam dois.
    // Com o teto mudo de antes, "2" era tudo que ela via.
    expect(primeira.total).toBe(4);
    expect(primeira.proximoCursor).not.toBeNull();

    await app.close();
  });

  it("o cursor continua de onde parou, em ordem de nome e sem repetir", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    // Fora de ordem no cadastro: a ordenação é por nome, não por
    // chegada. Com a inserção já ordenada, um `orderBy` errado passaria.
    await cadastrarVarios(app, um.token, ["Davi", "Ana", "Carla", "Bruno"]);

    const primeira = await pagina(app, um.token, "?limite=2");
    const segunda = await pagina(
      app,
      um.token,
      `?limite=2&cursor=${primeira.proximoCursor}`
    );

    const nomes = (p: { clientes: { nome: string }[] }) =>
      p.clientes.map((c) => c.nome);

    expect(nomes(primeira)).toEqual(["Ana", "Bruno"]);
    expect(nomes(segunda)).toEqual(["Carla", "Davi"]);
    // Acabou a lista: sem isto, a tela mostraria "carregar mais" pra
    // buscar uma página vazia.
    expect(segunda.proximoCursor).toBeNull();

    await app.close();
  });

  it("não devolve cursor quando a carteira cabe exatamente na página", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await cadastrarVarios(app, um.token, ["Ana", "Bruno"]);

    // O caso que o `take: limite + 1` existe pra resolver: com um
    // `take: limite` cru, dois de dois pareceriam "página cheia, deve
    // ter mais".
    const unica = await pagina(app, um.token, "?limite=2");

    expect(unica.clientes).toHaveLength(2);
    expect(unica.total).toBe(2);
    expect(unica.proximoCursor).toBeNull();

    await app.close();
  });

  it("o total acompanha a busca, não a carteira inteira", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");
    await cadastrarVarios(app, um.token, ["Ana Souza", "Bruno Lima", "Ana Dias"]);

    const achados = await pagina(app, um.token, "?busca=Ana");

    expect(achados.total).toBe(2);
    // Senão "2 de 3" apareceria numa busca que achou exatamente duas.
    expect(achados.clientes).toHaveLength(2);

    await app.close();
  });

  it("recusa limite fora da faixa", async () => {
    const app = buildApp();
    const um = await criarBarbeariaComToken(app, "um");

    const resposta = await app.inject({
      method: "GET",
      url: "/clientes?limite=500",
      headers: auth(um.token),
    });

    // O teto é de resposta, não de carteira: quem quiser tudo pagina.
    expect(resposta.statusCode).toBe(400);

    await app.close();
  });
});
