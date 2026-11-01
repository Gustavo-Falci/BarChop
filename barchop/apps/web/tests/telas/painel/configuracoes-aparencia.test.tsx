import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { criarApiClientFalso, ErroDaApi } from "@barchop/api-client";
import { APARENCIA_PADRAO } from "@barchop/formato";
import { AparenciaDaBarbearia } from "../../../src/telas/painel/configuracoes/AparenciaDaBarbearia";
import { navegacaoFalsa } from "../../ajudantes/navegacao";
import { montarPainel } from "../../ajudantes/painel";
import { comTelaDeCelular } from "../../ajudantes/tela";

// A tela Aparência (marco D): o visual da página pública. Cada mudança
// vira rascunho guardado no servidor (sobrevive a fechar a aba); a
// página do cliente só muda quando o dono publica.

const MARCA = "/painel/configuracoes/dados-do-negocio?aba=marca";

let desfazerTela: (() => void) | undefined;

afterEach(() => {
  desfazerTela?.();
  desfazerTela = undefined;
});

beforeEach(() => {
  localStorage.clear();
  navegacaoFalsa.redefinir({ pathname: "/painel/configuracoes/aparencia" });
});

async function abrir(falso = criarApiClientFalso()) {
  montarPainel(<AparenciaDaBarbearia />, falso);
  await screen.findByRole("button", { name: "Oceano" });
  return falso;
}

// Abas (17/10): Tema, Cor, Letra, Serviços e Ajuste fino, cada uma numa
// altura de janela ao lado da prévia. A tela abre na Tema.
async function aba(nome: "Tema" | "Cor" | "Letra" | "Serviços" | "Ajuste fino") {
  await userEvent.click(screen.getByRole("tab", { name: nome }));
}

function grupo(nome: RegExp) {
  return within(screen.getByRole("group", { name: nome }));
}

async function rascunho(falso: ReturnType<typeof criarApiClientFalso>) {
  return (await falso.barbeiro.minhaBarbearia()).aparenciaRascunho;
}

