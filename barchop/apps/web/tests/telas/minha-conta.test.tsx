import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { MinhaConta } from "../../src/telas/MinhaConta";
import { sessaoDoCliente } from "../../src/sessao/armazenamento";
import { navegacaoFalsa } from "../ajudantes/navegacao";

async function comUmAgendamento() {
  const falso = criarApiClientFalso();
  await falso.publico.agendar("gr-barber", {
    barbeiroId: "bb1",
    servicoIds: ["s1"],
    data: "2026-09-20",
    horaInicio: "09:30",
    cliente: { nome: "João", telefone: "(11) 99999-8888" },
  });
  return falso;
}

function montar(falso: ReturnType<typeof criarApiClientFalso>) {
  render(
    <ProvedorDaApi valor={falso}>
      <MinhaConta />
    </ProvedorDaApi>
  );
}

describe("minha conta", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
  });

  it("lista os agendamentos com data, hora e status", async () => {
    montar(await comUmAgendamento());

    await waitFor(() => screen.getByText("20 de setembro"));
    expect(screen.getByText("09:30")).toBeInTheDocument();
    expect(screen.getByText(/pendente/i)).toBeInTheDocument();
  });

  it("cancela e atualiza a lista", async () => {
    montar(await comUmAgendamento());
    await waitFor(() => screen.getByText("20 de setembro"));

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() =>
      expect(screen.getByText(/cancelado/i)).toBeInTheDocument()
    );
  });

  it("I3: mostra o erro quando cancelar falha, em vez de não fazer nada", async () => {
    // agendamento_passado é exatamente o que quem foi travado pelo C1
    // encontra: sem captura, essa rejeição ficava sem tratamento e o
    // clique em Cancelar simplesmente não tinha efeito nenhum.
    const falso = await comUmAgendamento();
    falso.cliente.cancelar = async () => {
      throw new ErroDaApi(422, "regra_de_negocio", "esse agendamento já passou");
    };
    montar(falso);
    await waitFor(() => screen.getByText("20 de setembro"));

    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    await waitFor(() =>
      expect(screen.getByText(/esse agendamento já passou/i)).toBeInTheDocument()
    );
  });

  it("M8: mostra os status traduzidos em vez do enum em inglês", async () => {
    const falso = criarApiClientFalso({
      agendamentos: [
        {
          id: "a1",
          data: "2026-09-22",
          horaInicio: "09:00",
          horaFim: "09:30",
          status: "no_show",
          origem: "cliente",
          observacoes: null,
          servicos: [
            { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
          ],
        },
        {
          id: "a2",
          data: "2026-09-23",
          horaInicio: "10:00",
          horaFim: "10:30",
          status: "concluido",
          origem: "cliente",
          observacoes: null,
          servicos: [
            { servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 },
          ],
        },
      ],
    });
    montar(falso);

    await waitFor(() => screen.getByText(/não compareceu/i));
    expect(screen.getByText(/concluído/i)).toBeInTheDocument();
    // O enum cru não pode aparecer em nenhum lugar da tela.
    expect(screen.queryByText("no_show")).not.toBeInTheDocument();
    expect(screen.queryByText("concluido")).not.toBeInTheDocument();
  });

  it("remarcar leva pro passo de data com o id na query", async () => {
    const falso = await comUmAgendamento();
    montar(falso);
    await waitFor(() => screen.getByText("20 de setembro"));

    await userEvent.click(screen.getByRole("button", { name: /remarcar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      // Com o profissional de quem atendeu: a API remarca com ele.
      "/gr-barber/agendar/data?servicos=s1&remarcar=a1&profissional=bb1"
    );
  });

  it("manda pro entrar quando não há sessão", async () => {
    localStorage.clear();
    montar(criarApiClientFalso());

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/entrar")
    );
  });

  it("manda pro entrar quando a API responde 401", async () => {
    // Token de sete dias, e o hook da API consulta o banco a cada
    // requisição: 401 no meio da sessão é evento normal.
    const falso = criarApiClientFalso();
    falso.cliente.meusAgendamentos = async () => {
      throw new ErroDaApi(401, "nao_autenticado", "");
    };
    montar(falso);

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/entrar")
    );
  });

  it("avisa quando não consegue carregar, sem esvaziar a lista por engano", async () => {
    // Uma falha que não seja 401 (aqui, 500) não pode virar tela de
    // histórico vazio: pra quem usa, as duas são indistinguíveis, e só
    // uma delas é verdade.
    const falso = criarApiClientFalso();
    falso.cliente.meusAgendamentos = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };
    montar(falso);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /não foi possível carregar/i
      )
    );
    // A prova de que não virou lista vazia: se tivesse um agendamento
    // "de mentira" nenhum botão apareceria, mas também não apareceria
    // se a tela genuinamente não tivesse nada pra mostrar — o texto do
    // aviso é o que distingue os dois casos.
    expect(
      screen.queryByRole("button", { name: /cancelar|remarcar/i })
    ).not.toBeInTheDocument();
  });

  it("agendamento cancelado não oferece cancelar nem remarcar", async () => {
    montar(await comUmAgendamento());
    await waitFor(() => screen.getByText("20 de setembro"));

    // Depois de cancelado o próprio agendamento sai do estado
    // "alterável": nem cancelar de novo, nem remarcar pra outro dia
    // fazem sentido pra uma linha que já chegou no destino.
    await userEvent.click(screen.getByRole("button", { name: /cancelar/i }));
    await waitFor(() => screen.getByText(/cancelado/i));

    expect(
      screen.queryByRole("button", { name: /cancelar/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /remarcar/i })
    ).not.toBeInTheDocument();
  });
});
