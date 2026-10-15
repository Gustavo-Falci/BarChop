import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckoutCancelado } from "../../../src/telas/painel/CheckoutCancelado";

// Quem desiste no Checkout da Stripe volta pra cá: nada foi cobrado, e
// dá pra voltar aos planos ou ao painel, como no Barbeiro.app.

describe("Checkout cancelado", () => {
  it("diz que nada foi cobrado e oferece os planos ou o painel", () => {
    render(<CheckoutCancelado />);

    expect(screen.getByRole("heading", { name: "Checkout cancelado" })).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma cobrança foi feita/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver planos/ })).toHaveAttribute("href", "/painel/faturas");
    expect(screen.getByRole("link", { name: /Voltar ao painel/ })).toHaveAttribute("href", "/painel");
  });
});