describe("aparência", () => {
  it("abre no tema BarChop, sem nada pra publicar, com o selo Faltando", async () => {
    await abrir();

    expect(screen.getByRole("button", { name: "BarChop" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Oceano" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent("Faltando");
    expect(grupo(/modo padrão/i).getByRole("radio", { name: "Automático" })).toBeChecked();
    expect(screen.getByRole("switch", { name: /deixar o cliente trocar/i })).not.toBeChecked();
  });

  // Redesenho, PR 6 (01/11): logo e capa resumidas numa linha só, que
  // leva pra aba Marca de Dados do negócio.
  it("logo e capa: uma linha diz o que falta e leva pra aba Marca", async () => {
    await abrir();

    const links = screen.getAllByRole("link", { name: /logo e capa/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Enviar logo e capa");
    expect(links[0]).toHaveAttribute("href", MARCA);
    expect(screen.getByText(/sem logo e capa: a página abre com as iniciais/i)).toBeInTheDocument();
  });

  it("com a capa e sem a logo, a linha pede só a logo", async () => {
    const falso = criarApiClientFalso();
    // A assinatura do PNG: o falso confere o tipo pelos primeiros bytes.
    await falso.barbeiro.enviarCapa(new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]));
    await abrir(falso);

    expect(screen.getByText(/capa enviada · falta a logo/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Enviar logo" })).toHaveAttribute("href", MARCA);
  });

  // A loja numa linha (17/10, OK do dono): as medidas e os tipos de
  // arquivo moram na tela de envio (Dados do negócio › Marca), onde o
  // arquivo é escolhido — aqui empurravam as abas pra baixo da dobra.
  it("logo e capa numa linha, sem repetir as medidas da tela de envio", async () => {
    await abrir();

    expect(screen.queryByText(/512 × 512 px/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1600 × 400 px/)).not.toBeInTheDocument();
  });

  it("escolher um tema guarda o rascunho, mas a página do cliente não muda", async () => {
    const falso = await abrir();

    await userEvent.click(screen.getByRole("button", { name: "Oceano" }));

    expect(screen.getByRole("button", { name: "Oceano" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect((await rascunho(falso))?.tema).toBe("oceano"));
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia.tema).toBe("barchop");
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
  });

  it("publicar leva o rascunho pro ar e decide a área", async () => {
    const falso = await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Oceano" }));
    await waitFor(async () => expect((await rascunho(falso))?.tema).toBe("oceano"));

    await userEvent.click(screen.getByRole("button", { name: "Publicar" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument());
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia.tema).toBe("oceano");
    expect(screen.getByRole("banner")).toHaveTextContent("Configurado");
  });

  it("descartar volta pro que está no ar", async () => {
    const falso = await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Oceano" }));
    await waitFor(async () => expect((await rascunho(falso))?.tema).toBe("oceano"));

    await userEvent.click(screen.getByRole("button", { name: "Descartar" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "BarChop" })).toHaveAttribute("aria-pressed", "true"));
    expect(await rascunho(falso)).toBeNull();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });

  it("um rascunho guardado antes reabre na tela (fechou a aba e voltou)", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarRascunhoDaAparencia({ ...APARENCIA_PADRAO, tema: "menta" });

    await abrir(falso);

    expect(screen.getByRole("button", { name: "Menta" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
  });

  it("o filtro Escuros mostra só os temas que abrem no escuro", async () => {
    await abrir();

    await userEvent.click(grupo(/mostrar temas/i).getByRole("radio", { name: "Escuros" }));

    expect(screen.getByRole("button", { name: "Ousado" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meia-noite" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oceano" })).not.toBeInTheDocument();
  });

  // Paginados (19/10, pedido do dono): seis de cada vez, e um "Mostrar
  // mais" discreto traz os próximos seis.
  it("mostra seis temas; Mostrar mais traz os próximos até acabar", async () => {
    await abrir();

    expect(screen.getByRole("button", { name: "Floresta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cítrico" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Minimalista" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mostrar mais temas/i }));
    expect(screen.getByRole("button", { name: "Cítrico" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Minimalista" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mostrar mais temas/i }));
    expect(screen.getByRole("button", { name: "Minimalista" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mostrar mais temas/i })).not.toBeInTheDocument();
  });

  it("Mostrar menos só aparece depois de abrir mais, e volta pros seis primeiros", async () => {
    await abrir();
    expect(screen.queryByRole("button", { name: /mostrar menos temas/i })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /mostrar mais temas/i }));
    await userEvent.click(screen.getByRole("button", { name: /mostrar mais temas/i }));
    await userEvent.click(screen.getByRole("button", { name: /mostrar menos temas/i }));

    expect(screen.getByRole("button", { name: "Floresta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cítrico" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mostrar menos temas/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mostrar mais temas/i })).toBeInTheDocument();
  });

  // A descrição só aparece ao passar o mouse (19/10): o leitor de tela a
  // lê como descrição do botão.
  it("cada tema traz a descrição como descrição do botão", async () => {
    await abrir();

    expect(screen.getByRole("button", { name: "Oceano" })).toHaveAccessibleDescription("Azul fundo com ciano calmo");
  });

  it("o tema escolhido aparece mesmo fora da primeira página", async () => {
    const falso = criarApiClientFalso();
    await falso.barbeiro.salvarRascunhoDaAparencia({ ...APARENCIA_PADRAO, tema: "gentleman" });

    await abrir(falso);

    expect(screen.getByRole("button", { name: "Gentleman" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Minimalista" })).not.toBeInTheDocument();
  });

  it("trocar o filtro volta pra primeira página", async () => {
    await abrir();
    await userEvent.click(screen.getByRole("button", { name: /mostrar mais temas/i }));

    await userEvent.click(grupo(/mostrar temas/i).getByRole("radio", { name: "Claros" }));
    await userEvent.click(grupo(/mostrar temas/i).getByRole("radio", { name: "Todos" }));

    expect(screen.queryByRole("button", { name: "Cítrico" })).not.toBeInTheDocument();
  });

  it("tema que abre no escuro põe o modo padrão no Escuro", async () => {
    const falso = await abrir();
    await userEvent.click(grupo(/mostrar temas/i).getByRole("radio", { name: "Escuros" }));

    await userEvent.click(screen.getByRole("button", { name: "Ousado" }));

    expect(grupo(/modo padrão/i).getByRole("radio", { name: "Escuro" })).toBeChecked();
    await waitFor(async () => expect((await rascunho(falso))?.modoPadrao).toBe("escuro"));
  });

  it("modo padrão e o botão do cliente entram no rascunho", async () => {
    const falso = await abrir();

    await userEvent.click(grupo(/modo padrão/i).getByRole("radio", { name: "Claro" }));
    await userEvent.click(screen.getByRole("switch", { name: /deixar o cliente trocar/i }));

    await waitFor(async () =>
      expect(await rascunho(falso)).toMatchObject({ modoPadrao: "claro", clienteTrocaModo: true })
    );
  });

  it("trocar a cor da marca deixa o tema personalizado; Voltar ao original desfaz", async () => {
    const falso = await abrir();
    await aba("Cor");

    await userEvent.click(grupo(/cor da marca/i).getByRole("button", { name: "Azul" }));

    expect(grupo(/cor da marca/i).getByRole("button", { name: "Azul" })).toHaveAttribute("aria-pressed", "true");
    // O "personalizado" e o Voltar ao original moram na aba Tema.
    await aba("Tema");
    expect(screen.getByText("BarChop · personalizado")).toBeInTheDocument();
    await waitFor(async () => expect((await rascunho(falso))?.cores.claro.marca).toBe("#2563EB"));

    await userEvent.click(screen.getByRole("button", { name: "Voltar ao original" }));

    expect(screen.queryByText("BarChop · personalizado")).not.toBeInTheDocument();
    await waitFor(async () => expect(await rascunho(falso)).toBeNull());
  });

  it("outra cor, em hex", async () => {
    const falso = await abrir();
    await aba("Cor");
    const campo = screen.getByRole("textbox", { name: /outra cor/i });

    await userEvent.clear(campo);
    await userEvent.type(campo, "#123abc{Enter}");

    await waitFor(async () => expect((await rascunho(falso))?.cores.claro.marca).toBe("#123ABC"));
  });

  it("hex que não é cor não entra", async () => {
    const falso = await abrir();
    await aba("Cor");
    const campo = screen.getByRole("textbox", { name: /outra cor/i });

    await userEvent.clear(campo);
    await userEvent.type(campo, "azul{Enter}");

    expect(await screen.findByText(/use o formato #RRGGBB/i)).toBeInTheDocument();
    expect(await rascunho(falso)).toBeNull();
  });

  it("a cor de fundo é de cada modo", async () => {
    const falso = await abrir();
    await aba("Cor");

    await userEvent.click(grupo(/fundo de qual modo/i).getByRole("radio", { name: "Modo escuro" }));
    const campo = screen.getByRole("textbox", { name: /cor de fundo/i });
    await userEvent.clear(campo);
    await userEvent.type(campo, "#101820{Enter}");

    await waitFor(async () => expect((await rascunho(falso))?.cores).toEqual({ claro: {}, escuro: { fundo: "#101820" } }));
  });

  it("se a mudança não chega ao servidor, diz isso e não deixa publicar uma versão velha", async () => {
    const falso = criarApiClientFalso();
    falso.barbeiro.salvarRascunhoDaAparencia = async () => {
      throw new ErroDaApi(500, "erro_interno", "falhou");
    };
    await abrir(falso);

    await userEvent.click(screen.getByRole("button", { name: "Oceano" }));

    expect(await screen.findByText(/não guardado/i)).toBeInTheDocument();
    expect(screen.queryByText(/rascunho guardado/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publicar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  // Na aba própria (17/10), o ajuste fino aparece direto; só as nove
  // cores, controle de designer, ficam atrás de "Editar".
  it("o ajuste fino aparece direto na aba; cantos, botão e cards entram no rascunho", async () => {
    const falso = await abrir();
    await aba("Ajuste fino");
    const editarCores = screen.getByRole("button", { name: /editar as nove cores/i });
    expect(editarCores).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Card" })).not.toBeInTheDocument();

    await userEvent.click(grupo(/os cantos/i).getByRole("radio", { name: "Retos" }));
    await userEvent.click(grupo(/o botão principal/i).getByRole("radio", { name: "Contorno" }));
    await userEvent.click(grupo(/os cards/i).getByRole("radio", { name: "Planos" }));

    await waitFor(async () =>
      expect(await rascunho(falso)).toMatchObject({ cantos: "retos", botao: "contorno", cards: "plano" })
    );
  });

  it("as nove cores, uma a uma, em cada modo", async () => {
    const falso = await abrir();
    await aba("Ajuste fino");
    await userEvent.click(screen.getByRole("button", { name: /editar as nove cores/i }));

    await userEvent.click(grupo(/as nove cores de qual modo/i).getByRole("radio", { name: "Modo escuro" }));
    const card = screen.getByRole("textbox", { name: "Card" });
    await userEvent.clear(card);
    await userEvent.type(card, "#202020{Enter}");

    await waitFor(async () => expect((await rascunho(falso))?.cores.escuro).toEqual({ card: "#202020" }));
    expect(screen.getByRole("textbox", { name: "Texto de apoio" })).toBeInTheDocument();
  });

  it("a letra: a fonte do texto entra no rascunho", async () => {
    const falso = await abrir();
    await aba("Letra");

    expect(grupo(/a fonte do texto/i).getByRole("button", { name: "Inter" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(grupo(/a fonte do texto/i).getByRole("button", { name: "Poppins" }));

    expect(grupo(/a fonte do texto/i).getByRole("button", { name: "Poppins" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(async () => expect((await rascunho(falso))?.fonte).toBe("poppins"));
  });

  it("títulos na mesma fonte, ou numa própria; e o tamanho do texto", async () => {
    const falso = await abrir();
    await aba("Ajuste fino");

    // O padrão: títulos em outra fonte, a Clash.
    expect(grupo(/os títulos usam outra fonte/i).getByRole("radio", { name: "Sim" })).toBeChecked();
    expect(grupo(/a fonte dos títulos/i).getByRole("button", { name: "Clash Grotesk" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await userEvent.click(grupo(/a fonte dos títulos/i).getByRole("button", { name: "Montserrat" }));
    await waitFor(async () => expect((await rascunho(falso))?.fonteDosTitulos).toBe("montserrat"));

    await userEvent.click(grupo(/os títulos usam outra fonte/i).getByRole("radio", { name: "Não" }));
    expect(screen.queryByRole("group", { name: /a fonte dos títulos/i })).not.toBeInTheDocument();
    await userEvent.click(grupo(/tamanho do texto/i).getByRole("radio", { name: "Espaçoso" }));

    await waitFor(async () =>
      expect(await rascunho(falso)).toMatchObject({ fonteDosTitulos: null, tamanhoDoTexto: "espacoso" })
    );
  });

  it("layout dos serviços salva na hora, sem passar pelo Publicar", async () => {
    const falso = await abrir();
    await aba("Serviços");
    expect(screen.getByRole("button", { name: /lista agrupada/i })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: /abas de categoria/i }));

    await waitFor(async () =>
      expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia.layoutDosServicos).toBe("abas")
    );
    expect(screen.getByRole("button", { name: /abas de categoria/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });

  it("layout com rascunho pendente: o rascunho segue pendente, já com o layout novo", async () => {
    const falso = await abrir();
    await userEvent.click(screen.getByRole("button", { name: "Oceano" }));

    await aba("Serviços");
    await userEvent.click(screen.getByRole("button", { name: /abas de categoria/i }));

    await waitFor(async () =>
      expect(await rascunho(falso)).toMatchObject({ tema: "oceano", layoutDosServicos: "abas" })
    );
    expect((await falso.publico.perfilDaBarbearia("gr-barber")).aparencia).toMatchObject({
      tema: "barchop",
      layoutDosServicos: "abas",
    });
    expect(screen.getByRole("button", { name: "Publicar" })).toBeInTheDocument();
  });

  it("abre na aba Tema; cada aba mostra a sua parte, e a publicação fica fora das abas", async () => {
    await abrir();

    expect(screen.getByRole("tab", { name: "Tema" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("group", { name: /cor da marca/i })).not.toBeInTheDocument();

    await aba("Cor");
    expect(screen.getByRole("group", { name: /cor da marca/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oceano" })).not.toBeInTheDocument();
    expect(screen.getByText("No ar")).toBeInTheDocument();
  });

  it("quem não é dono não mexe", async () => {
    montarPainel(<AparenciaDaBarbearia />, criarApiClientFalso({ papel: "profissional" }));

    expect(await screen.findByText(/só o dono da barbearia muda esta área/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Oceano" })).not.toBeInTheDocument();
  });

  // Redesenho, PR 6: abaixo de 1200px a prévia não fica embaixo de tudo
  // (eram ~900px de página); abre por um botão, na janela ampliada.
  it("no celular, a prévia abre por um botão", async () => {
    desfazerTela = comTelaDeCelular();
    await abrir();

    expect(screen.queryByTitle("Prévia da sua página")).not.toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "Ver a prévia da página" });
    expect(botao).toHaveAttribute("aria-haspopup", "dialog");

    await userEvent.click(botao);
    expect(within(screen.getByRole("dialog", { name: "Prévia da sua página" })).getByTitle("Prévia ampliada da sua página")).toBeInTheDocument();
  });

  it("no computador, a prévia segue ao lado, sem o botão", async () => {
    await abrir();

    expect(screen.getByTitle("Prévia da sua página")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver a prévia da página" })).not.toBeInTheDocument();
  });
});
