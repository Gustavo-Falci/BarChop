import { screen, waitFor } from "@testing-library/react";
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

    await userEvent.selectOptions(await screen.findByLabelText("Profissional"), "m2");
    await agendarComJoao();

    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0][0]).toMatchObject({ barbeiroId: "m2" });
    expect(doDia.mock.calls.at(-1)?.[1]).toMatchObject({ barbeiroId: "m2" });
  });

  it("só oferece quem atende e já entrou", async () => {
    montarPainel(<NovoAgendamento agora={AGORA} />, semear("recepcao"));

    const opcoes = (await screen.findByLabelText("Profissional")).querySelectorAll("option");
    const nomes = [...opcoes].map((opcao) => opcao.textContent);
    expect(nomes).toContain("Ana");
    expect(nomes).not.toContain("Rafael"); // a recepção logada não atende
    expect(nomes).not.toContain("Convidado");
  });

  it("a recepção marca no primeiro que atende, não em si mesma", async () => {
    const falso = semear("recepcao");
    const criar = vi.spyOn(falso.barbeiro, "criarAgendamento");
    montarPainel(<NovoAgendamento agora={AGORA} />, falso);

    await screen.findByLabelText("Profissional");
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
    expect(screen.queryByLabelText("Profissional")).not.toBeInTheDocument();
  });

  it("?profissional= na URL (a coluna da agenda) chega escolhido", async () => {
    navegacaoFalsa.redefinir({
      pathname: "/painel/agendamentos/novo",
      query: { data: "2026-09-09", hora: "11:00", profissional: "m2" },
    });
    montarPainel(<NovoAgendamento agora={AGORA} />, semear());

    await waitFor(async () =>
      expect(await screen.findByLabelText("Profissional")).toHaveValue("m2")
    );
  });
});
