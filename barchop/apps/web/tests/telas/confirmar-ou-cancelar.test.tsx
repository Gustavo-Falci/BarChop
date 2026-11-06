import { render, screen, within } from "@testing-library/react";
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

function montar(falso: ReturnType<typeof criarApiClientFalso>, token = "token-a1", agora?: Date) {
  navegacaoFalsa.redefinir({
    pathname: `/gr-barber/lembrete/${token}`,
    params: { slug: "gr-barber", token },
  });
  render(
    <ProvedorDaApi valor={falso}>
      <ConfirmarOuCancelar agora={agora} />
    </ProvedorDaApi>
  );
}

describe("confirmar ou cancelar pelo link do lembrete", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("mostra o horário com a barbearia, o dia, a hora, com quem e o quê", async () => {
    montar(semear());

    const horario = await screen.findByRole("region", { name: "O horário" });
    // 10/10/2026 é sábado. Onda B: o dia por extenso, com a semana.
    expect(within(horario).getByText("Sábado, 10 de outubro às 10:00")).toBeInTheDocument();
    expect(within(horario).getByText("GR Barber")).toBeInTheDocument();
    expect(within(horario).getByText("Com Rafael")).toBeInTheDocument();
    expect(within(horario).getByText("Corte")).toBeInTheDocument();
  });

  it("o bloco do dia mostra a semana curta, o número e o mês", async () => {
    montar(semear());

    const horario = await screen.findByRole("region", { name: "O horário" });
    expect(within(horario).getByText("sáb")).toBeInTheDocument();
    expect(within(horario).getByText("out")).toBeInTheDocument();
  });

  it("sem confirmar ainda, pergunta se a pessoa vem", async () => {
    montar(semear());

    expect(await screen.findByText(/vai conseguir vir\?/i)).toBeInTheDocument();
  });

  it("com WhatsApp, o rodapé diz com quem falar", async () => {
    const falso = semear();
    falso.estado.perfil = { ...falso.estado.perfil, whatsapp: "(11) 98888-7777" };
    montar(falso);

    expect(await screen.findByText(/algum problema\?/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", "https://wa.me/5511988887777");
  });

  it("sem WhatsApp, não há rodapé", async () => {
    const falso = semear();
    falso.estado.perfil = { ...falso.estado.perfil, whatsapp: null };
    montar(falso);

    await screen.findByRole("button", { name: /confirmar presença/i });
    expect(screen.queryByText(/algum problema\?/i)).toBeNull();
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

    expect(await screen.findByText(/te esperamos/i)).toBeInTheDocument();
    // O selo no cartão do horário.
    const horario = screen.getByRole("region", { name: "O horário" });
    expect(within(horario).getByText("Presença confirmada")).toBeInTheDocument();
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
    const horario = screen.getByRole("region", { name: "O horário" });
    expect(within(horario).getByText("Cancelado")).toBeInTheDocument();
  });

  it("depois de cancelar, oferece marcar outro horário", async () => {
    montar(semear("cancelado"));

    expect(await screen.findByRole("link", { name: "Marcar outro horário" })).toHaveAttribute(
      "href",
      "/gr-barber/agendar"
    );
  });

  it("desistir de cancelar volta pras duas opções", async () => {
    montar(semear());

    await userEvent.click(await screen.findByRole("button", { name: /cancelar horário/i }));
    await userEvent.click(await screen.findByRole("button", { name: /voltar/i }));

    expect(await screen.findByRole("button", { name: /confirmar presença/i })).toBeInTheDocument();
  });

  it("já confirmado: diz isso e ainda deixa cancelar", async () => {
    montar(semear("confirmado", "2026-10-09T13:00:00.000Z"));

    expect(await screen.findByText(/te esperamos/i)).toBeInTheDocument();
    expect(screen.queryByText(/vai conseguir vir\?/i)).toBeNull();
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
    // O link também chega pelo WhatsApp ou copiado da tela de sucesso
    // (06/11): o texto não supõe que veio por e-mail.
    expect(screen.getByText("Confira se o link chegou inteiro, ou fale direto com a barbearia.")).toBeInTheDocument();
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

  describe("prazo de cancelar da barbearia (painel v2, 3g)", () => {
    // O horário é 10 de outubro às 10:00; o aparelho marca 07:00.
    const TRES_HORAS_ANTES = new Date(2026, 9, 10, 7, 0);

    it("passou o prazo: some o Cancelar, a confirmação fica, e aparece com quem falar", async () => {
      const falso = semear();
      falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 6, whatsapp: "(11) 98888-7777" };
      montar(falso, "token-a1", TRES_HORAS_ANTES);

      expect(await screen.findByRole("button", { name: /confirmar presença/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /cancelar horário/i })).not.toBeInTheDocument();
      expect(screen.getByText(/o prazo pra cancelar pelo link acabou/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
        "href",
        "https://wa.me/5511988887777"
      );
    });

    it("dentro do prazo, cancela como antes", async () => {
      const falso = semear();
      falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 2 };
      montar(falso, "token-a1", TRES_HORAS_ANTES);

      expect(await screen.findByRole("button", { name: /cancelar horário/i })).toBeInTheDocument();
      expect(screen.queryByText(/prazo/i)).not.toBeInTheDocument();
    });
  });
});
