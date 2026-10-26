import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { MembroDaEquipe, PlanoDoPainel } from "@barchop/types";

import { NavegacaoDoPainel } from "../../../src/painel/NavegacaoDoPainel";
import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { CadastroDePlano } from "../../../src/telas/painel/CadastroDePlano";
import { ListaDePlanos } from "../../../src/telas/painel/ListaDePlanos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Os planos no painel (Onda 2, marco 3, PR 7a do plano
// planos-de-assinatura): a lista agrupada por quem vende, a vitrine, o
// cadastro do plano e, no membro, a liberação pra vender e o desativar
// de quem tem assinante. O "online" liga no PR 11.

const gustavo: MembroDaEquipe = {
  id: "bb0",
  nome: "Gustavo",
  email: "gustavo@gr.com",
  telefone: null,
  papel: "profissional",
  atende: true,
  ativo: true,
  fotoUrl: null,
  convitePendente: false,
  podeVenderPlanos: true,
};

const daCasa: PlanoDoPainel = {
  id: "pl1",
  daCasa: true,
  vendedor: null,
  nome: "Corte ilimitado",
  descricao: null,
  ciclo: "mensal",
  precoCentavos: 12000,
  diasDeTeste: 0,
  fixoPorAtendimentoCentavos: 2500,
  aceitaOnline: false,
  aceitaNoBalcao: true,
  onlineIndisponivel: false,
  ativo: true,
  servicos: [{ servicoId: "s1", nome: "Corte", usosPorCiclo: null }],
  assinantes: 8,
};

const CONTA_DA_CASA = {
  provedor: "asaas" as const,
  modo: "teste" as const,
  chaveFinal: "1234",
  conectadaEm: "2026-10-25T15:00:00.000Z",
};

const doGustavo: PlanoDoPainel = {
  ...daCasa,
  id: "pl2",
  daCasa: false,
  vendedor: { id: "bb0", nome: "Gustavo" },
  nome: "2 cortes",
  ciclo: "trimestral",
  precoCentavos: 27000,
  fixoPorAtendimentoCentavos: null,
  servicos: [
    { servicoId: "s1", nome: "Corte", usosPorCiclo: 2 },
    { servicoId: "s2", nome: "Barba", usosPorCiclo: 1 },
  ],
  assinantes: 0,
  ativo: false,
};

function comPlanos(extra: Parameters<typeof criarApiClientFalso>[0] = {}) {
  const falso = criarApiClientFalso({ planos: [daCasa, doGustavo], ...extra });
  falso.estado.equipe!.push({ ...gustavo });
  return falso;
}

// O <tbody> do grupo, pelo título dele.
function grupo(titulo: HTMLElement): HTMLElement {
  return titulo.closest("tbody")!;
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/planos" });
});

describe("Planos na barra", () => {
  it("aparece pra todos os papéis", async () => {
    montarPainel(<NavegacaoDoPainel />, criarApiClientFalso({ papel: "recepcao" }));
    expect(await screen.findByRole("link", { name: /planos/i })).toHaveAttribute("href", "/painel/planos");
  });
});

