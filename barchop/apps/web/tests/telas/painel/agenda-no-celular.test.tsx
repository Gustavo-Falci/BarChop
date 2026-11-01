import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { Agenda } from "../../../src/telas/painel/Agenda";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { comTelaDeCelular } from "../../ajudantes/tela";

// Agenda no celular, PR 3: a barra do Google Agenda e o menu ☰.
// 2026-09-08 é uma terça-feira.
const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear(papel?: "dono" | "profissional" | "recepcao") {
  const falso = criarApiClientFalso({
    papel,
    clientes: [{ id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false }],
    agendamentos: [
      {
        id: "a1",
        clienteId: "c1",
        data: "2026-09-08",
        horaInicio: "11:00",
        horaFim: "11:30",
        status: "confirmado",
        origem: "cliente",
        observacoes: null,
        barbeiro: { id: "bb1", nome: "Rafael" },
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
  });
  falso.estado.equipe!.push({
    id: "m2",
    nome: "Ana",
    email: "ana@gr.com",
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
    podeVenderPlanos: false,
  });
  return falso;
}

function irPara(query: Record<string, string>) {
  navegacaoFalsa.redefinir({ pathname: "/painel/agenda", query });
}

async function abrirMenu() {
  await userEvent.click(await screen.findByRole("button", { name: "Menu da agenda" }));
  return screen.findByRole("dialog", { name: "Agenda" });
}

describe("agenda no celular: barra e menu", () => {
  let desfazer: () => void;
  beforeEach(() => {
    localStorage.clear();
    desfazer = comTelaDeCelular();
    irPara({ vista: "lista", data: "2026-09-08" });
  });
  afterEach(() => desfazer());

  it("mostra a barra do celular no lugar do seletor do desktop", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Menu da agenda" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Setembro, escolher data" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hoje" })).toBeInTheDocument();
    // As vistas moram no menu: fora dele, nenhum botão "Semana".
    expect(screen.queryByRole("button", { name: "Semana" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Filtrar por profissional" })).not.toBeInTheDocument();
  });

  // Pendente do redesenho (01/11): a 360px "Setembro" virava "Setem…".
  // A barra leva o mês inteiro e o abreviado; o CSS escolhe qual se vê
  // (agenda-largura-no-celular). O nome do botão segue o mês inteiro.
  it("o título leva o mês inteiro e o abreviado, e o nome do botão é o inteiro", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const titulo = await screen.findByRole("button", { name: "Setembro, escolher data" });
    expect(within(titulo).getByText("Setembro")).toBeInTheDocument();
    expect(within(titulo).getByText("Set")).toBeInTheDocument();
  });

  it("na vista de dia, o título é o dia curto", async () => {
    irPara({ vista: "dia", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "8 set, escolher data" })).toBeInTheDocument();
  });

  it("sem a faixa de resumo, que no celular empurraria a agenda", async () => {
    irPara({ vista: "semana", data: "2026-09-08" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    await screen.findByRole("button", { name: "Menu da agenda" });
    expect(screen.queryByRole("list", { name: "Resumo da semana" })).not.toBeInTheDocument();
  });

  it("as setas andam no passo da vista", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Próximo período" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=lista&data=2026-09-22");
  });

  it("o cadeado abre o bloqueio", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Bloquear horário" }));

    expect(await screen.findByRole("dialog", { name: "Bloquear horário" })).toBeInTheDocument();
  });

  // Redesenho do celular, PR 3: só o "8" num quadrado e um calendário
  // com X não diziam o que faziam. O rótulo fica à vista, embaixo do
  // ícone, como na barra de baixo; os nomes acessíveis não mudam.
  it("o Hoje e o cadeado têm rótulo à vista", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    expect(await screen.findByRole("button", { name: "Hoje" })).toHaveTextContent(/hoje/i);
    expect(screen.getByRole("button", { name: "Bloquear horário" })).toHaveTextContent(/^bloquear$/i);
  });

  it("o título abre o calendário, e escolher o dia 28 vai pra ele na mesma vista", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Setembro, escolher data" }));
    const folha = await screen.findByRole("dialog", { name: "Ir para a data" });
    await userEvent.click(within(folha).getByRole("button", { name: "28 de setembro" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=lista&data=2026-09-28");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Ir para a data" })).not.toBeInTheDocument());
  });

  it("no calendário, o passado também se escolhe", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    await userEvent.click(await screen.findByRole("button", { name: "Setembro, escolher data" }));
    const folha = await screen.findByRole("dialog", { name: "Ir para a data" });

    expect(within(folha).getByRole("button", { name: "1 de setembro" })).toBeEnabled();
  });

  it("o menu marca a vista atual, e escolher 3 dias navega e fecha", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const menu = await abrirMenu();
    expect(within(menu).getByRole("button", { name: "Lista" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(menu).getByRole("button", { name: "3 dias" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=3dias&data=2026-09-08");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agenda" })).not.toBeInTheDocument());
  });

  it("o menu tem o nome da barbearia e o atalho das regras", async () => {
    const falso = semear();
    montarPainel(<Agenda agora={AGORA} />, falso);

    const menu = await abrirMenu();

    expect(await within(menu).findByText(falso.estado.perfil.nome)).toBeInTheDocument();
    expect(within(menu).getByRole("link", { name: "Regras de agendamento" })).toHaveAttribute(
      "href",
      "/painel/configuracoes/regras-de-agendamento"
    );
  });

  it("Bloquear horário no menu fecha o menu e abre o bloqueio", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const menu = await abrirMenu();
    await userEvent.click(within(menu).getByRole("button", { name: "Bloquear horário" }));

    expect(await screen.findByRole("dialog", { name: "Bloquear horário" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Agenda" })).not.toBeInTheDocument());
  });

  it("os profissionais vêm marcados, com quantos têm hoje", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const menu = await abrirMenu();
    const grupo = within(menu).getByRole("group", { name: "Profissionais" });

    expect(await within(grupo).findByText("1 hoje")).toBeInTheDocument();
    expect(within(grupo).getByText("0 hoje")).toBeInTheDocument();
    expect(within(grupo).getByRole("checkbox", { name: /Rafael/ })).toBeChecked();
    expect(within(grupo).getByRole("checkbox", { name: /Ana/ })).toBeChecked();
  });

  it("desmarcar a Ana deixa só o Rafael na URL", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear());

    const menu = await abrirMenu();
    await userEvent.click(await within(menu).findByRole("checkbox", { name: /Ana/ }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/agenda?vista=lista&data=2026-09-08&profissionais=bb1");
  });

  it("com uma pessoa só marcada, a caixinha dela não sai", async () => {
    irPara({ vista: "lista", data: "2026-09-08", profissionais: "bb1" });
    montarPainel(<Agenda agora={AGORA} />, semear());

    const menu = await abrirMenu();

    await waitFor(() => expect(within(menu).getByRole("checkbox", { name: /Ana/ })).not.toBeChecked());
    expect(within(menu).getByRole("checkbox", { name: /Rafael/ })).toBeDisabled();
  });

  it("o profissional não vê a seção Profissionais", async () => {
    montarPainel(<Agenda agora={AGORA} />, semear("profissional"));

    const menu = await abrirMenu();

    expect(within(menu).getByRole("button", { name: "Dia" })).toBeInTheDocument();
    expect(within(menu).queryByRole("group", { name: "Profissionais" })).not.toBeInTheDocument();
  });
});
