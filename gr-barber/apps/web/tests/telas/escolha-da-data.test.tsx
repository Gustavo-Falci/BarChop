import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@gr-barber/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import { EscolhaDaData } from "../../src/telas/EscolhaDaData";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Manhã do dia 9. O instante é prop, não relógio global: user-event
// trava sob fake timers, e estes testes clicam.
const MANHA = new Date("2026-09-09T10:00:00-03:00");

// Os horários do dublê valem pra qualquer dia. O padrão dele (09:00 a
// 10:00) já passou na MANHA fixada, então quem testa "hoje" diz quais
// horários sobram.
function montar(
  diasComVaga: Record<string, boolean>,
  { agora = MANHA, horariosLivres = ["15:00"] } = {}
) {
  render(
    <ProvedorDaApi valor={criarApiClientFalso({ diasComVaga, horariosLivres })}>
      <EscolhaDaData agora={agora} />
    </ProvedorDaApi>
  );
}

// Os dias são consultados pela data por extenso porque é o nome
// acessível que o Calendario passou a expor: "10" sozinho se repete em
// todo mês e não diz de qual grade é.
describe("escolha da data", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1" } });
  });

  it("desabilita dia sem vaga", async () => {
    montar({ "2026-09-10": true, "2026-09-11": false });
    await waitFor(() => screen.getByRole("button", { name: "10 de setembro" }));

    expect(screen.getByRole("button", { name: "11 de setembro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10 de setembro" })).toBeEnabled();
  });

  it("desabilita dia passado mesmo quando a API diz que tem vaga", async () => {
    // A API não sabe que dia é hoje: /disponibilidade/mes marca ontem
    // como disponível. Quem barra é esta tela — sem isso o cliente
    // agenda no passado e tranca a própria conta.
    montar({ "2026-09-08": true, "2026-09-10": true });
    await waitFor(() => screen.getByRole("button", { name: "10 de setembro" }));

    expect(screen.getByRole("button", { name: "8 de setembro" })).toBeDisabled();
  });

  it("hoje continua escolhível", async () => {
    montar({ "2026-09-09": true });
    await waitFor(() => screen.getByRole("button", { name: "9 de setembro" }));

    expect(screen.getByRole("button", { name: "9 de setembro" })).toBeEnabled();
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
    await waitFor(() => screen.getByRole("button", { name: "10 de setembro" }));

    expect(screen.getByRole("button", { name: "9 de setembro" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "10 de setembro" })).toBeEnabled();
  });

  it("não pede os horários de hoje quando o mês já diz que não tem vaga", async () => {
    const cliente = criarApiClientFalso({ diasComVaga: { "2026-09-09": false } });
    const doDia = vi.spyOn(cliente.publico, "disponibilidadeDoDia");

    render(
      <ProvedorDaApi valor={cliente}>
        <EscolhaDaData agora={MANHA} />
      </ProvedorDaApi>
    );
    await waitFor(() => screen.getByRole("button", { name: "9 de setembro" }));

    expect(doDia).not.toHaveBeenCalled();
  });

  it("leva pro passo de horário com a data escolhida", async () => {
    montar({ "2026-09-10": true });
    await waitFor(() => screen.getByRole("button", { name: "10 de setembro" }));

    await userEvent.click(screen.getByRole("button", { name: "10 de setembro" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/horario?servicos=s1&data=2026-09-10"
    );
  });

  it("volta pro passo de serviços quando a URL não traz nenhum", async () => {
    navegacaoFalsa.redefinir({ query: {} });
    montar({});

    await waitFor(() =>
      expect(navegacaoFalsa.replace).toHaveBeenCalledWith("/gr-barber/agendar")
    );
  });

  it("avisa quando não consegue carregar a agenda, em vez de desenhar o mês como indisponível", async () => {
    // Slug diferente do da barbearia semeada: o dublê responde 404,
    // igual à API real com um slug que sumiu.
    navegacaoFalsa.redefinir({ slug: "outra", query: { servicos: "s1" } });
    montar({});

    await waitFor(() => screen.getByRole("heading"));

    // O ponto que importa: nenhum dia aparece. Um mês inteiro de
    // botões desabilitados seria indistinguível de uma agenda lotada.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("troca de mês refaz a busca de disponibilidade com o mês novo", async () => {
    // Um dia marcado em cada mês: se a tela ficasse presa no mapa de
    // setembro, o dia 15 de outubro apareceria desabilitado mesmo tendo
    // vaga — o sinal de que a resposta antiga sobreviveu à troca.
    const cliente = criarApiClientFalso({
      diasComVaga: { "2026-09-10": true, "2026-10-15": true },
    });
    // Envolve o método real com um espião: grava o `mes` que cada
    // chamada pediu, sem reescrever o comportamento do dublê.
    const original = cliente.publico.disponibilidadeDoMes;
    const mesesPedidos: string[] = [];
    cliente.publico.disponibilidadeDoMes = vi.fn((slug, filtro) => {
      mesesPedidos.push(filtro.mes);
      return original(slug, filtro);
    });

    render(
      <ProvedorDaApi valor={cliente}>
        <EscolhaDaData agora={MANHA} />
      </ProvedorDaApi>
    );
    await waitFor(() => screen.getByRole("button", { name: "10 de setembro" }));
    expect(screen.getByText(/setembro/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Próximo mês" }));

    await waitFor(() => screen.getByText(/outubro/i));
    // Confirma que a disponibilidade usada é a de outubro, não a
    // resposta antiga de setembro ainda pendurada no estado.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "15 de outubro" })).toBeEnabled()
    );

    expect(mesesPedidos).toEqual(["2026-09", "2026-10"]);
  });

  it("mês inteiramente no passado não quebra e desabilita todo dia", async () => {
    // Agosto inteiro é anterior ao "hoje" fixado (9 de setembro),
    // mesmo com um dia marcado como disponível na semente — o passado
    // desabilita antes de a disponibilidade da API importar.
    montar({ "2026-08-15": true });
    await waitFor(() => screen.getByRole("button", { name: "9 de setembro" }));

    await userEvent.click(screen.getByRole("button", { name: "Mês anterior" }));

    await waitFor(() => screen.getByText(/agosto/i));

    const diasDoMes = screen
      .getAllByRole("button")
      .filter((botao) => /^\d+$/.test(botao.textContent ?? ""));

    expect(diasDoMes.length).toBeGreaterThan(0);
    diasDoMes.forEach((dia) => expect(dia).toBeDisabled());
  });
});