describe("a lista de planos", () => {
  it("agrupa por quem vende, com o preço do ciclo e quantos assinam", async () => {
    montarPainel(<ListaDePlanos />, comPlanos());

    const casa = grupo(await screen.findByText("Da casa"));
    expect(within(casa).getByText("Corte ilimitado")).toBeInTheDocument();
    expect(within(casa).getByText(/R\$\s?120,00 por mês/)).toBeInTheDocument();
    expect(within(casa).getByText("8 assinantes")).toBeInTheDocument();

    const dele = grupo(screen.getByText("De Gustavo"));
    expect(within(dele).getByText(/R\$\s?270,00 por trimestre/)).toBeInTheDocument();
    expect(within(dele).getByText("2× Corte, 1× Barba")).toBeInTheDocument();
    expect(within(dele).getByText("Desativado")).toBeInTheDocument();
  });

  it("o plano com online e sem a conta de quem vende diz que o pagamento online está indisponível", async () => {
    montarPainel(<ListaDePlanos />, comPlanos({ planos: [{ ...daCasa, aceitaOnline: true }, doGustavo] }));

    const casa = grupo(await screen.findByText("Da casa"));
    expect(within(casa).getByText("Pagamento online indisponível")).toBeInTheDocument();
    expect(within(grupo(screen.getByText("De Gustavo"))).queryByText("Pagamento online indisponível")).not.toBeInTheDocument();
  });

  it("com a conta da casa conectada, o aviso some", async () => {
    montarPainel(
      <ListaDePlanos />,
      comPlanos({ planos: [{ ...daCasa, aceitaOnline: true }, doGustavo], contasOnline: { casa: CONTA_DA_CASA } })
    );

    await screen.findByText("Da casa");
    expect(screen.queryByText("Pagamento online indisponível")).not.toBeInTheDocument();
  });

  it("abre o plano na linha e cria pelo botão", async () => {
    montarPainel(<ListaDePlanos />, comPlanos());
    await userEvent.click(await screen.findByRole("button", { name: /corte ilimitado/i }));
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/planos/pl1");
    expect(screen.getByRole("link", { name: /novo plano/i })).toHaveAttribute("href", "/painel/planos/novo");
  });

  it("o dono liga a vitrine, que diz o efeito", async () => {
    const falso = comPlanos();
    const ligar = vi.spyOn(falso.barbeiro, "ligarVitrine");
    montarPainel(<ListaDePlanos />, falso);

    const chave = await screen.findByRole("switch", { name: /mostrar os planos na página/i });
    expect(chave).not.toBeChecked();
    await userEvent.click(chave);
    await waitFor(() => expect(ligar).toHaveBeenCalledWith(true));
    expect(await screen.findByText(/os planos ativos aparecem na sua página/i)).toBeInTheDocument();
  });

  it("a recepção vê, mas não cria, não abre nem mexe na vitrine", async () => {
    montarPainel(<ListaDePlanos />, comPlanos({ papel: "recepcao" }));
    expect(await screen.findByText("Corte ilimitado")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /novo plano/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /corte ilimitado/i })).not.toBeInTheDocument();
  });

  it("fora do Completo, o convite", async () => {
    const falso = comPlanos();
    falso.estado.assinatura = { ...falso.estado.assinatura!, situacao: "ativa", plano: "essencial", planoEfetivo: "essencial" };
    montarPainel(<ListaDePlanos />, falso);
    expect(await screen.findByText(/planos de assinatura são do plano completo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ver os planos do barchop/i })).toHaveAttribute("href", "/painel/faturas");
  });

  it("sem plano nenhum, o convite pra criar o primeiro", async () => {
    montarPainel(<ListaDePlanos />, criarApiClientFalso());
    expect(await screen.findByText(/nenhum plano ainda/i)).toBeInTheDocument();
  });
});

