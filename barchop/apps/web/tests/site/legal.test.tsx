import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Privacidade } from "../../src/site/Privacidade";
import { RodapeDoSite } from "../../src/site/RodapeDoSite";
import { Termos } from "../../src/site/Termos";

// Termos de uso e política de privacidade (onda 1s-b; cobrança na
// Onda 2, PR 6). Rascunho base, marcado pra revisão jurídica. Quem vende
// é pessoa física: nome, CPF e e-mail vêm de NEXT_PUBLIC_VENDEDOR_* no
// build — o repositório é público e não guarda o CPF. Sem as variáveis,
// "a preencher". Os dados abaixo são inventados.

const VENDEDOR = {
  NEXT_PUBLIC_VENDEDOR_NOME: "Fulana de Tal",
  NEXT_PUBLIC_VENDEDOR_CPF: "12345678909",
  NEXT_PUBLIC_VENDEDOR_EMAIL: "contato@exemplo.com",
};

function comVendedor(valores: Record<string, string> = VENDEDOR) {
  for (const [nome, valor] of Object.entries(valores)) vi.stubEnv(nome, valor);
}

function semVendedor() {
  comVendedor({ NEXT_PUBLIC_VENDEDOR_NOME: "", NEXT_PUBLIC_VENDEDOR_CPF: "", NEXT_PUBLIC_VENDEDOR_EMAIL: "" });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

function titulos() {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

describe("termos de uso", () => {
  it("tem o título, o aviso de texto em revisão e a data de vigência", () => {
    render(<Termos />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Termos de uso");
    expect(screen.getByText(/texto em revisão/i)).toBeInTheDocument();
    expect(screen.getByText(/vigente desde/i)).toBeInTheDocument();
  });

  it("cobre o serviço, a conta, os dados dos clientes, a disponibilidade e o encerramento", () => {
    render(<Termos />);
    const secoes = titulos().join(" | ");
    expect(secoes).toMatch(/serviço/i);
    expect(secoes).toMatch(/conta/i);
    expect(secoes).toMatch(/dados dos seus clientes/i);
    expect(secoes).toMatch(/disponibilidade/i);
    expect(secoes).toMatch(/encerramento/i);
  });

  it("não escreve preço (fica em /precos) nem promete lembrete por WhatsApp", () => {
    render(<Termos />);
    expect(document.body.textContent).not.toMatch(/R\$/);
    expect(document.body.textContent).not.toMatch(/lembrete[^.]*whatsapp/i);
    expect(document.body.textContent).not.toMatch(/lançamento/i);
  });

  it("quem vende é pessoa física: nome, CPF formatado e e-mail, vindos do build", () => {
    comVendedor();
    render(<Termos />);
    const quemSomos = screen.getByRole("region", { name: "Quem somos" });
    expect(quemSomos).toHaveTextContent("Fulana de Tal");
    expect(quemSomos).toHaveTextContent("CPF 123.456.789-09");
    expect(quemSomos).toHaveTextContent(/pessoa física/i);
    expect(within(quemSomos).getByRole("link", { name: "contato@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:contato@exemplo.com"
    );
    expect(document.body.textContent).not.toMatch(/CNPJ|razão social/i);
  });

  it("sem as variáveis do build, os dados de quem vende ficam a preencher", () => {
    semVendedor();
    render(<Termos />);
    expect(screen.getByRole("region", { name: "Quem somos" })).toHaveTextContent(/a preencher/i);
  });

  it("explica a cobrança: teste, renovação, troca, cancelamento, atraso e a Stripe", () => {
    render(<Termos />);
    const cobranca = screen.getByRole("region", { name: /cobrança/i });
    expect(cobranca).toHaveTextContent(/14 dias/);
    expect(cobranca).toHaveTextContent(/renova/i);
    expect(cobranca).toHaveTextContent(/só a diferença/);
    expect(cobranca).toHaveTextContent(/cancelar quando quiser/i);
    expect(cobranca).toHaveTextContent(/fim do período/i);
    expect(cobranca).toHaveTextContent(/tenta cobrar de novo/i);
    expect(cobranca).toHaveTextContent(/nada é apagado/i);
    expect(cobranca).toHaveTextContent(/Stripe/);
    expect(within(cobranca).getByRole("link", { name: /preços/i })).toHaveAttribute("href", "/precos");
  });

  // Marco 3 da Onda 2: a barbearia vende planos ao cliente, e o dinheiro
  // vai direto pra conta de quem vende no Asaas. O BarChop não é parte
  // da venda.
  it("explica os planos que a barbearia vende: conta de quem vende, sem taxa, contrato entre as partes", () => {
    render(<Termos />);
    const planos = screen.getByRole("region", { name: "Planos que a barbearia vende" });
    expect(planos).toHaveTextContent(/Asaas/);
    expect(planos).toHaveTextContent(/conta de quem vende/i);
    expect(planos).toHaveTextContent(/não cobra taxa/i);
    expect(planos).toHaveTextContent(/entre quem vende e o cliente/i);
    expect(planos).toHaveTextContent(/Completo/);
    // Os dados dos clientes servem ao agendamento e aos planos: o CPF de
    // quem assina online vai pro Asaas, o que "só o agendamento" não cobre.
    const dadosDosClientes = screen.getByRole("region", { name: "Os dados dos seus clientes" });
    expect(dadosDosClientes).toHaveTextContent(/CPF/);
    expect(dadosDosClientes).toHaveTextContent(/o agendamento e os planos funcionarem/i);
    expect(screen.getByRole("link", { name: "Planos que a barbearia vende" })).toHaveAttribute(
      "href",
      "#planos-da-barbearia"
    );
  });

  // Pagamentos online com a Stripe (PR 7 do plano pagamentos-online-stripe)
  // e a InfinitePay (PR 8 do plano pagamentos-online-infinitepay): quem
  // vende escolhe um dos três, uma conta por vez.
  it("os planos recebem pelo Asaas, pela Stripe ou pela InfinitePay, na conta de quem vende", () => {
    render(<Termos />);
    const planos = screen.getByRole("region", { name: "Planos que a barbearia vende" });
    expect(planos).toHaveTextContent(/conta do Asaas, da Stripe ou da InfinitePay/i);
    expect(planos).toHaveTextContent(/chave restrita/i);
    expect(planos).toHaveTextContent(/termos do Asaas, da Stripe ou da InfinitePay/i);
    expect(planos).toHaveTextContent(/pelo Asaas, pela Stripe, pela InfinitePay ou no balcão/i);
  });

  it("na InfinitePay, um link por mensalidade, o cancelamento sem pagar, o mínimo e o estorno no app", () => {
    render(<Termos />);
    const planos = screen.getByRole("region", { name: "Planos que a barbearia vende" });
    expect(planos).toHaveTextContent(/InfiniteTag/);
    expect(planos).toHaveTextContent(/não renova sozinha/i);
    expect(planos).toHaveTextContent(/link de pagamento.*por e-mail.*3 dias antes do vencimento/i);
    expect(planos).toHaveTextContent(/de 3 a 30/i);
    expect(planos).toHaveTextContent(/não cobra menos de um real/i);
    expect(planos).toHaveTextContent(/estorno.*no app da InfinitePay/i);
    expect(planos).toHaveTextContent(/os links das próximas mensalidades param/i);
  });
});

describe("política de privacidade", () => {
  it("tem o título, o aviso e a data de vigência", () => {
    render(<Privacidade />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Política de privacidade");
    expect(screen.getByText(/texto em revisão/i)).toBeInTheDocument();
    expect(screen.getByText(/vigente desde/i)).toBeInTheDocument();
  });

  it("diz quando o BarChop é controlador e quando é operador (LGPD)", () => {
    render(<Privacidade />);
    const texto = document.body.textContent ?? "";
    expect(texto).toMatch(/controlador/i);
    expect(texto).toMatch(/operador/i);
  });

  it("nomeia quem ajuda a operar: e-mail, hospedagem e pagamento", () => {
    render(<Privacidade />);
    const quemAjuda = screen.getByRole("region", { name: /quem nos ajuda/i });
    expect(quemAjuda).toHaveTextContent(/Resend/);
    expect(quemAjuda).toHaveTextContent(/Oracle/);
    expect(quemAjuda).toHaveTextContent(/Stripe/);
  });

  it("o CPF só de quem assina online, que vai pra conta de quem vende no Asaas", () => {
    render(<Privacidade />);
    const dados = screen.getByRole("region", { name: /que dados coletamos/i });
    expect(dados).toHaveTextContent(/CPF/);
    expect(dados).toHaveTextContent(/assina um plano online/i);
    expect(dados).toHaveTextContent(/chave de API do Asaas/i);
    const papeis = screen.getByRole("region", { name: /quem decide/i });
    expect(papeis).toHaveTextContent(/o agendamento e os planos funcionarem/i);
    expect(papeis).not.toHaveTextContent(/clientes que agendam/i);
    const quemAjuda = screen.getByRole("region", { name: /quem nos ajuda/i });
    expect(quemAjuda).toHaveTextContent(/Asaas/);
    expect(quemAjuda).toHaveTextContent(/conta de quem vende/i);
  });

  it("na Stripe de quem vende vão o nome, o e-mail e o celular, sem o CPF", () => {
    render(<Privacidade />);
    const dados = screen.getByRole("region", { name: /que dados coletamos/i });
    expect(dados).toHaveTextContent(/chave restrita da Stripe/i);
    expect(dados).toHaveTextContent(/o CPF, quando quem vende recebe pelo Asaas/i);
    const quemAjuda = screen.getByRole("region", { name: /quem nos ajuda/i });
    expect(quemAjuda).toHaveTextContent(
      /o Asaas, a Stripe ou a InfinitePay é o serviço de pagamento escolhido por quem vende/i
    );
    expect(quemAjuda).toHaveTextContent(/na Stripe e na InfinitePay, o nome, o e-mail e o celular, sem o CPF/i);
    const prazo = screen.getByRole("region", { name: /por quanto tempo/i });
    expect(prazo).toHaveTextContent(/chave do Asaas, da Stripe ou da InfinitePay é apagada/i);
  });

  it("na InfinitePay: a chave e a InfiniteTag, e o e-mail do link de cada mensalidade sai pelo BarChop", () => {
    render(<Privacidade />);
    const dados = screen.getByRole("region", { name: /que dados coletamos/i });
    expect(dados).toHaveTextContent(/chave da InfinitePay/i);
    expect(dados).toHaveTextContent(/InfiniteTag/);
    expect(dados).toHaveTextContent(/A Stripe e a InfinitePay não pedem o CPF/i);
    const paraQue = screen.getByRole("region", { name: /para que usamos/i });
    expect(paraQue).toHaveTextContent(/da InfinitePay a situação dos pagamentos/i);
    expect(paraQue).toHaveTextContent(/link de cada mensalidade/i);
    const quemAjuda = screen.getByRole("region", { name: /quem nos ajuda/i });
    expect(quemAjuda).toHaveTextContent(/Resend: envio dos e-mails.*link de cada mensalidade/i);
  });

  it("diz que o cartão fica com a Stripe, e não com o BarChop", () => {
    render(<Privacidade />);
    expect(document.body.textContent).toMatch(/não vê nem guarda os dados do cartão/i);
  });

  it("o contato é de quem vende, com o e-mail também para o encarregado", () => {
    comVendedor();
    render(<Privacidade />);
    expect(titulos().join(" | ")).toMatch(/seus direitos/i);
    const contato = screen.getByRole("region", { name: /contato/i });
    expect(contato).toHaveTextContent("Fulana de Tal");
    expect(contato).toHaveTextContent("CPF 123.456.789-09");
    expect(within(contato).getByRole("link", { name: "contato@exemplo.com" })).toHaveAttribute(
      "href",
      "mailto:contato@exemplo.com"
    );
    expect(contato).toHaveTextContent(/encarregado/i);
  });

  it("sem as variáveis do build, o contato fica a preencher", () => {
    semVendedor();
    render(<Privacidade />);
    const contato = screen.getByRole("region", { name: /contato/i });
    expect(within(contato).getAllByText(/a preencher/i).length).toBeGreaterThan(0);
  });
});

describe("rodapé do site", () => {
  it("leva aos termos e à privacidade", () => {
    render(<RodapeDoSite />);
    expect(screen.getByRole("link", { name: /termos de uso/i })).toHaveAttribute("href", "/termos");
    expect(screen.getByRole("link", { name: /privacidade/i })).toHaveAttribute("href", "/privacidade");
  });

  // No celular estreito o link Preços sai do cabeçalho (não cabe); o
  // rodapé o mantém à mão.
  it("leva aos preços e ao Grátis", () => {
    render(<RodapeDoSite />);
    expect(screen.getByRole("link", { name: "Preços" })).toHaveAttribute("href", "/precos");
    expect(screen.getByRole("link", { name: "Plano grátis" })).toHaveAttribute("href", "/gratis");
  });
});
