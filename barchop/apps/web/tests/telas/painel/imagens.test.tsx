import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { ProvedorDaApi } from "../../../src/api/ProvedorDaApi";
import { PerfilDaBarbearia } from "../../../src/telas/PerfilDaBarbearia";
import { CadastroDeMembro } from "../../../src/telas/painel/CadastroDeMembro";
import { DadosDoNegocio } from "../../../src/telas/painel/configuracoes/DadosDoNegocio";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";

// O jsdom não tem canvas: o redimensionamento real é conferido no
// navegador. Aqui ele devolve o arquivo como veio.
vi.mock("../../../src/painel/redimensionar", () => ({
  redimensionarImagem: async (arquivo: Blob) => arquivo,
}));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const arquivo = () => new File([PNG], "capa.png", { type: "image/png" });

describe("capa nas configurações", () => {
  // A capa mora na aba Marca de Dados do negócio (painel v2).
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/dados-do-negocio", query: { aba: "marca" } });
  });

  it("enviar mostra a capa nova", async () => {
    const falso = criarApiClientFalso();
    const enviar = vi.spyOn(falso.barbeiro, "enviarCapa");
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.upload(await screen.findByLabelText(/^capa/i), arquivo());

    await waitFor(() => expect(enviar).toHaveBeenCalledOnce());
    const imagem = await screen.findByRole("img", { name: /capa da barbearia/i });
    expect(imagem).toHaveAttribute("src", (await falso.barbeiro.minhaBarbearia()).capaUrl!);
  });

  it("remover tira a capa", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.enviarCapa(new Blob([PNG]));
    montarPainel(<DadosDoNegocio />, falso);

    await screen.findByRole("img", { name: /capa da barbearia/i });
    await userEvent.click(screen.getByRole("button", { name: /remover capa/i }));

    await waitFor(() => expect(screen.queryByRole("img", { name: /capa da barbearia/i })).toBeNull());
    expect((await falso.barbeiro.minhaBarbearia()).capaUrl).toBeNull();
  });

  it("imagem grande demais avisa", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.enviarCapa = async () => {
      throw new ErroDaApi(413, "arquivo_grande_demais", "a imagem passa de 4 MB");
    };
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.upload(await screen.findByLabelText(/^capa/i), arquivo());

    expect(await screen.findByText(/grande demais/i)).toBeInTheDocument();
  });

  it("arquivo que não é imagem avisa o que aceita", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.enviarCapa = async () => {
      throw new ErroDaApi(422, "tipo_de_imagem_invalido", "só png, jpeg ou webp");
    };
    montarPainel(<DadosDoNegocio />, falso);

    await userEvent.upload(await screen.findByLabelText(/^capa/i), arquivo());

    expect(await screen.findByText(/JPG, PNG ou WebP/i)).toBeInTheDocument();
  });
});

describe("foto do profissional", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/bb1", params: { id: "bb1" } });
  });

  it("na edição do membro, enviar a foto mostra a foto nova", async () => {
    const falso = criarApiClientFalso();
    const enviar = vi.spyOn(falso.barbeiro, "enviarFotoDoMembro");
    montarPainel(<CadastroDeMembro />, falso);

    await userEvent.upload(await screen.findByLabelText(/^foto/i), arquivo());

    await waitFor(() => expect(enviar).toHaveBeenCalledWith("bb1", expect.any(Blob)));
    expect(await screen.findByRole("img", { name: /foto de/i })).toBeInTheDocument();
  });

  it("no cadastro de membro novo não há foto: o membro ainda não existe", async () => {
    navegacaoFalsa.redefinir({ pathname: "/painel/equipe/novo" });
    montarPainel(<CadastroDeMembro />, criarApiClientFalso());

    await screen.findByLabelText(/^nome/i);
    expect(screen.queryByLabelText(/^foto/i)).toBeNull();
  });
});

describe("capa e equipe na página pública", () => {
  beforeEach(() => {
    localStorage.clear();
    navegacaoFalsa.redefinir({ params: { slug: "gr-barber" } });
  });

  function montarPagina(falso: ReturnType<typeof criarApiClientFalso>) {
    render(
      <ProvedorDaApi valor={falso}>
        <PerfilDaBarbearia agora={new Date("2026-09-29T10:00:00-03:00")} />
      </ProvedorDaApi>
    );
  }

  it("mostra a capa e a equipe com as fotos", async () => {
    const falso = criarApiClientFalso();
    const capa = await falso.barbeiro.enviarCapa(new Blob([PNG]));
    const foto = await falso.barbeiro.enviarFotoDoMembro("bb1", new Blob([PNG]));
    montarPagina(falso);

    expect(await screen.findByRole("img", { name: /capa da gr barber/i })).toHaveAttribute("src", capa);
    const equipe = screen.getByRole("region", { name: /equipe/i });
    expect(within(equipe).getByRole("img", { name: "Rafael" })).toHaveAttribute("src", foto);
  });

  it("sem capa, sem imagem; sem foto, o nome aparece mesmo assim", async () => {
    montarPagina(criarApiClientFalso());

    const equipe = await screen.findByRole("region", { name: /equipe/i });
    expect(within(equipe).getByText("Rafael")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