describe("o cadastro do plano", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/planos/novo" }));

  it("cria o plano da casa: serviços com usos, o fixo de quem atende, e no balcão", async () => {
    const falso = comPlanos();
    const criar = vi.spyOn(falso.barbeiro, "criarPlano");
    montarPainel(<CadastroDePlano />, falso);

    await userEvent.click(await screen.findByRole("radio", { name: "Da casa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Barba do mês");
    await userEvent.type(screen.getByLabelText("Preço"), "80,00");
    await userEvent.click(screen.getByRole("checkbox", { name: /barba/i }));
    const usos = screen.getByRole("spinbutton", { name: /usos de barba por ciclo/i });
    await userEvent.clear(usos);
    await userEvent.type(usos, "4");
    await userEvent.type(screen.getByLabelText(/quem atende ganha/i), "15,00");
    expect(screen.getByText(/cada mensalidade de r\$\s?80,00 fica com a casa/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith({
        daCasa: true,
        nome: "Barba do mês",
        descricao: null,
        ciclo: "mensal",
        precoCentavos: 8000,
        diasDeTeste: 0,
        fixoPorAtendimentoCentavos: 1500,
        aceitaOnline: false,
        aceitaNoBalcao: true,
        servicos: [{ servicoId: "s2", usosPorCiclo: 4 }],
      })
    );
    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/planos");
  });

  it("o online liga no plano, e o apoio leva a Pagamentos online (PR 11)", async () => {
    const falso = comPlanos();
    const criar = vi.spyOn(falso.barbeiro, "criarPlano");
    montarPainel(<CadastroDePlano />, falso);
    const online = await screen.findByRole("checkbox", { name: /online, na página/i });
    // O novo nasce só no balcão.
    expect(online).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /no balcão/i })).toBeChecked();
    expect(screen.getByRole("link", { name: "Pagamentos online" })).toHaveAttribute(
      "href",
      "/painel/configuracoes/pagamentos-online"
    );

    await userEvent.click(online);
    await userEvent.click(screen.getByRole("checkbox", { name: /no balcão/i }));
    await userEvent.type(screen.getByLabelText("Nome"), "Online");
    await userEvent.type(screen.getByLabelText(/preço/i), "50,00");
    await userEvent.type(screen.getByLabelText(/quem atende ganha/i), "0,00");
    await userEvent.click(screen.getAllByRole("checkbox").find((c) => c.closest("li"))!);
    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({ aceitaOnline: true, aceitaNoBalcao: false }))
    );
  });

  it("confere antes de mandar: sem preço e sem serviço, diz os dois", async () => {
    const falso = comPlanos();
    const criar = vi.spyOn(falso.barbeiro, "criarPlano");
    montarPainel(<CadastroDePlano />, falso);
    await userEvent.type(await screen.findByLabelText("Nome"), "Vazio");
    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));
    expect(await screen.findByText(/use um valor como 120,00/i)).toBeInTheDocument();
    expect(screen.getByText(/escolha pelo menos um serviço/i)).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
  });

  it("o profissional liberado cria o próprio, sem escolher de quem é nem o fixo", async () => {
    const falso = comPlanos({ papel: "profissional" });
    falso.estado.equipe!.find((m) => m.id === "bb1")!.podeVenderPlanos = true;
    const criar = vi.spyOn(falso.barbeiro, "criarPlano");
    montarPainel(<CadastroDePlano />, falso);

    await userEvent.type(await screen.findByLabelText("Nome"), "Meu corte");
    expect(screen.queryByRole("radio", { name: "Da casa" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/quem atende ganha/i)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Preço"), "90");
    await userEvent.click(screen.getByRole("checkbox", { name: /corte/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ daCasa: false, fixoPorAtendimentoCentavos: null, precoCentavos: 9000 })
      )
    );
  });

  it("editando o plano com online e sem a conta, avisa que o pagamento online está indisponível", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/planos/pl1", params: { id: "pl1" } });
    montarPainel(<CadastroDePlano />, comPlanos({ planos: [{ ...daCasa, aceitaOnline: true }, doGustavo] }));

    expect(await screen.findByText(/pagamento online indisponível/i)).toBeInTheDocument();
  });

  it("edita: de quem é não muda, a lista de serviços vai inteira, e desativa", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/planos/pl1", params: { id: "pl1" } });
    const falso = comPlanos();
    const editar = vi.spyOn(falso.barbeiro, "editarPlano");
    montarPainel(<CadastroDePlano />, falso);

    const nome = await screen.findByLabelText("Nome");
    await waitFor(() => expect(nome).toHaveValue("Corte ilimitado"));
    expect(screen.queryByRole("radio", { name: "Da casa" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /ilimitado/i })).toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: /barba/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));
    await waitFor(() =>
      expect(editar).toHaveBeenCalledWith(
        "pl1",
        expect.objectContaining({
          servicos: [
            { servicoId: "s1", usosPorCiclo: null },
            { servicoId: "s2", usosPorCiclo: 1 },
          ],
        })
      )
    );

    await userEvent.click(screen.getByRole("button", { name: "Desativar" }));
    await waitFor(() => expect(editar).toHaveBeenLastCalledWith("pl1", { ativo: false }));
  });

  it("o erro da API marca o campo certo", async () => {
    const falso = comPlanos();
    vi.spyOn(falso.barbeiro, "criarPlano").mockRejectedValueOnce(
      Object.assign(new Error("x"), { status: 422, codigo: "servico_fora_do_vendedor", mensagem: "x" })
    );
    montarPainel(<CadastroDePlano />, falso);
    await userEvent.type(await screen.findByLabelText("Nome"), "Meu");
    await userEvent.click(screen.getByRole("radio", { name: /meu/i }));
    await userEvent.type(screen.getByLabelText("Preço"), "90");
    await userEvent.click(screen.getByRole("checkbox", { name: /corte/i }));
    await userEvent.click(screen.getByRole("button", { name: /salvar plano/i }));
    expect(await screen.findByText(/só serviços que você faz/i)).toBeInTheDocument();
  });
});

describe("o membro e os planos", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/equipe/bb0", params: { id: "bb0" } }));

  it("o dono libera o profissional pra vender planos", async () => {
    const falso = comPlanos();
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    const vende = await screen.findByRole("checkbox", { name: /pode vender planos/i });
    expect(vende).toBeChecked();
    await userEvent.click(vende);
    await userEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("bb0", expect.objectContaining({ podeVenderPlanos: false }))
    );
  });

  it("desativar quem tem assinante pede confirmação e cancela as assinaturas", async () => {
    const falso = comPlanos();
    falso.estado.planos!.find((p) => p.id === "pl2")!.assinantes = 3;
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    const situacao = await screen.findByRole("region", { name: "Situação" });
    await userEvent.click(within(situacao).getByRole("button", { name: "Desativar" }));
    expect(await within(situacao).findByText(/3 assinantes nos planos próprios/i)).toBeInTheDocument();

    await userEvent.click(within(situacao).getByRole("button", { name: /desativar e cancelar as assinaturas/i }));
    await waitFor(() =>
      expect(atualizar).toHaveBeenLastCalledWith("bb0", { ativo: false, cancelarAssinaturas: true })
    );
    expect(await within(situacao).findByText(/reativar devolve/i)).toBeInTheDocument();
  });
});
