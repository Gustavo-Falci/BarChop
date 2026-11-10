import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, type SementeFalsa } from "@barchop/api-client";
import type { PagamentoPix, ResumoDaAssinatura } from "@barchop/types";
import { FaixaDaAssinatura } from "../../../src/painel/FaixaDaAssinatura";
import { ProvedorDaAssinatura } from "../../../src/painel/ProvedorDaAssinatura";
import { ProvedorDoPainel } from "../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../src/painel/SessaoDoPainel";
import { sessaoDaBarbearia, sessaoDoBarbeiro } from "../../../src/sessao/armazenamento";
import { Faturas } from "../../../src/telas/painel/Faturas";
import { navegacaoFalsa } from "../../ajudantes/navegacao";

// O Pix do BarChop em Faturas (plano pix-do-barchop, PR 2; canvas
// Pix-Pagar, Pix-Aguardando e Pix-Renovar): o QR e o copia e cola com o
// valor exato, "Já paguei" (o plano vale na hora, aguardando a
// conferência do Suporte), "Ainda não paguei", a recusa, e cada período
// como um Pix novo, com "Pagar o próximo mês" nos 5 dias antes e depois
// de vencer.

vi.mock("../../../src/painel/stripe", () => ({ irParaAStripe: vi.fn() }));

const AGORA = new Date("2026-11-10T15:00:00Z");
const FIM_DO_TESTE = "2026-11-15T14:43:00.000Z";

function resumo(parcial: Partial<ResumoDaAssinatura> = {}): ResumoDaAssinatura {
  return {
    situacao: "teste",
    plano: "gratis",
    ciclo: "mensal",
    planoEfetivo: "completo",
    testeTerminaEm: FIM_DO_TESTE,
    diasDeTesteRestantes: 5,
    periodoTerminaEm: null,
    primeiraCobrancaPendente: false,
    cancelaEm: null,
    profissionais: 2,
    limiteDeProfissionais: null,
    excedente: false,
    foraDoLink: [],
    temPortal: false,
    usoNoTeste: null,
    forma: "cartao",
    pix: { aguardando: null, ultimaRecusa: null },
    ...parcial,
  };
}

// O Essencial mensal pra 2 pago por Pix, valendo até `fim`.
function noPix(fim: string, parcial: Partial<ResumoDaAssinatura> = {}): ResumoDaAssinatura {
  return resumo({
    situacao: "ativa",
    plano: "essencial",
    planoEfetivo: new Date(fim) > AGORA ? "essencial" : "gratis",
    testeTerminaEm: null,
    diasDeTesteRestantes: null,
    periodoTerminaEm: fim,
    limiteDeProfissionais: new Date(fim) > AGORA ? 3 : 1,
    forma: "pix",
    ...parcial,
  });
}

function pagamento(parcial: Partial<PagamentoPix> = {}): PagamentoPix {
  return {
    id: "pix-1",
    identificador: "K7Q2MX",
    plano: "essencial",
    ciclo: "mensal",
    profissionais: 2,
    valorCentavos: 5990,
    periodoComecaEm: "2026-11-01T03:00:00.000Z",
    periodoTerminaEm: "2026-12-01T03:00:00.000Z",
    situacao: "confirmado",
    resposta: null,
    criadoEm: "2026-11-01T14:32:00.000Z",
    decididoEm: "2026-11-01T18:00:00.000Z",
    copiaECola: "00020126-codigo-de-exemplo",
    ...parcial,
  };
}

