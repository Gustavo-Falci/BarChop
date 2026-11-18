import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { MembroDaEquipe } from "@barchop/types";

import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { ListaDaEquipe } from "../../../src/telas/painel/ListaDaEquipe";
import { PixDaDiferenca } from "../../../src/telas/painel/PixDaDiferenca";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Profissional novo no meio do período pago (plano
// profissional-novo-pago, PR 4, canvas aprovado em 18/11): no cartão, o
// valor antes de incluir e a recusa sem mudar nada; no Pix, quem entra
// aguarda o Pix da diferença.

const FIM = "2026-12-05T15:00:00.000Z";
const CARTAO = { forma: "cartao" as const, valorCentavos: 850, cartaoFinal: "4242", ate: FIM };
const PIX = { forma: "pix" as const, valorCentavos: 850, cartaoFinal: null, ate: FIM };

function membro(id: string, nome: string, extra: Partial<MembroDaEquipe> = {}): MembroDaEquipe {
  return {
    id,
    nome,
    email: `${id}@gr.com`,
    telefone: null,
    papel: "profissional",
    atende: true,
    ativo: true,
    fotoUrl: null,
    convitePendente: false,
    podeVenderPlanos: false,
    aguardaPagamento: false,
    ...extra,
  };
}

function aguardando(id: string, nome: string) {
  return membro(id, nome, { ativo: false, aguardaPagamento: true, convitePendente: true });
}

async function preencherConvite() {
  await userEvent.type(await screen.findByLabelText(/^nome/i), "Joana Souza");
  await userEvent.type(screen.getByLabelText(/e-mail/i), "joana@gr.com");
}

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/equipe/novo" });
});

describe("convidar com o plano pago no cartão", () => {
  it("o valor e o cartão aparecem antes, e o botão diz que cobra", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso({ vagaCobrada: CARTAO }));

    expect(await screen.findByText("R$ 8,50 agora")).toBeInTheDocument();
    expect(screen.getByText(/no cartão final 4242, até 05\/12/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar convite e cobrar R$ 8,50" })).toBeInTheDocument();
  });

  it("a recepção não ocupa vaga: some o valor e o botão volta ao de sempre", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso({ vagaCobrada: CARTAO }));
    await screen.findByText("R$ 8,50 agora");

    await userEvent.click(screen.getByRole("radio", { name: /recepção/i }));

    expect(screen.queryByText("R$ 8,50 agora")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar convite" })).toBeInTheDocument();
  });

  it("sem cobrança, nada muda", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso());

    expect(await screen.findByRole("button", { name: "Enviar convite" })).toBeInTheDocument();
    expect(screen.queryByText(/agora$/)).not.toBeInTheDocument();
  });

  it("cobrou: volta pra equipe", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso({ vagaCobrada: CARTAO }));
    await preencherConvite();

    await userEvent.click(await screen.findByRole("button", { name: "Enviar convite e cobrar R$ 8,50" }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe"));
  });

  it("cartão recusado: diz que nada foi feito, oferece atualizar o cartão e guarda o que foi digitado", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso({ vagaCobrada: { ...CARTAO, recusa: true } }));
    await preencherConvite();

    await userEvent.click(await screen.findByRole("button", { name: "Enviar convite e cobrar R$ 8,50" }));

    expect(
      await screen.findByText("O banco recusou o cartão final 4242. O convite não foi enviado e nada foi cobrado.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar cartão" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Joana Souza")).toBeInTheDocument();
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });
});

describe("convidar com o plano pago no Pix", () => {
  it("diz que a pessoa entra depois do Pix, e o convite leva ao Pix da diferença", async () => {
    montarPainel(<CadastroDeMembro />, criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX }));

    expect(await screen.findByText("R$ 8,50 no Pix")).toBeInTheDocument();
    expect(screen.getByText(/entra na equipe depois do pix da diferença/i)).toBeInTheDocument();
    await preencherConvite();

    await userEvent.click(screen.getByRole("button", { name: "Enviar convite e pagar no Pix" }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe/pix"));
  });
});

describe("reativar com o plano pago", () => {
  function comInativo(vagaCobrada: typeof CARTAO | typeof PIX | (typeof CARTAO & { recusa: true })) {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada });
    falso.estado.equipe!.push(membro("m9", "Marcos", { ativo: false }));
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m9", params: { id: "m9" } });
    return falso;
  }

  it("no cartão, a situação mostra o valor e o botão cobra", async () => {
    const falso = comInativo(CARTAO);
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarMembro");
    montarPainel(<CadastroDeMembro />, falso);

    expect(await screen.findByText("R$ 8,50 agora")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reativar e cobrar R$ 8,50" }));

    await waitFor(() => expect(atualizar).toHaveBeenCalledWith("m9", { ativo: true }));
  });

  it("cartão recusado: o aviso fica na situação e o membro segue inativo", async () => {
    montarPainel(<CadastroDeMembro />, comInativo({ ...CARTAO, recusa: true }));

    await userEvent.click(await screen.findByRole("button", { name: "Reativar e cobrar R$ 8,50" }));

    expect(
      await screen.findByText("O banco recusou o cartão final 4242. Marcos não foi reativado e nada foi cobrado.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Atualizar cartão" })).toBeInTheDocument();
  });

  it("no Pix, reativar leva ao Pix da diferença", async () => {
    montarPainel(<CadastroDeMembro />, comInativo(PIX));

    await userEvent.click(await screen.findByRole("button", { name: "Reativar e pagar no Pix" }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe/pix"));
  });

  it("quem aguarda pagamento: a situação oferece pagar ou desistir, e não reativar", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX });
    falso.estado.equipe!.push(aguardando("m9", "Marcos"));
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/m9", params: { id: "m9" } });
    montarPainel(<CadastroDeMembro />, falso);

    expect(await screen.findByText(/aguarda o pix da diferença/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar no Pix" })).toHaveAttribute("href", "/painel/equipe/pix");
    expect(screen.queryByRole("button", { name: /reativar/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Desistir" }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe"));
  });
});

