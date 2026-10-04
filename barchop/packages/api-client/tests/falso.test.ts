import { describe, expect, it } from "vitest";
import { CODIGO_DO_CLIENTE_FALSO, criarApiClientFalso, ErroDaApi } from "../src/index";

describe("criarApiClientFalso", () => {
  it("devolve o perfil semeado, no formato do client real", async () => {
    const falso = criarApiClientFalso();

    const perfil = await falso.publico.perfilDaBarbearia("gr-barber");

    expect(perfil.slug).toBe("gr-barber");
    // O fluxo público inteiro precisa deste id — é a razão de a fase 6
    // existir.
    expect(perfil.barbeiros).toHaveLength(1);
  });

  it("aceita estado semeado pelo teste da tela", async () => {
    const falso = criarApiClientFalso({
      horariosLivres: ["09:00", "14:30"],
    });

    const horarios = await falso.publico.disponibilidadeDoDia("gr-barber", {
      barbeiroId: "bb1",
      data: "2026-09-10",
      servicoIds: ["s1"],
    });

    expect(horarios).toEqual(["09:00", "14:30"]);
  });

  it("guarda o que foi agendado, pra tela seguinte enxergar", async () => {
    const falso = criarApiClientFalso();

    const agendamento = await falso.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "09:00",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });

    expect(falso.estado.agendamentos).toContainEqual(agendamento);
  });

  it("lança ErroDaApi, e não Error cru, quando o slug não existe", async () => {
    // Se o falso lançasse outra coisa, o teste de tela que trata erro
    // passaria contra o dublê e quebraria contra a API real.
    const falso = criarApiClientFalso();

    await expect(
      falso.publico.perfilDaBarbearia("nao-existe")
    ).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("responde horario_ocupado quando o horário já foi tomado", async () => {
    const falso = criarApiClientFalso({ horariosLivres: ["09:00"] });
    const agendar = () =>
      falso.publico.agendar("gr-barber", {
        barbeiroId: "bb1",
        servicoIds: ["s1"],
        data: "2026-09-10",
        horaInicio: "09:00",
        cliente: { nome: "João", telefone: "(11) 99999-8888" },
      });

    await agendar();

    try {
      await agendar();
      expect.unreachable("o segundo agendamento deveria ter sido recusado");
    } catch (erro) {
      expect((erro as ErroDaApi).codigo).toBe("horario_ocupado");
      expect((erro as ErroDaApi).status).toBe(409);
    }
  });

  it("não deixa um teste enxergar o estado do outro", async () => {
    // O dublê faz push em agendamentos e em servicos, e o padrão é um
    // objeto de módulo só: sem cópia, a segunda instância já nasceria
    // com o que a primeira agendou.
    const primeiro = criarApiClientFalso();
    await primeiro.publico.agendar("gr-barber", {
      barbeiroId: "bb1",
      servicoIds: ["s1"],
      data: "2026-09-10",
      horaInicio: "09:00",
      cliente: { nome: "João", telefone: "(11) 99999-8888" },
    });

    const segundo = criarApiClientFalso();

    expect(segundo.estado.agendamentos).toHaveLength(0);
  });
});

describe("dublê — escopo do barbeiro", () => {
  it("lista todos os clientes semeados", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    expect((await falso.barbeiro.clientes()).clientes).toHaveLength(2);
  });

  it("filtra por nome sem se importar com caixa", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achados = await falso.barbeiro.clientes("marcos");

    expect(achados.clientes.map((c) => c.id)).toEqual(["c2"]);
    // O total fala do filtro, não da carteira — é o que a tela usa pra
    // escrever "1 de 2" sem mentir.
    expect(achados.total).toBe(1);
  });

  it("filtra por telefone comparando dígito a dígito", async () => {
    // A API compara com regexp_replace no SQL: quem digita 999990002
    // acha (11) 99999-0002, sem parêntese nem traço.
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achados = await falso.barbeiro.clientes("999990002");

    expect(achados.clientes.map((c) => c.id)).toEqual(["c2"]);
  });

  it("cria cliente novo e o devolve na lista", async () => {
    const falso = criarApiClientFalso({ clientes: [] });

    const criado = await falso.barbeiro.criarCliente({
      nome: "Ana Souza",
      telefone: "(11) 98888-7777",
    });

    expect(criado.nome).toBe("Ana Souza");
    expect((await falso.barbeiro.clientes()).clientes).toHaveLength(1);
  });

  it("recusa telefone já cadastrado com conflito", async () => {
    // É o caso comum do walk-in: quem chega já existe, criado pelo
    // upsert do agendamento público.
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
      ],
    });

    await expect(
      falso.barbeiro.criarCliente({ nome: "João", telefone: "(11) 99999-0001" })
    ).rejects.toMatchObject({ codigo: "conflito" });
  });

  it("acha cliente por id na lista inteira", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const achado = await falso.barbeiro.cliente("c2");

    expect(achado.nome).toBe("Marcos Reis");
    expect(achado.agendamentos).toEqual([]);
  });

  it("devolve 404 para cliente que não existe", async () => {
    const falso = criarApiClientFalso({ clientes: [] });

    await expect(falso.barbeiro.cliente("c9")).rejects.toBeInstanceOf(ErroDaApi);
  });

  it("o signup devolve a barbearia que foi enviada", async () => {
    const falso = criarApiClientFalso();

    const sessao = await falso.barbeiro.signup({
      barbearia: { nome: "Barbearia do Zé", slug: "barbearia-do-ze" },
      barbeiro: { nome: "Zé", email: "ze@barbearia.com", senha: "segredo123" },
    });

    expect(sessao.barbearia.slug).toBe("barbearia-do-ze");
    expect(sessao.barbearia.nome).toBe("Barbearia do Zé");
    expect(sessao.barbeiro.nome).toBe("Zé");
  });

  it("o agendamento do barbeiro carrega o cliente que ele escolheu", async () => {
    const falso = criarApiClientFalso({
      clientes: [
        { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
        { id: "c2", nome: "Marcos Reis", telefone: "(11) 99999-0002", email: null, temConta: false },
      ],
    });

    const criado = await falso.barbeiro.criarAgendamento({
      barbeiroId: "bb1",
      clienteId: "c2",
      servicoIds: ["s1"],
      data: "2026-09-08",
      horaInicio: "09:00",
    });

    expect(criado.cliente.nome).toBe("Marcos Reis");
  });

  it("define a senha do cliente só com o código do dublê", async () => {
    // As telas testam o caminho do código contra o dublê: ele precisa
    // recusar código errado do mesmo jeito que a API, com o mesmo código
    // de erro, senão o ramo de erro das telas nunca roda.
    const falso = criarApiClientFalso();
    await falso.publico.pedirCodigoDoCliente("gr-barber", { email: "maria@exemplo.com" });

    await expect(
      falso.publico.definirSenhaDoCliente("gr-barber", {
        telefone: "(11) 98888-7777",
        codigo: "000000",
        senha: "segredo123",
        nome: "Maria",
      })
    ).rejects.toMatchObject({ status: 422, codigo: "codigo_invalido" });

    const sessao = await falso.publico.definirSenhaDoCliente("gr-barber", {
      telefone: "(11) 98888-7777",
      codigo: CODIGO_DO_CLIENTE_FALSO,
      senha: "segredo123",
      nome: "Maria",
    });
    expect(sessao.cliente.temConta).toBe(true);
  });
});
