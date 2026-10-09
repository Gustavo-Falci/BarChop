import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../src/api/ProvedorDaApi";
import type { ServicoSerializado } from "@barchop/types";
import { hojeIso, somarDias } from "../../src/formato/datas";
import { EscolhaDeServicos } from "../../src/telas/EscolhaDeServicos";
import { navegacaoFalsa } from "../ajudantes/navegacao";

// Meio-dia fixo: "hoje" e "amanhã" dos próximos horários não podem
// depender da hora em que a suíte roda.
const AGORA = new Date(2026, 9, 6, 12, 0);
const HOJE = hojeIso(AGORA);
const AMANHA = somarDias(HOJE, 1);

function montar(apiClient = criarApiClientFalso()) {
  render(
    <ProvedorDaApi valor={apiClient}>
      <EscolhaDeServicos agora={AGORA} />
    </ProvedorDaApi>
  );
}

function servico(extra: Partial<ServicoSerializado> & { id: string; nome: string }): ServicoSerializado {
  return {
    duracaoMinutos: 30,
    preco: "40.00",
    ativo: true,
    categoria: null,
    descricao: null,
    fotoUrl: null,
    ...extra,
  };
}

describe("escolha dos serviços", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("lista os serviços ativos com preço", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));
    expect(screen.getByText("R$ 40,00")).toBeInTheDocument();
  });

  it("soma duração e preço do que foi marcado", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Barba/ }));

    // Corte 30min R$40 + Barba 20min R$25 — é o "2 serviços · 50 min"
    // do design, com o total que a tela de confirmação repete.
    expect(screen.getByText("2 serviços")).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByText("R$ 65,00")).toBeInTheDocument();
  });

  it("não deixa continuar sem escolher nada", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it("leva pro passo do profissional levando os ids escolhidos", async () => {
    montar();
    await waitFor(() => screen.getByText("Corte"));

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/profissional?servicos=s1"
    );
  });

  it("começa com o que já estava na URL marcado", async () => {
    // Voltar do passo de data não pode perder a escolha.
    navegacaoFalsa.redefinir({ query: { servicos: "s2" } });
    montar();

    await waitFor(() => screen.getByText("Barba"));
    expect(screen.getByRole("checkbox", { name: /Barba/ })).toBeChecked();
  });

  it("não leva id inexistente pro próximo passo", async () => {
    // um id que a lista não traz é serviço desativado, e levá-lo adiante o faria chegar ao POST.
    navegacaoFalsa.redefinir({ query: { servicos: "s1,inexistente" } });
    montar();

    await waitFor(() => screen.getByText("Corte"));
    await userEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith(
      "/gr-barber/agendar/profissional?servicos=s1"
    );
  });

  it("exibe erro quando falha carregar os serviços", async () => {
    const falso = criarApiClientFalso();
    falso.publico.servicos = async () => {
      throw new ErroDaApi(500, "erro_interno", "");
    };
    montar(falso);

    await waitFor(() =>
      screen.getByText("Não foi possível carregar os serviços")
    );
    expect(screen.getByText("Não foi possível carregar os serviços")).toBeInTheDocument();
  });
});