function montar(assinatura: ResumoDaAssinatura, semente: SementeFalsa = {}) {
  const falso = criarApiClientFalso({ pixLigado: true, ...semente, assinatura });
  render(
    <ProvedorDoPainel valor={{ barbeiro: falso.barbeiro, publico: falso.publico }}>
      <SessaoDoPainel>
        <ProvedorDaAssinatura>
          <FaixaDaAssinatura />
          <Faturas agora={AGORA} />
        </ProvedorDaAssinatura>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
  return falso;
}

// O Intl separa o "R$" com espaço inquebrável.
function texto(elemento: HTMLElement | null): string {
  return (elemento?.textContent ?? "").replaceAll(String.fromCharCode(160), " ");
}

function pedido() {
  return screen.getByRole("complementary", { name: "Seu pedido" });
}

function seuPlano() {
  return screen.getByRole("region", { name: /^(Essencial|Completo|Grátis)/ });
}

async function irProPix(usuario = userEvent.setup()) {
  await usuario.click(await screen.findByRole("button", { name: /^Continuar com o/ }));
  const pix = await screen.findByRole("radio", { name: /Pix/ });
  await waitFor(() => expect(pix).toBeEnabled());
  await usuario.click(pix);
  return usuario;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/faturas" });
  sessaoDoBarbeiro.gravar("jwt");
  sessaoDaBarbearia.gravar("gr-barber");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Faturas: pagar com Pix (Pix-Pagar)", () => {
  it("sem o Pix ligado na API, o Pix segue em breve e o cartão renova sozinho", async () => {
    montar(resumo(), { pixLigado: false });

    await userEvent.click(await screen.findByRole("button", { name: /^Continuar com o/ }));

    expect(await screen.findByRole("radio", { name: /Pix.*Em breve/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Cartão/ })).toHaveAccessibleName(/Renova sozinho/);
    expect(screen.getByRole("radio", { name: /Cartão/ })).toBeChecked();
  });

  it("no teste: o valor da cotação, o período que começa no fim do teste, o QR, o código e quem recebe", async () => {
    montar(resumo());

    await irProPix();

    expect(screen.getByRole("radio", { name: /Pix/ })).toHaveAccessibleName(/Acesso na hora/);
    const pix = screen.getByRole("region", { name: "Pague por Pix" });
    expect(texto(within(pix).getByTestId("valor-do-pix"))).toBe("R$ 59,90");
    expect(within(pix).getByText("Essencial mensal · 2 profissionais · vale de 15/11 a 15/12")).toBeInTheDocument();
    expect(within(pix).getByRole("img", { name: /QR do Pix de R\$\s59,90/ })).toBeInTheDocument();
    expect(within(pix).getByTestId("copia-e-cola").textContent).toMatch(/^000201/);
    expect(within(pix).getByText(/Recebedor:/)).toHaveTextContent("BarChop · chave p•••@exemplo.com");
    expect(within(pix).getByText("Volte aqui e toque em Já paguei.")).toBeInTheDocument();
    // O Stripe e o "R$ 0,00 hoje" do teste são só do cartão.
    expect(screen.queryByText(/página segura da Stripe/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Assinar o/ })).toBeNull();

    expect(within(pedido()).getByText("Mensal, por Pix")).toBeInTheDocument();
    expect(texto(within(pedido()).getByTestId("hoje"))).toBe("R$ 59,90");
    expect(within(pedido()).getByText("vence em 15/12 · avisamos 5 dias antes")).toBeInTheDocument();
  });

  it("Copiar código põe o copia e cola na área de transferência e diz onde colar", async () => {
    const usuario = userEvent.setup();
    montar(resumo());
    await irProPix(usuario);
    const codigo = screen.getByTestId("copia-e-cola").textContent;

    await usuario.click(screen.getByRole("button", { name: "Copiar código" }));

    expect(await navigator.clipboard.readText()).toBe(codigo);
    expect(screen.getByRole("button", { name: "Código copiado" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cole no app do banco, na opção Pix copia e cola.");
  });

  it("trocar o plano depois de ver o Pix cota de novo", async () => {
    const usuario = await (async () => {
      montar(resumo());
      return irProPix();
    })();

    await usuario.click(screen.getByRole("button", { name: /Mudar plano/ }));
    await usuario.click(screen.getByRole("radio", { name: /Completo/ }));
    await usuario.click(screen.getByRole("button", { name: /^Continuar com o/ }));
    const pix = await screen.findByRole("radio", { name: /Pix/ });
    await waitFor(() => expect(pix).toBeEnabled());
    await usuario.click(pix);

    expect(texto(await screen.findByTestId("valor-do-pix"))).toBe("R$ 74,90");
  });

  it("Já paguei: o plano vale na hora, aguardando conferência; Ainda não paguei volta ao teste", async () => {
    const falso = montar(resumo());
    const jaPaguei = vi.spyOn(falso.barbeiro, "jaPagueiOPix");
    const usuario = await irProPix();

    await usuario.click(screen.getByRole("button", { name: "Já paguei" }));

    expect(jaPaguei).toHaveBeenCalledWith({ plano: "essencial", ciclo: "mensal", profissionais: 2 });
    const plano = await screen.findByRole("region", { name: "Essencial mensal" });
    expect(within(plano).getByText("Aguardando conferência")).toBeInTheDocument();
    expect(within(plano).getByText(/Já vale pra 2 profissionais/)).toBeInTheDocument();
    expect(texto(within(plano).getByText(/^R\$/))).toMatch(/^R\$ 59,90 · 10\/11, 12:00$/);
    expect(within(plano).getByText("15/11 a 15/12 · 2 profissionais")).toBeInTheDocument();
    const lista = await screen.findByRole("list", { name: "Pagamentos" });
    expect(within(lista).getByText("Em conferência")).toBeInTheDocument();

    await usuario.click(within(plano).getByRole("button", { name: "Ver o QR e o código de novo" }));
    expect(within(plano).getByRole("img", { name: /QR do Pix de R\$\s59,90/ })).toBeInTheDocument();

    await usuario.click(within(plano).getByRole("button", { name: "Ainda não paguei" }));

    expect(await screen.findByRole("button", { name: /^Continuar com o/ })).toBeInTheDocument();
    expect(screen.getByText(/O teste grátis vai até 15\/11/)).toBeInTheDocument();
  });

  it("um erro do Já paguei aparece na tela e nada muda", async () => {
    const falso = montar(resumo());
    vi.spyOn(falso.barbeiro, "jaPagueiOPix").mockRejectedValueOnce(
      Object.assign(new Error("já há um Pix em conferência: espere o suporte ou desfaça"), { status: 409 })
    );
    const usuario = await irProPix();

    await usuario.click(screen.getByRole("button", { name: "Já paguei" }));

    expect(await screen.findByText(/Não deu para registrar o pagamento/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Pague por Pix" })).toBeInTheDocument();
  });
});

describe("Faturas: o Pix recusado (Pix-Aguardando, recusado)", () => {
  it("mostra a resposta do suporte, e Pagar com Pix de novo vai direto ao Pix", async () => {
    montar(
      resumo({
        situacao: "gratis",
        planoEfetivo: "gratis",
        testeTerminaEm: null,
        diasDeTesteRestantes: null,
        limiteDeProfissionais: 1,
        pix: {
          aguardando: null,
          ultimaRecusa: { resposta: "Não achamos um Pix de R$ 59,90 no dia 08/11.", decididoEm: "2026-11-09T12:00:00Z" },
        },
      })
    );

    const recusa = await screen.findByRole("region", { name: "Pix não encontrado" });
    expect(within(recusa).getByText("Resposta do suporte do BarChop")).toBeInTheDocument();
    expect(within(recusa).getByText("Não achamos um Pix de R$ 59,90 no dia 08/11.")).toBeInTheDocument();
    expect(within(recusa).getByText(/Nada foi apagado/)).toBeInTheDocument();
    expect(within(recusa).getByRole("link", { name: "Falar com o suporte" })).toHaveAttribute("href", "/painel/ajuda");

    await userEvent.click(within(recusa).getByRole("button", { name: "Pagar com Pix de novo" }));

    expect(await screen.findByRole("region", { name: "Pague por Pix" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Pix/ })).toBeChecked();
    expect(screen.queryByRole("region", { name: "Pix não encontrado" })).toBeNull();
  });
});

describe("Faturas: o plano pago por Pix (Pix-Aguardando, confirmado)", () => {
  it("em dia: pago, até quando vale, o próximo Pix, sem a Stripe", async () => {
    montar(noPix("2026-12-01T03:00:00.000Z"), { pagamentosPix: [pagamento()] });

    const plano = await screen.findByRole("region", { name: "Essencial mensal" });
    expect(within(plano).getByText("Pago")).toBeInTheDocument();
    // A data da conferência vem da lista de pagamentos, que chega depois.
    expect(await within(plano).findByText("Pix conferido pelo suporte em 01/11. Tudo certo até 01/12.")).toBeInTheDocument();
    expect(within(plano).getByText("01/12 · 2 profissionais")).toBeInTheDocument();
    expect(texto(within(plano).getByText(/até 01\/12$/))).toBe("R$ 59,90 até 01/12");
    expect(within(plano).getByText("Avisamos no sino e por e-mail no dia 26/11, com o QR do próximo mês.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Gerenciar assinatura/ })).toBeNull();
    expect(screen.queryByText("Em dia")).toBeNull();
    expect(screen.queryByText(/Próxima cobrança/)).toBeNull();

    const lista = await screen.findByRole("list", { name: "Pagamentos" });
    const linha = within(lista).getByRole("listitem");
    expect(linha).toHaveTextContent("01/11 · Pix");
    expect(linha).toHaveTextContent("Essencial mensal · 01/11 a 01/12");
    expect(texto(linha)).toContain("R$ 59,90");
    expect(linha).toHaveTextContent("Pago");
    // Nenhuma faixa: em dia não pede nada.
    expect(screen.queryByRole("region", { name: "Assinatura" })).toBeNull();
  });

  it("Mudar plano ou profissionais: escolhe de novo e paga só por Pix, pro período seguinte", async () => {
    const usuario = userEvent.setup();
    montar(noPix("2026-12-01T03:00:00.000Z"), { pagamentosPix: [pagamento()] });

    await usuario.click(await screen.findByRole("button", { name: "Mudar plano ou profissionais" }));
    await usuario.click(screen.getByRole("radio", { name: /Completo/ }));
    await usuario.click(screen.getByRole("button", { name: /^Continuar com o/ }));

    const pix = await screen.findByRole("region", { name: "Pague por Pix" });
    expect(screen.queryByRole("radio", { name: /Cartão/ })).toBeNull();
    expect(within(pix).getByText("Completo mensal · 2 profissionais · vale de 01/12 a 01/01")).toBeInTheDocument();

    await usuario.click(screen.getByRole("button", { name: "← Voltar ao plano" }));
    expect(await screen.findByRole("region", { name: "Essencial mensal" })).toBeInTheDocument();
  });
});

describe("Faturas: o próximo Pix (Pix-Renovar)", () => {
  it("nos 5 dias antes: a faixa avisa, e Pagar o próximo mês traz o QR do mesmo plano", async () => {
    const falso = montar(noPix("2026-11-14T03:00:00.000Z"), { pagamentosPix: [pagamento({ periodoComecaEm: "2026-10-14T03:00:00.000Z", periodoTerminaEm: "2026-11-14T03:00:00.000Z" })] });
    const jaPaguei = vi.spyOn(falso.barbeiro, "jaPagueiOPix");

    const faixa = await screen.findByRole("region", { name: "Assinatura" });
    expect(faixa).toHaveTextContent("O Essencial vence em 14/11, daqui a 4 dias. Pague o próximo mês por Pix pra não cair no Grátis.");
    expect(screen.getByText("O Pix não renova sozinho: cada mês é um Pix novo, com o valor certo.")).toBeInTheDocument();
    expect(within(seuPlano()).getByText("Vence em 14/11")).toBeInTheDocument();

    const proximo = await screen.findByRole("region", { name: "Pagar o próximo mês" });
    expect(texto(await within(proximo).findByTestId("valor-do-pix"))).toBe("R$ 59,90");
    expect(within(proximo).getByText("Essencial mensal · 2 profissionais · vale de 14/11 a 14/12")).toBeInTheDocument();
    expect(within(proximo).getByRole("img", { name: /QR do Pix/ })).toBeInTheDocument();
    expect(within(proximo).getByRole("button", { name: "Mudar plano, ciclo ou profissionais" })).toBeInTheDocument();

    await userEvent.click(within(proximo).getByRole("button", { name: "Já paguei" }));

    expect(jaPaguei).toHaveBeenCalledWith({ plano: "essencial", ciclo: "mensal", profissionais: 2 });
    expect(await screen.findByText("Aguardando conferência")).toBeInTheDocument();
  });

  it("vencido: a barbearia está no Grátis, Voltar pro Essencial começa hoje, e nada foi apagado", async () => {
    montar(noPix("2026-11-08T03:00:00.000Z"), {
      pagamentosPix: [pagamento({ periodoComecaEm: "2026-10-08T03:00:00.000Z", periodoTerminaEm: "2026-11-08T03:00:00.000Z" })],
    });

    const faixa = await screen.findByRole("region", { name: "Assinatura" });
    expect(faixa).toHaveTextContent("O Pix do próximo mês não chegou: a barbearia está no Grátis desde 08/11.");
    expect(screen.getByText("Só 1 profissional aparece no link. Pague pra voltar com a equipe toda.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /^Grátis/ })).toHaveTextContent("Venceu em 08/11");

    const voltar = await screen.findByRole("region", { name: "Voltar pro Essencial" });
    expect(await within(voltar).findByText("Essencial mensal · 2 profissionais · vale de hoje, 10/11, a 10/12")).toBeInTheDocument();
    expect(screen.getByText(/Nada foi apagado/)).toBeInTheDocument();
  });
});
