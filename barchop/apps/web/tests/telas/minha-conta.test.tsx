import { act, render, screen, waitFor, within } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
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

function montar(falso: ReturnType<typeof criarApiClientFalso>, agora?: Date) {
  render(
    <ProvedorDaApi valor={falso}>
      <MinhaConta agora={agora} />
    </ProvedorDaApi>
  );
}

// O agendamento é dia 20 de setembro às 09:30; três horas antes, pelo
// relógio do aparelho.
const TRES_HORAS_ANTES = new Date(2026, 8, 20, 6, 30);

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

  it("o HTML do servidor e a primeira tela do navegador batem (sem aviso de hidratação)", async () => {
    const falso = await comUmAgendamento();
    const arvore = (
      <ProvedorDaApi valor={falso}>
        <MinhaConta />
      </ProvedorDaApi>
    );
    // O servidor não enxerga o localStorage: desenha sem a sessão.
    sessaoDoCliente("gr-barber").limpar();
    const html = renderToString(arvore);
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const erros: unknown[] = [];
    const raiz = await act(async () =>
      hydrateRoot(container, arvore, { onRecoverableError: (erro) => erros.push(erro) })
    );
    try {
      expect(erros).toEqual([]);
      await waitFor(() => within(container).getByText("20 de setembro"));
    } finally {
      act(() => raiz.unmount());
      container.remove();
    }
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

  describe("prazos da barbearia (painel v2, 3g)", () => {
    it("dentro dos prazos, cancelar e remarcar continuam lá", async () => {
      const falso = await comUmAgendamento();
      falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 2, prazoRemarcarHoras: 2 };
      montar(falso, TRES_HORAS_ANTES);

      await waitFor(() => screen.getByText("20 de setembro"));
      expect(screen.getByRole("button", { name: /cancelar/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remarcar/i })).toBeInTheDocument();
      expect(screen.queryByText(/prazo/i)).not.toBeInTheDocument();
    });

    it("passou o prazo de cancelar: some o Cancelar e aparece o WhatsApp da casa", async () => {
      const falso = await comUmAgendamento();
      falso.estado.perfil = { ...falso.estado.perfil, prazoCancelarHoras: 6, whatsapp: "(11) 98888-7777" };
      montar(falso, TRES_HORAS_ANTES);

      await waitFor(() => screen.getByText("20 de setembro"));
      expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /remarcar/i })).toBeInTheDocument();
      expect(screen.getByText(/o prazo pra cancelar pelo link acabou/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /whatsapp/i })).toHaveAttribute(
        "href",
        "https://wa.me/5511988887777"
      );
    });

    it("passaram os dois prazos: nenhum botão, e sem WhatsApp vai o telefone", async () => {
      const falso = await comUmAgendamento();
      falso.estado.perfil = {
        ...falso.estado.perfil,
        prazoCancelarHoras: 24,
        prazoRemarcarHoras: 6,
        whatsapp: null,
        telefone: "(11) 3333-4444",
      };
      montar(falso, TRES_HORAS_ANTES);

      await waitFor(() => screen.getByText("20 de setembro"));
      expect(screen.queryByRole("button", { name: /cancelar/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /remarcar/i })).not.toBeInTheDocument();
      expect(screen.getByText(/o prazo pra alterar pelo link acabou/i)).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /\(11\) 3333-4444/ })).toHaveAttribute("href", "tel:1133334444");
    });
  });
});

// A direção A do redesenho (canvas "Minha conta — redesenho"): o título
// da conta, o Agendar no topo, os marcados em destaque e o resto num
// histórico sem caixas. O plano fica ao lado (planos-da-barbearia.test).
describe("minha conta: a página", () => {
  const corte = [{ servicoId: "s1", nome: "Corte", precoNoMomento: "40.00", duracaoNoMomento: 30 }];
  const agendamento = (id: string, data: string, horaInicio: string, status: string) => ({
    id,
    data,
    horaInicio,
    horaFim: "10:30",
    status,
    origem: "cliente",
    observacoes: null,
    servicos: corte,
    barbeiro: { id: "bb1", nome: "Rafael" },
  });

  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir();
    sessaoDoCliente("gr-barber").gravar("jwt-do-cliente");
  });

  it("o título é Minha conta, com a volta pra barbearia e o Agendar horário", async () => {
    montar(criarApiClientFalso());

    expect(await screen.findByRole("heading", { level: 1, name: "Minha conta" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar pra barbearia" })).toHaveAttribute("href", "/gr-barber");
    expect(screen.getByRole("link", { name: "Agendar horário" })).toHaveAttribute("href", "/gr-barber/agendar");
  });

  it("os marcados ficam em cima, com as ações; o resto vai pro histórico, sem botões", async () => {
    montar(
      criarApiClientFalso({
        agendamentos: [
          agendamento("a1", "2026-09-10", "09:00", "cancelado"),
          agendamento("a2", "2026-09-20", "10:00", "confirmado"),
          agendamento("a3", "2026-09-05", "11:00", "concluido"),
        ],
      }),
      TRES_HORAS_ANTES
    );

    const marcados = await screen.findByRole("region", { name: "Horários marcados" });
    expect(within(marcados).getByText("20 de setembro")).toBeInTheDocument();
    expect(within(marcados).getByText("Corte com Rafael")).toBeInTheDocument();
    expect(within(marcados).getByRole("button", { name: "Remarcar" })).toBeInTheDocument();

    const historico = screen.getByRole("region", { name: "Histórico" });
    const linhas = within(historico).getAllByRole("listitem");
    // O mais recente primeiro.
    expect(linhas.map((linha) => within(linha).getByText(/de setembro/).textContent)).toEqual([
      "10 de setembro",
      "5 de setembro",
    ]);
    expect(within(linhas[0]).getByText("cancelado")).toBeInTheDocument();
    expect(within(historico).queryByRole("button")).not.toBeInTheDocument();
  });

  it("sem horário marcado, diz que não há, e o histórico segue", async () => {
    montar(criarApiClientFalso({ agendamentos: [agendamento("a1", "2026-09-10", "09:00", "cancelado")] }));

    const marcados = await screen.findByRole("region", { name: "Horários marcados" });
    expect(within(marcados).getByText("Nenhum horário marcado.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Histórico" })).toBeInTheDocument();
  });

  it("sem nada no histórico, a seção não aparece", async () => {
    montar(criarApiClientFalso({ agendamentos: [agendamento("a2", "2026-09-20", "10:00", "pendente")] }), TRES_HORAS_ANTES);

    await screen.findByRole("region", { name: "Horários marcados" });
    expect(screen.queryByRole("region", { name: "Histórico" })).not.toBeInTheDocument();
  });
});
