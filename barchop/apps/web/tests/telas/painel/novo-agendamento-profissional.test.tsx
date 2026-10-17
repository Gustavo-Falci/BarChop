import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { NovoAgendamento } from "../../../src/telas/painel/NovoAgendamento";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Onda 1, C3: o Novo agendamento escolhe o profissional. Até aqui a
// tela marcava sempre em quem estava logado — a recepção (que não
// atende) recebia 422.

const AGORA = new Date("2026-09-08T10:00:00-03:00");

function semear(papel?: "dono" | "profissional" | "recepcao") {
  const falso = criarApiClientFalso({
    papel,
    clientes: [
      { id: "c1", nome: "João Silva", telefone: "(11) 99999-0001", email: null, temConta: false },
    ],
    horariosLivres: ["11:00", "11:30"],
  });
  falso.estado.equipe!.push(
    {
      id: "m2",
      nome: "Ana",
      email: "ana@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: false,
    },
    {
      id: "m3",
      nome: "Convidado",
      email: "c@gr.com",
      telefone: null,
      papel: "profissional",
      atende: true,
      ativo: true,
      fotoUrl: null,
      convitePendente: true,
    }
  );
  return falso;
}

async function agendarComJoao() {
  await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
  await userEvent.click(screen.getByRole("button", { name: /^agendar$/i }));
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({
    pathname: "/painel/agendamentos/novo",
    query: { data: "2026-09-09", hora: "11:00" },
  });
});

describe("profissional no novo agendamento", () => {
  it("o dono escolhe a Ana: a disponibilidade e o agendamento vão com ela", async () => {
    const falso = semear();
    const doDia = vi.spyOn(falso.publico, "disponibilidadeDoDia");
    const criar = vi.spyOn(falso.barbeiro, "criarAgendamento");
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    // Os chips só aparecem com a equipe em mãos (17/10: o select nativo
    // saía com o azul do sistema e ficava fora dos passos).
    await userEvent.click(await screen.findByRole("radio", { name: "Ana" }));
    await agendarComJoao();

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0][0]).toMatchObject({ barbeiroId: "m2" });
    expect(doDia.mock.calls.at(-1)?.[1]).toMatchObject({ barbeiroId: "m2" });
  });

  it("pede a disponibilidade com o token do painel: as regras do cliente não valem aqui", async () => {
    // Painel v2, marco 3: com o token de membro, a API devolve os
    // horários sem antecedência, mesmo dia e janela do link.
    const falso = semear();
    const doDia = vi.spyOn(falso.publico, "disponibilidadeDoDia");
    const doMes = vi.spyOn(falso.publico, "disponibilidadeDoMes");
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await userEvent.click(await screen.findByRole("button", { name: /João Silva/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

    await waitFor(() => expect(doDia).toHaveBeenCalled());
    await waitFor(() => expect(doMes).toHaveBeenCalled());
    expect(doDia.mock.calls.at(-1)?.[2]).toEqual({ comToken: true });
    expect(doMes.mock.calls.at(-1)?.[2]).toEqual({ comToken: true });
  });

  it("só oferece quem atende e já entrou", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear("recepcao"));

    await screen.findByRole("radio", { name: "Ana" });
    const grupo = screen.getByRole("group", { name: "Profissional" });
    const nomes = within(grupo)
      .getAllByRole("radio")
      .map((opcao) => opcao.closest("label")?.textContent);
    expect(nomes).toContain("Ana");
    expect(nomes).not.toContain("Rafael"); // a recepção logada não atende
    expect(nomes).not.toContain("Convidado");
  });

  it("a recepção marca no primeiro que atende, não em si mesma", async () => {
    const falso = semear("recepcao");
    const criar = vi.spyOn(falso.barbeiro, "criarAgendamento");
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    // A equipe precisa ter chegado: é dela que sai o primeiro que atende.
    await screen.findByRole("radio", { name: "Ana" });
    await agendarComJoao();

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0][0]).toMatchObject({ barbeiroId: "bb0" });
  });

  it("o profissional marca na própria agenda, sem escolher", async () => {
    const falso = semear("profissional");
    const criar = vi.spyOn(falso.barbeiro, "criarAgendamento");
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await agendarComJoao();

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0][0]).toMatchObject({ barbeiroId: "bb1" });
    expect(screen.queryByRole("group", { name: "Profissional" })).not.toBeInTheDocument();
  });

  it("?profissional= na URL (a coluna da agenda) chega escolhido", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00", profissional: "m2" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("radio", { name: "Ana" })).toBeChecked();
  });
});

// Pedido do dono (2026-10-11): vindo de um horário livre da semana, o
// select mostra só quem pode atender naquela hora (`?profissionais=`).
describe("profissional vindo de um horário da semana", () => {
  it("com ?profissionais=m2, só a Ana aparece, já escolhida", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00", profissionais: "m2" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    expect(await screen.findByRole("radio", { name: "Ana" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Rafael" })).not.toBeInTheDocument();
  });

  it("com os dois livres, os dois aparecem e quem está logado vem escolhido", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00", profissionais: "bb1,m2" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await screen.findByRole("radio", { name: "Ana" });
    expect(screen.getByRole("radio", { name: "Rafael" })).toBeChecked();
  });

  it("trocar o dia tira a restrição, que valia pra outra hora", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00", profissionais: "m2" },
    });
    const falso = semear();
    falso.estado.diasComVaga = { "2026-09-10": true };
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await screen.findByRole("radio", { name: "Ana" });
    await userEvent.click(screen.getByRole("button", { name: "Serviços" }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: "Data" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "10 de setembro" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "10 de setembro" }));

    const ultima = navegacaoFalsa.replace.mock.calls.at(-1)?.[0];
    expect(ultima).toContain("data=2026-09-10");
    expect(ultima).not.toContain("profissionais=");
  });
});
