import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { APARENCIA_PADRAO } from "@barchop/formato";
import { MENSAGEM_DA_APARENCIA } from "../../../src/fluxo/previa";
import { PreviaDaPagina } from "../../../src/telas/painel/configuracoes/PreviaDaPagina";

// A prévia ao vivo (marco E): a página de verdade num iframe, com o
// rascunho mandado por postMessage a cada mudança.

beforeAll(() => {
  // O jsdom não tem <dialog> modal.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});

function quadro() {
  return screen.getByTitle("Prévia da sua página") as HTMLIFrameElement;
}

describe("prévia da página", () => {
  it("abre a página inicial da barbearia; Agendar abre o primeiro passo", async () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);

    expect(quadro()).toHaveAttribute("src", "/gr-barber");
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    expect(quadro()).toHaveAttribute("src", "/gr-barber/agendar");
  });

  it("celular ou computador", async () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);

    expect(quadro()).toHaveAttribute("data-dispositivo", "celular");
    await userEvent.click(screen.getByRole("radio", { name: "Computador" }));
    expect(quadro()).toHaveAttribute("data-dispositivo", "computador");
  });

  it("manda o rascunho e o modo pro iframe, e de novo quando mudam", async () => {
    const { rerender } = render(
      <PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />
    );
    const enviar = vi.spyOn(quadro().contentWindow!, "postMessage");

    rerender(<PreviaDaPagina slug="gr-barber" aparencia={{ ...APARENCIA_PADRAO, tema: "oceano" }} pendente />);
    expect(enviar).toHaveBeenLastCalledWith(
      { tipo: MENSAGEM_DA_APARENCIA, aparencia: { ...APARENCIA_PADRAO, tema: "oceano" }, modo: "claro" },
      window.location.origin
    );

    await userEvent.click(screen.getByRole("switch", { name: "Modo escuro" }));
    expect(enviar).toHaveBeenLastCalledWith(
      expect.objectContaining({ modo: "escuro" }),
      window.location.origin
    );
  });

  it("o modo da prévia acompanha o modo padrão quando o dono o fixa", () => {
    const { rerender } = render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);
    expect(screen.getByRole("switch", { name: "Modo escuro" })).toHaveAttribute("aria-checked", "false");

    rerender(<PreviaDaPagina slug="gr-barber" aparencia={{ ...APARENCIA_PADRAO, modoPadrao: "escuro" }} pendente />);
    expect(screen.getByRole("switch", { name: "Modo escuro" })).toHaveAttribute("aria-checked", "true");
  });

  it("mostra o endereço da página em cima do aparelho, como no navegador", async () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);

    expect(screen.getByText("localhost:3000/gr-barber")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Agendar" }));
    expect(screen.getByText("localhost:3000/gr-barber/agendar")).toBeInTheDocument();
  });

  it("atualizar recarrega a página da prévia", async () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);
    const antes = quadro();

    await userEvent.click(screen.getByRole("button", { name: "Atualizar a prévia" }));
    expect(quadro()).not.toBe(antes);
  });

  it("diz se o que se vê já está no ar", () => {
    const { rerender } = render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);
    expect(screen.getByText("Publicada")).toBeInTheDocument();

    rerender(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente />);
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
  });

  it("abrir a página de verdade, em outra aba", () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);

    const link = screen.getByRole("link", { name: /abrir a página/i });
    expect(link).toHaveAttribute("href", "http://localhost:3000/gr-barber");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("ampliar abre a prévia em tela cheia, e fecha", async () => {
    render(<PreviaDaPagina slug="gr-barber" aparencia={APARENCIA_PADRAO} pendente={false} />);

    await userEvent.click(screen.getByRole("button", { name: "Ampliar a prévia" }));
    const janela = screen.getByRole("dialog", { name: "Prévia da sua página" });
    expect(within(janela).getByTitle("Prévia ampliada da sua página")).toBeInTheDocument();

    await userEvent.click(within(janela).getByRole("button", { name: "Fechar a prévia" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