describe("a equipe com quem aguarda o Pix", () => {
  function comAguardando(...quem: MembroDaEquipe[]) {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX });
    falso.estado.equipe!.push(...quem);
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe" });
    return falso;
  }

  it("a faixa diz quem aguarda e quanto custa um Pix só pra todos", async () => {
    montarPainel(<ListaDaEquipe />, comAguardando(aguardando("m8", "Joana"), aguardando("m9", "Bruno")));

    expect(await screen.findByText("Joana e Bruno aguardam o Pix da diferença")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Pagar R$ 17,00 no Pix" }));

    expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe/pix");
  });

  it("uma pessoa só, no singular", async () => {
    montarPainel(<ListaDaEquipe />, comAguardando(aguardando("m8", "Joana")));

    expect(await screen.findByText("Joana aguarda o Pix da diferença")).toBeInTheDocument();
  });

  it("sem ninguém aguardando, não há faixa", async () => {
    montarPainel(<ListaDaEquipe />, comAguardando());

    await screen.findByText("Rafael");
    expect(screen.queryByText(/aguarda/i)).not.toBeInTheDocument();
  });

  it("a linha diz Aguardando pagamento, e a pílula filtra quem aguarda", async () => {
    montarPainel(<ListaDaEquipe />, comAguardando(aguardando("m8", "Joana")));

    const joana = (await screen.findByText("Joana")).closest("tr") as HTMLElement;
    expect(within(joana).getByText("Aguardando pagamento")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: /aguardam pagamento/i }));
    expect(screen.queryByText("Rafael")).not.toBeInTheDocument();
    expect(screen.getByText("Joana")).toBeInTheDocument();
  });

  it("Desistir na linha tira a pessoa sem abrir o cadastro", async () => {
    montarPainel(<ListaDaEquipe />, comAguardando(aguardando("m8", "Joana")));

    const joana = (await screen.findByText("Joana")).closest("tr") as HTMLElement;
    await userEvent.click(within(joana).getByRole("button", { name: "Desistir de incluir Joana" }));

    await waitFor(() => expect(screen.queryByText("Joana")).not.toBeInTheDocument());
    expect(navegacaoFalsa.push).not.toHaveBeenCalled();
  });
});

describe("o Pix da diferença", () => {
  beforeEach(() => navegacaoFalsa.redefinir({ pathname: "/painel/equipe/pix" }));

  it("diz de quem é a vaga, o valor e o QR", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX });
    falso.estado.equipe!.push(aguardando("m8", "Joana"));
    montarPainel(<PixDaDiferenca />, falso);

    expect(await screen.findByRole("heading", { level: 1, name: "Pague a vaga da Joana" })).toBeInTheDocument();
    expect(screen.getByTestId("valor-do-pix")).toHaveTextContent("R$ 8,50");
    expect(screen.getByRole("img", { name: "QR do Pix de R$ 8,50" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pagar depois" })).toHaveAttribute("href", "/painel/equipe");
  });

  it("duas pessoas, no plural", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX });
    falso.estado.equipe!.push(aguardando("m8", "Joana"), aguardando("m9", "Bruno"));
    montarPainel(<PixDaDiferenca />, falso);

    expect(await screen.findByRole("heading", { level: 1, name: "Pague as vagas de Joana e Bruno" })).toBeInTheDocument();
    expect(await screen.findByTestId("valor-do-pix")).toHaveTextContent("R$ 17,00");
  });

  it("Já paguei libera quem aguardava e volta pra equipe", async () => {
    const falso = criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX });
    falso.estado.equipe!.push(aguardando("m8", "Joana"));
    const pagar = vi.spyOn(falso.barbeiro, "jaPagueiADiferenca");
    montarPainel(<PixDaDiferenca />, falso);

    await userEvent.click(await screen.findByRole("button", { name: "Já paguei" }));

    await waitFor(() => expect(navegacaoFalsa.push).toHaveBeenCalledWith("/painel/equipe"));
    expect(pagar).toHaveBeenCalled();
    expect(falso.estado.equipe!.find((m) => m.id === "m8")).toMatchObject({ ativo: true, aguardaPagamento: false });
  });

  it("ninguém aguardando: diz isso e leva de volta pra equipe", async () => {
    montarPainel(<PixDaDiferenca />, criarApiClientFalso({ pixLigado: true, vagaCobrada: PIX }));

    expect(await screen.findByText("Ninguém aguarda pagamento.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /equipe/i })).toHaveAttribute("href", "/painel/equipe");
  });
});
