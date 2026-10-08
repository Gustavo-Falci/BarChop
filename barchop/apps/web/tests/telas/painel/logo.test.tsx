import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { DadosDoNegocio } from "../../../src/telas/painel/configuracoes/DadosDoNegocio";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O jsdom não tem canvas: a leitura dos pixels e a regravação em WebP
// são conferidas no navegador (e a sugestão, em tests/painel/logo.test.ts).
// Aqui a preparação devolve o arquivo como veio, sugerindo "redonda".
vi.mock("../../../src/painel/logo", () => ({
  prepararLogo: async (arquivo: Blob) => ({ arquivo, formato: "redonda" }),
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const arquivo = () => new File([PNG], "logo.png", { type: "image/png" });

describe("logo nas configurações", () => {
  // A logo mora na aba Marca de Dados do negócio, antes da capa.
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/dados-do-negocio", query: { aba: "marca" } });
  });

  it("enviar usa a moldura sugerida pelo arquivo e mostra a prévia nela", async () => {
    const falso = criarApiClientFalso();
    const enviar = vi.spyOn(falso.barbeiro, "enviarLogo");
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.upload(await screen.findByLabelText(/^escolher logo/i), arquivo());

    await waitFor(() => expect(enviar).toHaveBeenCalledWith(expect.any(Blob), "redonda"));
    const logo = await screen.findByRole("img", { name: /logo da gr barber/i });
    expect(logo).toHaveAttribute("src", (await falso.barbeiro.minhaBarbearia()).logoUrl!);
    expect(logo.closest("[data-formato]")).toHaveAttribute("data-formato", "redonda");
    expect(screen.getByRole("radio", { name: "Redonda" })).toBeChecked();
    expect(screen.getByText(/sugerimos a moldura redonda/i)).toBeInTheDocument();
  });

  it("trocar a moldura salva só o formato, sem reenviar a imagem", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarLogo(new Blob([PNG]), "redonda");
    const enviar = vi.spyOn(falso.barbeiro, "enviarLogo");
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarMinhaBarbearia");
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.click(await screen.findByRole("radio", { name: "Sem moldura" }));

    await waitFor(() => expect(atualizar).toHaveBeenCalledWith({ logoFormato: "livre" }));
    expect(enviar).not.toHaveBeenCalled();
    expect(screen.getByRole("img", { name: /logo da gr barber/i }).closest("[data-formato]")).toHaveAttribute(
      "data-formato",
      "livre"
    );
  });

  it("remover tira a logo e a escolha de moldura", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarLogo(new Blob([PNG]), "quadrada");
    montarPainel(<DadosDoNegocio />, falso);

    await screen.findByRole("img", { name: /logo da gr barber/i });
    await userEvent.click(screen.getByRole("button", { name: /remover logo/i }));

    await waitFor(() => expect(screen.queryByRole("img", { name: /logo da gr barber/i })).toBeNull());
    expect(screen.queryByRole("radio", { name: "Redonda" })).toBeNull();
    expect((await falso.barbeiro.minhaBarbearia()).logoUrl).toBeNull();
  });

  it("arquivo que não é imagem avisa", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.enviarLogo = async () => {
      throw new ErroDaApi(422, "tipo_de_imagem_invalido", "só png, jpeg ou webp");
    };
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.upload(await screen.findByLabelText(/^escolher logo/i), arquivo());

    expect(await screen.findByText(/use uma imagem em png, jpg ou webp/i)).toBeInTheDocument();
  });
});
