import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import { DadosDoNegocio } from "../../../src/telas/painel/configuracoes/DadosDoNegocio";
import { NotificacoesDaBarbearia } from "../../../src/telas/painel/configuracoes/NotificacoesDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Painel v2, marco 2, PR D: as comodidades viram uma grade de cartões
// com ícone e a antecedência do lembrete vira pílulas com a consequência
// escrita. O salvar continua o mesmo (coberto em pagina-rica e em
// lembrete-no-painel); aqui é a forma.

beforeEach(() => {
  localStorage.clear();
});

describe("comodidades em grade", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/dados-do-negocio", query: { aba: "comodidades" } });
  });

  it("cada comodidade e cada forma de pagamento é um cartão com ícone", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    const comodidades = await screen.findByRole("group", { name: "Comodidades" });
    const pagamento = screen.getByRole("group", { name: "Formas de pagamento" });
    expect(within(comodidades).getAllByRole("checkbox")).toHaveLength(8);
    expect(within(pagamento).getAllByRole("checkbox")).toHaveLength(4);

    for (const caixa of [...within(comodidades).getAllByRole("checkbox"), ...within(pagamento).getAllByRole("checkbox")]) {
      const cartao = caixa.closest("label");
      expect(cartao, "o cartão inteiro é o rótulo da caixa").not.toBeNull();
      // O ícone é enfeite: quem nomeia a caixa é o texto.
      expect(cartao!.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("o nome da caixa é só o texto do cartão, sem o ícone", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    expect(await screen.findByRole("checkbox", { name: "Ar-condicionado" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Cartão de crédito" })).toBeInTheDocument();
  });

  it("marca pelo teclado: Tab chega na caixa e espaço marca", async () => {
    montarPainel(<DadosDoNegocio />, criarApiClientFalso());

    const wifi = await screen.findByRole("checkbox", { name: "Wi-Fi" });
    wifi.focus();
    await userEvent.keyboard(" ");
    expect(wifi).toBeChecked();
    await userEvent.tab();
    expect(screen.getByRole("checkbox", { name: "Ar-condicionado" })).toHaveFocus();
  });
});

describe("antecedência do lembrete em pílulas", () => {
  beforeEach(() => {
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/notificacoes" });
  });

  it("as três antecedências estão à vista, com a salva marcada", async () => {
    montarPainel(<NotificacoesDaBarbearia />, criarApiClientFalso());

    const grupo = await screen.findByRole("group", { name: /quando o lembrete sai/i });
    const opcoes = within(grupo).getAllByRole("radio");
    expect(opcoes.map((opcao) => opcao.getAttribute("value"))).toEqual(["24", "12", "2"]);
    expect(within(grupo).getByRole("radio", { name: "24 h antes" })).toBeChecked();
  });

  it("escreve a consequência da escolha e acompanha a troca", async () => {
    montarPainel(<NotificacoesDaBarbearia />, criarApiClientFalso());

    expect(await screen.findByText("O cliente recebe o lembrete 24 horas antes do horário.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "2 h antes" }));
    expect(screen.getByText("O cliente recebe o lembrete 2 horas antes do horário.")).toBeInTheDocument();
  });

  it("com o lembrete desligado, a consequência diz que nada sai", async () => {
    montarPainel(<NotificacoesDaBarbearia />, criarApiClientFalso());

    await userEvent.click(await screen.findByRole("checkbox", { name: /enviar lembrete por e-mail/i }));

    expect(screen.getByText(/lembrete desligado/i)).toBeInTheDocument();
    expect(screen.queryByText(/o cliente recebe o lembrete/i)).not.toBeInTheDocument();
  });

  it("a pílula escolhida é a que vai no salvar", async () => {
    const falso = criarApiClientFalso();
    const atualizar = vi.fn(falso.barbeiro.atualizarMinhaBarbearia);
    falso.barbeiro.atualizarMinhaBarbearia = atualizar;
    montarPainel(<NotificacoesDaBarbearia />, falso);

    await userEvent.click(await screen.findByRole("radio", { name: "12 h antes" }));
    await userEvent.click(screen.getByRole("button", { name: /salvar lembrete/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({ lembreteAtivo: true, lembreteAntecedenciaHoras: 12 })
    );
  });
});
