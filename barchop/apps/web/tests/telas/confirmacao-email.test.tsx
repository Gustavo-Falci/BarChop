import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { Confirmacao } from "../../src/telas/Confirmacao";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// O e-mail na confirmação é opcional e só serve ao lembrete deste
// horário. A API o grava no agendamento, nunca no cadastro.
const MANHA = new Date("2026-09-10T08:00:00-03:00");

function montar(falso = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={falso}>
      <Confirmacao agora={MANHA} />
    </ProvedorDaApi>
  );
  return falso;
}

const botaoConfirmar = () => screen.findByRole("button", { name: /confirmar agendamento/i });

describe("e-mail pro lembrete na confirmação", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", hora: "09:00" },
    });
  });

  it("é opcional e diz pra que serve", async () => {
    montar();

    const campo = await screen.findByLabelText(/e-mail/i);
    expect(campo).not.toBeRequired();
    expect(screen.getByText(/lembrete/i)).toBeInTheDocument();
  });

  it("vai junto do agendamento, sem espaços nas pontas", async () => {
    const falso = criarApiClientFalso();
    const agendar = vi.spyOn(falso.publico, "agendar");
    montar(falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Maria");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11977776666");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "  maria@exemplo.com ");
    await userEvent.click(await botaoConfirmar());

    await screen.findByText(/agendamento confirmado/i);
    expect(agendar.mock.calls[0]![1].cliente).toEqual({
      nome: "Maria",
      telefone: "(11) 97777-6666",
      email: "maria@exemplo.com",
    });
  });

  it("e-mail fora do formato é recusado antes de mandar pra API", async () => {
    const falso = criarApiClientFalso();
    const agendar = vi.spyOn(falso.publico, "agendar");
    montar(falso);

    await userEvent.type(await screen.findByLabelText(/nome/i), "Maria");
    await userEvent.type(screen.getByLabelText(/telefone/i), "11977776666");
    await userEvent.type(screen.getByLabelText(/e-mail/i), "maria-sem-arroba");
    await userEvent.click(await botaoConfirmar());

    expect(await screen.findByText(/confira o e-mail/i)).toBeInTheDocument();
    expect(agendar).not.toHaveBeenCalled();
  });
});