describe("escolha dos serviços — o cartão e a página", () => {
  beforeEach(() => navegacaoFalsa.redefinir());

  it("agrupa por categoria, com a contagem de cada grupo", async () => {
    montar(
      criarApiClientFalso({
        servicos: [
          servico({ id: "s1", nome: "Corte", categoria: "cabelo" }),
          servico({ id: "s2", nome: "Platinado", categoria: "cabelo" }),
          servico({ id: "s3", nome: "Barba", categoria: "barba" }),
        ],
      })
    );

    const cabelo = await screen.findByRole("region", { name: "Cabelo" });
    expect(within(cabelo).getByText("2 serviços")).toBeInTheDocument();
    expect(within(cabelo).getByRole("checkbox", { name: /Platinado/ })).toBeInTheDocument();
    const barba = screen.getByRole("region", { name: "Barba" });
    expect(within(barba).getByText("1 serviço")).toBeInTheDocument();
  });

  it("o cartão mostra descrição, duração e a foto quando há", async () => {
    montar(
      criarApiClientFalso({
        servicos: [
          servico({
            id: "s1",
            nome: "Corte",
            descricao: "Máquina e tesoura, acabamento na navalha",
            fotoUrl: "https://imagens.falsas/corte.png",
          }),
        ],
      })
    );

    const caixa = await screen.findByRole("checkbox", { name: /Corte/ });
    const cartao = caixa.closest("li") as HTMLElement;
    expect(within(cartao).getByText("Máquina e tesoura, acabamento na navalha")).toBeInTheDocument();
    expect(within(cartao).getByText("30 min")).toBeInTheDocument();
    expect(cartao.querySelector("img")?.getAttribute("src")).toBe("https://imagens.falsas/corte.png");
  });

  it("os próximos horários vêm por dia, e cada um leva direto à confirmação só daquele serviço", async () => {
    montar(
      criarApiClientFalso({
        proximosHorarios: [
          {
            servicoId: "s1",
            horarios: [
              { data: HOJE, horaInicio: "19:40" },
              { data: AMANHA, horaInicio: "09:00" },
              { data: AMANHA, horaInicio: "09:30" },
            ],
          },
          { servicoId: "s2", horarios: [] },
        ],
      })
    );

    const lista = await screen.findByRole("list", { name: "Próximos horários de Corte" });
    expect(within(lista).getByText("hoje")).toBeInTheDocument();
    expect(within(lista).getByText("amanhã")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Agendar só Corte, hoje às 19:40" })
    ).toHaveAttribute(
      "href",
      `/gr-barber/agendar/confirmar?servicos=s1&data=${HOJE}&hora=19%3A40`
    );
    expect(screen.getByRole("link", { name: "Agendar só Corte, amanhã às 09:30" })).toBeInTheDocument();
    // Sem horário livre, o rodapé do cartão some.
    expect(screen.queryByRole("list", { name: "Próximos horários de Barba" })).toBeNull();
  });

  it("remarcando, não mostra os atalhos de horário: eles criariam outro agendamento", async () => {
    navegacaoFalsa.redefinir({ query: { servicos: "s1", remarcar: "a1", profissional: "bb1" } });
    montar(
      criarApiClientFalso({
        proximosHorarios: [{ servicoId: "s1", horarios: [{ data: AMANHA, horaInicio: "09:00" }] }],
      })
    );

    await screen.findByRole("checkbox", { name: /Corte/ });
    expect(screen.queryByRole("link", { name: /Agendar só/ })).toBeNull();
  });

  it("o resumo diz quando nada foi escolhido e acompanha a escolha", async () => {
    montar();
    await screen.findByRole("checkbox", { name: /Corte/ });

    const resumo = screen.getByRole("region", { name: "Sua escolha" });
    expect(within(resumo).getByText("Nenhum serviço escolhido ainda")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: /Corte/ }));

    expect(within(resumo).getByText("1 serviço")).toBeInTheDocument();
    expect(within(resumo).queryByText("Nenhum serviço escolhido ainda")).toBeNull();
  });

  it("barbearia sem serviço diz isso, em vez de uma lista vazia", async () => {
    montar(criarApiClientFalso({ servicos: [] }));

    expect(await screen.findByText("Esta barbearia ainda não cadastrou serviços.")).toBeInTheDocument();
  });

  it("erro ao carregar oferece tentar de novo", async () => {
    const falso = criarApiClientFalso();
    let falhar = true;
    const original = falso.publico.servicos;
    falso.publico.servicos = async (slug: string) => {
      if (falhar) throw new ErroDaApi(500, "erro_interno", "");
      return original(slug);
    };
    montar(falso);

    const tentar = await screen.findByRole("button", { name: /tentar de novo/i });
    falhar = false;
    await userEvent.click(tentar);

    expect(await screen.findByRole("checkbox", { name: /Corte/ })).toBeInTheDocument();
  });
});
