import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso } from "@barchop/api-client";
import type { ServicoSerializado } from "@barchop/types";
import { CadastroDeServico } from "../../../src/telas/painel/CadastroDeServico";
import { ListaDeServicos } from "../../../src/telas/painel/ListaDeServicos";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// Descrição e foto do serviço: o dono cadastra aqui, e o cartão da
// escolha de serviços mostra.

// O jsdom não tem canvas: o redimensionamento real é conferido no
// navegador. Aqui ele devolve o arquivo como veio.
vi.mock("../../../src/painel/redimensionar", () => ({
  redimensionarImagem: async (arquivo: Blob) => arquivo,
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const arquivo = () => new File([PNG], "corte.png", { type: "image/png" });

function corte(extra: Partial<ServicoSerializado> = {}): ServicoSerializado {
  return {
    id: "s1",
    nome: "Corte",
    duracaoMinutos: 30,
    preco: "40.00",
    ativo: true,
    categoria: null,
    descricao: null,
    fotoUrl: null,
    ...extra,
  };
}

describe("descrição no cadastro do serviço", () => {
  beforeEach(() => localStorage.clear());

  it("o serviço novo leva a descrição, com contador do limite", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    const falso = criarApiClientFalso();
    const criar = vi.spyOn(falso.barbeiro, "criarServico");
    montarPainel(<CadastroDeServico />, falso);

    await userEvent.type(await screen.findByLabelText(/^nome/i), "Pigmentação");
    await userEvent.type(screen.getByLabelText(/duração/i), "30");
    await userEvent.type(screen.getByLabelText(/preço/i), "50,00");
    await userEvent.type(screen.getByLabelText(/descrição/i), "Cobre falhas da barba");

    expect(screen.getByText("21 de 300")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(criar).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: "Cobre falhas da barba" })
      )
    );
  });

  it("na edição, a descrição vem preenchida e apagar manda null", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = criarApiClientFalso({ servicos: [corte({ descricao: "Máquina e tesoura" })] });
    const atualizar = vi.spyOn(falso.barbeiro, "atualizarServico");
    montarPainel(<CadastroDeServico />, falso);

    const campo = await screen.findByDisplayValue("Máquina e tesoura");
    await userEvent.clear(campo);
    await userEvent.click(screen.getByRole("button", { name: /salvar/i }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith("s1", expect.objectContaining({ descricao: null }))
    );
  });
});

describe("foto do serviço no cadastro", () => {
  beforeEach(() => localStorage.clear());

  it("na edição, enviar a foto mostra a foto nova", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/s1", params: { id: "s1" } });
    const falso = criarApiClientFalso({ servicos: [corte()] });
    const enviar = vi.spyOn(falso.barbeiro, "enviarFotoDoServico");
    montarPainel(<CadastroDeServico />, falso);

    await userEvent.upload(await screen.findByLabelText(/^foto/i), arquivo());

    await waitFor(() => expect(enviar).toHaveBeenCalledWith("s1", expect.any(Blob)));
    expect(await screen.findByRole("img", { name: /foto de corte/i })).toBeInTheDocument();
  });

  it("no serviço novo não há foto: o serviço ainda não existe", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos/novo" });
    montarPainel(<CadastroDeServico />, criarApiClientFalso());

    await screen.findByLabelText(/^nome/i);
    expect(screen.queryByLabelText(/^foto/i)).toBeNull();
  });
});

describe("miniatura na lista de serviços", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/servicos" });
  });

  it("com foto, a linha mostra a foto; sem foto, a inicial", async () => {
    const falso = criarApiClientFalso({
      servicos: [
        corte({ fotoUrl: "https://imagens.falsas/corte.png" }),
        corte({ id: "s2", nome: "Barba", fotoUrl: null }),
      ],
    });
    montarPainel(<ListaDeServicos />, falso);

    const linhaDoCorte = (await screen.findByText("Corte")).closest("tr") as HTMLElement;
    const linhaDaBarba = screen.getByText("Barba").closest("tr") as HTMLElement;

    // Decorativa (alt vazio): o nome está do lado.
    expect(linhaDoCorte.querySelector("img")?.getAttribute("src")).toBe(
      "https://imagens.falsas/corte.png"
    );
    expect(linhaDaBarba.querySelector("img")).toBeNull();
    expect(within(linhaDaBarba).getByText("B")).toBeInTheDocument();
  });
});
