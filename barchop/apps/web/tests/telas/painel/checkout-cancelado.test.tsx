import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckoutCancelado } from "../../../src/telas/painel/CheckoutCancelado";

// Quem desiste no Checkout da Stripe volta pra cá: nada foi cobrado, e
// dá pra voltar aos planos ou ao painel, como no Barbeiro.app.

// Onda C, PR 4: "Pagamento não concluído", sem falar do teste (a tela
// aparece também pra quem não está nele), e "Tentar de novo".
describe("Pagamento não concluído", () => {
  it("diz que nada foi cobrado e oferece tentar de novo ou voltar ao painel", () => {
    render(<CheckoutCancelado />);

    expect(screen.getByRole("heading", { level: 1, name: "Pagamento não concluído" })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma cobrança foi feita no seu cartão/)).toBeInTheDocument();
    expect(screen.queryByText(/teste/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Tentar de novo" })).toHaveAttribute("href", "/painel/faturas");
    expect(screen.getByRole("link", { name: /Voltar ao painel/ })).toHaveAttribute("href", "/painel");
  });
});
