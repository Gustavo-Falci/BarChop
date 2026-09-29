import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { criarApiClientFalso } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDoHorario } from "../../src/telas/EscolhaDoHorario";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Duas da tarde do dia 9 — o instante que faz "09:00 de hoje" ser
// passado. Prop, e não relógio global, porque estes testes clicam.
const TARDE = new Date("2026-09-09T14:00:00-03:00");

function montar(horarios: string[]) {
  render(
    <ProvedorDaApi valor={criarApiClientFalso({ horariosLivres: horarios })}>
      <EscolhaDoHorario agora={TARDE} />
    </ProvedorDaApi>
  );
}

describe("escolha do horário", () => {

  it("mostra os horários livres do dia", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar(["09:00", "09:30"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    expect(screen.getByRole("button", { name: "09:30" })).toBeInTheDocument();
  });

  it("descarta horário que já passou quando a data é hoje", async () => {
    // A API devolve 09:00 mesmo às duas da tarde: ela não tem noção de
    // "agora". Sem este filtro o cliente agenda pra trás.
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-09" } });
    montar(["09:00", "14:30", "15:00"]);

    await waitFor(() => screen.getByRole("button", { name: "14:30" }));
    expect(screen.queryByRole("button", { name: "09:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "15:00" })).toBeInTheDocument();
  });

  it("avisa quando não sobrou horário nenhum pra hoje", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-09" } });
    montar(["09:00"]);

    await waitFor(() =>
      expect(screen.getByText(/nenhum horário/i)).toBeInTheDocument()
    );
  });

  it("dia sem horário oferece voltar pra escolha da data, com os serviços", async () => {
    // Sem o botão a tela era um beco: o texto mandava escolher outra
    // data e o único caminho era o voltar do navegador.
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-09" } });
    montar(["09:00"]);

    await userEvent.click(
      await screen.findByRole("button", { name: "Escolher outra data" })
    );

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1"
    );
  });

  it("leva pro passo de dados com a hora escolhida", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar(["09:00"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    await userEvent.click(screen.getByRole("button", { name: "09:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/dados?servicos=s1&data=2026-09-10&hora=09%3A00"
    );
  });

  it("no remarcar vai direto pra confirmação, sem passar por dados", async () => {
    // Quem remarca já está autenticado, e a API tira o cliente do token:
    // pedir nome e telefone de novo seria pedir o que ela ignora.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", remarcar: "a1" },
    });
    montar(["09:00"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    await userEvent.click(screen.getByRole("button", { name: "09:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=09%3A00&remarcar=a1"
    );
  });

  it("volta pro passo de data quando a URL não traz data", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
    montar([]);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
        "/gr-barber/agendar/data?servicos=s1"
      )
    );
  });

  it("mostra o aviso de horário ocupado quando ele vem na URL", async () => {
    // A tela de confirmação manda este recado pela query porque ela
    // mesma morre na navegação — estado local não sobreviveria.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", aviso: "horario_ocupado" },
    });
    montar(["09:00"]);

    await waitFor(() =>
      expect(
        screen.getByText(/esse horário acabou de ser ocupado/i)
      ).toBeInTheDocument()
    );
  });

  it("mostra o aviso de horário expirado quando ele vem na URL", async () => {
    // A tela de confirmação manda este recado (I5) quando a pessoa
    // demora pra confirmar e o horário escolhido vira passado enquanto
    // a tela ficava aberta.
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", aviso: "horario_expirou" },
    });
    montar(["09:00"]);

    await waitFor(() =>
      expect(screen.getByText(/esse horário já passou/i)).toBeInTheDocument()
    );
  });

  it("não mostra aviso nenhum quando a URL não traz um", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar(["09:00"]);

    await waitFor(() => screen.getByRole("button", { name: "09:00" }));
    expect(
      screen.queryByText(/esse horário acabou de ser ocupado/i)
    ).not.toBeInTheDocument();
  });

  it("avisa quando não consegue carregar os horários, em vez de dizer que a agenda está cheia", async () => {
    // Slug diferente do da barbearia semeada: o dublê responde 404,
    // igual à API real com um slug que sumiu.
    navegacaoFalsa.redefinir({
      slug: "outra",
      query: { servicos: "s1", data: "2026-09-10" },
    });
    montar([]);

    await waitFor(() => screen.getByRole("heading"));

    // O ponto que importa: a mensagem não é a de "nenhum horário", que
    // o cliente leria como agenda lotada em vez de falha de rede.
    expect(screen.queryByText(/nenhum horário/i)).not.toBeInTheDocument();
  });
});
