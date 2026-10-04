import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { ConfirmarOuCancelar } from "../../src/telas/ConfirmarOuCancelar";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// O destino do link do e-mail de lembrete. Sem login: quem autoriza é
// o token da URL. A tela só age no clique — leitor de e-mail e
// antivírus abrem links sozinhos, e abrir não pode confirmar nada.

function semear(status = "confirmado", presencaConfirmadaEm: string | null = null) {
  return criarApiClientFalso({
    agendamentos: [
      {
        id: "a1",
        data: "2026-10-10",
        horaInicio: "10:00",
        horaFim: "10:30",
        status,
        origem: "cliente",
        observacoes: null,
        presencaConfirmadaEm,
        servicos: [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }],
      },
    ],
    lembretes: { "token-a1": "a1" },
    lembretesVencidos: ["token-vencido"],
  });
}

function montar(falso: ReturnType<typeof criarApiClientFalso>, token = "token-a1") {
  navegacaoFalsa.redefinir({
    pathname: `/gr-barber/lembrete/${token}`,
    params: { slug: "gr-barber", token },
  });
  render(
    <ProvedorDaApi valor={falso}>
      <ConfirmarOuCancelar />
    </ProvedorDaApi>
  );
}

describe("confirmar ou cancelar pelo link do lembrete", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("mostra o horário com a barbearia, o dia, a hora, com quem e o quê", async () => {
    montar(semear());

    expect(await screen.findByText("GR Barber")).toBeInTheDocument();
    expect(screen.getByText(/10 de outubro/)).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText(/Rafael/)).toBeInTheDocument();
    expect(screen.getByText(/Corte/)).toBeInTheDocument();
  });

  it("abrir não confirma nada", async () => {
    const falso = semear();
    montar(falso);

    await screen.findByRole("button", { name: /confirmar presença/i });

    expect((await falso.barbeiro.agendamento("a1")).presencaConfirmadaEm).toBeNull();
  });

  it("confirma a presença no clique", async () => {
    const falso = semear();
    montar(falso);

    await userEvent.click(await screen.findByRole("button", { name: /confirmar presença/i }));

    expect(await screen.findByText(/presença confirmada/i)).toBeInTheDocument();
    expect((await falso.barbeiro.agendamento("a1")).presencaConfirmadaEm).not.toBeNull();
  });

  it("cancelar pede confirmação antes", async () => {
    const falso = semear();
    montar(falso);

    await userEvent.click(await screen.findByRole("button", { name: /cancelar horário/i }));
    expect((await falso.barbeiro.agendamento("a1")).status).toBe("confirmado");

    await userEvent.click(await screen.findByRole("button", { name: /sim, cancelar/i }));

    expect(await screen.findByText(/horário cancelado/i)).toBeInTheDocument();
    expect((await falso.barbeiro.agendamento("a1")).status).toBe("cancelado");
  });

  it("desistir de cancelar volta pras duas opções", async () => {
    montar(semear());

    await userEvent.click(await screen.findByRole("button", { name: /cancelar horário/i }));
    await userEvent.click(await screen.findByRole("button", { name: /voltar/i }));

    expect(await screen.findByRole("button", { name: /confirmar presença/i })).toBeInTheDocument();
  });

  it("já confirmado: diz isso e ainda deixa cancelar", async () => {
    montar(semear("confirmado", "2026-10-09T13:00:00.000Z"));

    expect(await screen.findByText(/presença confirmada/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirmar presença/i })).toBeNull();
    expect(screen.getByRole("button", { name: /cancelar horário/i })).toBeInTheDocument();
  });

  it("já cancelado: diz isso e não oferece nada", async () => {
    montar(semear("cancelado"));

    expect(await screen.findByText(/horário cancelado/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("link vencido diz que o horário já começou", async () => {
    montar(semear(), "token-vencido");

    expect(await screen.findByText(/já começou/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("link inválido diz isso, sem detalhe", async () => {
    montar(semear(), "outro-token");

    expect(await screen.findByText(/link inválido/i)).toBeInTheDocument();
  });

  it("falha ao confirmar mostra o aviso e mantém as opções", async () => {
    const falso = semear();
    // Cancelado por outro caminho entre abrir e clicar: a API responde 422.
    montar(falso);
    const botao = await screen.findByRole("button", { name: /confirmar presença/i });
    await falso.publico.cancelarPeloLembrete("token-a1");

    await userEvent.click(botao);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
