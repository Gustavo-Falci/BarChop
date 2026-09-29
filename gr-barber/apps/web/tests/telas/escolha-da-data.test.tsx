import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDaData } from "../../src/telas/EscolhaDaData";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Manhã do dia 9. O instante é prop, não relógio global: user-event
// trava sob fake timers, e estes testes clicam.
const MANHA = new Date("2026-09-09T10:00:00-03:00");

// O dublê devolve os mesmos horários pra qualquer dia, e o padrão dele
// (09:00 a 10:00) já passou na MANHA — por isso o "15:00" de sempre.
function montar(
  diasComVaga: Record<string, boolean>,
  { agora = MANHA, horariosLivres = ["15:00"] } = {}
) {
  const cliente = criarApiClientFalso({ diasComVaga, horariosLivres });
  render(
    <ProvedorDaApi valor={cliente}>
      <EscolhaDaData agora={agora} />
    </ProvedorDaApi>
  );
  return cliente;
}

function faixa() {
  return within(screen.getByRole("group", { name: "Próximos dias" }));
}

// Data e horário numa tela só: o fluxo tinha uma tela pra cada, e a de
// horário podia abrir vazia depois de a pessoa já ter gastado um toque
// escolhendo o dia.
describe("escolha do dia e do horário", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
  });

  it("mostra os próximos 14 dias a partir de hoje, sem vaga desabilitado", async () => {
    montar({ "2026-09-10": true, "2026-09-11": false });
    await screen.findByRole("group", { name: "Próximos dias" });

    const dias = faixa().getAllByRole("button");
    expect(dias).toHaveLength(14);
    expect(dias[0]).toHaveAccessibleName("quarta, 9 de setembro");
    expect(dias[13]).toHaveAccessibleName("terça, 22 de setembro");
    expect(faixa().getByRole("button", { name: /11 de setembro/ })).toBeDisabled();
    expect(faixa().getByRole("button", { name: /10 de setembro/ })).toBeEnabled();
  });

  it("sem data na URL, já mostra os horários do primeiro dia com vaga", async () => {
    // Um toque a menos: quem só quer "o quanto antes" não precisa
    // escolher o dia pra ver se tem horário.
    montar({ "2026-09-10": true, "2026-09-12": true });

    expect(await screen.findByText("quinta, 10 de setembro")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "15:00" })).toBeInTheDocument();
    expect(faixa().getByRole("button", { name: /10 de setembro/ })).toHaveAttribute(
      "aria-current",
      "date"
    );
  });

  it("desabilita hoje quando todos os horários do dia já passaram", async () => {
    // Visto no app rodando: às 22h, com a barbearia fechando às 18h, o
    // mês dizia que hoje tinha vaga (a API não sabe que horas são) e o
    // passo seguinte abria em "nenhum horário" — um beco sem saída.
    const NOITE = new Date("2026-09-09T20:00:00-03:00");
    montar(
      { "2026-09-09": true, "2026-09-10": true },
      { agora: NOITE, horariosLivres: ["09:00", "17:00"] }
    );
    await screen.findByRole("group", { name: "Próximos dias" });

    await waitFor(() =>
      expect(faixa().getByRole("button", { name: /, 9 de setembro/ })).toBeDisabled()
    );
    expect(faixa().getByRole("button", { name: /10 de setembro/ })).toBeEnabled();
  });

  it("não pede os horários de hoje quando o mês já diz que não tem vaga", async () => {
    const cliente = montar({ "2026-09-09": false, "2026-09-10": true });
    const doDia = vi.spyOn(cliente.publico, "disponibilidadeDoDia");

    await screen.findByRole("button", { name: "15:00" });

    const diasPedidos = doDia.mock.calls.map(([, filtro]) => filtro.data);
    expect(diasPedidos).not.toContain("2026-09-09");
  });

  it("tocar num dia troca a data na URL sem empilhar histórico nem rolar a tela", async () => {
    // replace, e não push: o "voltar" do celular deve sair do passo, não
    // desfazer cada dia tocado.
    montar({ "2026-09-10": true, "2026-09-12": true });
    await screen.findByRole("button", { name: "15:00" });

    await userEvent.click(faixa().getByRole("button", { name: /12 de setembro/ }));

    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&data=2026-09-12",
      { scroll: false }
    );
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });

  it("usa a data da URL quando ela vem", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-12" } });
    montar({ "2026-09-10": true, "2026-09-12": true });

    expect(await screen.findByText("sábado, 12 de setembro")).toBeInTheDocument();
  });

  it("ignora data passada na URL e cai no primeiro dia com vaga", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-01" } });
    montar({ "2026-09-10": true });

    expect(await screen.findByText("quinta, 10 de setembro")).toBeInTheDocument();
  });

  it("escolher o horário leva pra confirmação com o dia e a hora", async () => {
    montar({ "2026-09-10": true });

    await userEvent.click(await screen.findByRole("button", { name: "15:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=15%3A00"
    );
  });

  it("no remarcar leva o id do agendamento até a confirmação", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", remarcar: "a1" } });
    montar({ "2026-09-10": true });

    await userEvent.click(await screen.findByRole("button", { name: "15:00" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/confirmar?servicos=s1&data=2026-09-10&hora=15%3A00&remarcar=a1"
    );
  });

  it("mostra o recado de horário ocupado que a confirmação mandou", async () => {
    navegacaoFalsa.redefinir({
      query: { servicos: "s1", data: "2026-09-10", aviso: "horario_ocupado" },
    });
    montar({ "2026-09-10": true });

    expect(await screen.findByText(/acabou de ser ocupado/i)).toBeInTheDocument();
  });

  it("dia sem horário aponta o próximo dia com vaga, em vez de virar beco", async () => {
    // O mês diz que o 11 tem vaga, mas o dia escolhido veio vazio (a
    // última vaga foi ocupada entre um toque e outro).
    navegacaoFalsa.redefinir({ query: { servicos: "s1", data: "2026-09-10" } });
    montar({ "2026-09-10": true, "2026-09-11": true }, { horariosLivres: [] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Ver sexta, 11 de setembro" })
    );

    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&data=2026-09-11",
      { scroll: false }
    );
  });

  it("'Outra data' abre o calendário pra ir além dos 14 dias", async () => {
    montar({ "2026-09-10": true, "2026-10-15": true });
    await screen.findByRole("button", { name: "15:00" });

    await userEvent.click(screen.getByRole("button", { name: "Outra data" }));
    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "15 de outubro" })
    );

    expect(navegacaoFalsa.replace).toHaveBeenCalledWith(
      "/gr-barber/agendar/data?servicos=s1&data=2026-10-15",
      { scroll: false }
    );
  });

  it("quando os 14 dias da faixa atravessam o mês, pede os dois meses", async () => {
    // Visto no app: no dia 28 a faixa é quase toda do mês seguinte, e a
    // rota de disponibilidade é por mês.
    const cliente = criarApiClientFalso({
      diasComVaga: { "2026-10-02": true },
      horariosLivres: ["15:00"],
    });
    const original = cliente.publico.disponibilidadeDoMes;
    const mesesPedidos: string[] = [];
    cliente.publico.disponibilidadeDoMes = vi.fn((slug, filtro) => {
      mesesPedidos.push(filtro.mes);
      return original(slug, filtro);
    });

    render(
      <ProvedorDaApi valor={cliente}>
        <EscolhaDaData agora={new Date("2026-09-28T10:00:00-03:00")} />
      </ProvedorDaApi>
    );

    expect(await screen.findByText("sexta, 2 de outubro")).toBeInTheDocument();
    expect([...mesesPedidos].sort()).toEqual(["2026-09", "2026-10"]);
  });

  it("sem vaga nos próximos 14 dias, abre o calendário direto", async () => {
    montar({});

    expect(
      await screen.findByText(/nenhum horário livre nos próximos 14 dias/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Próximo mês" })).toBeInTheDocument();
  });

  it("volta pro passo de serviços quando a URL não traz nenhum", async () => {
    navegacaoFalsa.redefinir({ query: {} });
    montar({});

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/agendar")
    );
  });

  it("avisa quando não consegue carregar a agenda, em vez de desenhar tudo indisponível", async () => {
    // Slug diferente do da barbearia semeada: o dublê responde 404,
    // igual à API real com um slug que sumiu.
    navegacaoFalsa.redefinir({ slug: "outra", query: { servicos: "s1" } });
    montar({});

    await screen.findByRole("heading", { name: /não foi possível carregar a agenda/i });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
