import { describe, expect, it } from "vitest";
import { colors } from "@barchop/design-tokens";
import {
  APARENCIA_PADRAO,
  CORES_DA_MARCA,
  IDS_DOS_TEMAS,
  TEMAS,
  aplicarTema,
  contraste,
  normalizarAparencia,
  paletaDaAparencia,
  personalizada,
  type Aparencia,
} from "../src/aparencia";

// A Aparência (marco A): o visual da página pública por barbearia, em
// função pura. A regra que manda em tudo: quem nunca abriu a tela
// continua exatamente como hoje — o tema BarChop são os tokens do
// design system, sem tirar nem pôr.

function com(mudancas: Partial<Aparencia>): Aparencia {
  return { ...APARENCIA_PADRAO, ...mudancas };
}

describe("o padrão é o BarChop de hoje", () => {
  it("sem nada salvo, a paleta são os tokens, nos dois modos", () => {
    const paleta = paletaDaAparencia(APARENCIA_PADRAO);
    expect(paleta.claro).toEqual(colors.light);
    expect(paleta.escuro).toEqual(colors.dark);
  });

  it("o texto sobre a cor da marca é o de hoje (o --cor-dark)", () => {
    expect(colors.light.onAccent).toBe(colors.light.dark);
    expect(colors.dark.onAccent).toBe(colors.dark.dark);
  });

  it("o resto do padrão reproduz a página de hoje", () => {
    expect(APARENCIA_PADRAO).toEqual({
      tema: "barchop",
      modoPadrao: "automatico",
      clienteTrocaModo: false,
      fonte: "inter",
      fonteDosTitulos: "clash",
      tamanhoDoTexto: "normal",
      cantos: "arredondados",
      botao: "solido",
      cards: "elevado",
      cores: { claro: {}, escuro: {} },
      layoutDosServicos: "agrupada",
    });
  });
});

describe("normalizarAparencia", () => {
  it("nulo, ausente ou lixo vira o padrão", () => {
    expect(normalizarAparencia(null)).toEqual(APARENCIA_PADRAO);
    expect(normalizarAparencia(undefined)).toEqual(APARENCIA_PADRAO);
    expect(normalizarAparencia("azul")).toEqual(APARENCIA_PADRAO);
    expect(normalizarAparencia([1, 2])).toEqual(APARENCIA_PADRAO);
  });

  it("completa o que falta e troca o desconhecido pelo padrão", () => {
    const lida = normalizarAparencia({ tema: "oceano", cantos: "estrela", fonte: "comic-sans" });
    expect(lida.tema).toBe("oceano");
    expect(lida.cantos).toBe("arredondados");
    expect(lida.fonte).toBe("inter");
    expect(lida.layoutDosServicos).toBe("agrupada");
  });

  it("devolve sempre um objeto novo (o padrão não se mexe)", () => {
    const lida = normalizarAparencia(null);
    expect(lida).not.toBe(APARENCIA_PADRAO);
    expect(lida.cores.claro).not.toBe(APARENCIA_PADRAO.cores.claro);
  });

  it("tema que não existe (mais) volta pro BarChop", () => {
    expect(normalizarAparencia({ tema: "neon" }).tema).toBe("barchop");
  });

  it("títulos sem fonte própria é nulo, não o padrão", () => {
    expect(normalizarAparencia({ fonteDosTitulos: null }).fonteDosTitulos).toBeNull();
  });

  it("as cores: hex de 6 dígitos em maiúsculas; o resto some", () => {
    const lida = normalizarAparencia({
      cores: {
        claro: { marca: "#2563eb", fundo: "red", card: "#fff", linhas: "#E2E8F0;}body{", inventada: "#000000" },
        escuro: "nada",
      },
    });
    expect(lida.cores).toEqual({ claro: { marca: "#2563EB" }, escuro: {} });
  });
});

describe("contraste (WCAG)", () => {
  it("preto no branco é 21:1, igual com igual é 1:1", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contraste("#2563EB", "#2563EB")).toBeCloseTo(1, 5);
  });
});

describe("o catálogo", () => {
  it("17 temas, o BarChop primeiro, sem id repetido", () => {
    expect(TEMAS).toHaveLength(17);
    expect(TEMAS[0]!.id).toBe("barchop");
    expect(new Set(TEMAS.map((tema) => tema.id)).size).toBe(17);
  });

  it("o id do tema é a lista fechada, não qualquer texto", () => {
    expect(IDS_DOS_TEMAS).toEqual(TEMAS.map((tema) => tema.id));
    // @ts-expect-error -- "neon" não é tema
    aplicarTema(APARENCIA_PADRAO, "neon");
  });

  it("dois abrem no escuro: Ousado e Meia-noite", () => {
    expect(TEMAS.filter((tema) => tema.abreNoEscuro).map((tema) => tema.id)).toEqual(["ousado", "meia-noite"]);
  });

  it("todo tema tem nome e descrição", () => {
    for (const tema of TEMAS) {
      expect(tema.nome.length).toBeGreaterThan(0);
      expect(tema.descricao.length).toBeGreaterThan(0);
    }
  });

  // O BarChop são os tokens de hoje (o muted dele é decisão antiga do
  // design system); os outros saem da conta e têm de passar.
  describe.each(TEMAS.filter((tema) => tema.id !== "barchop").map((tema) => [tema.id] as const))(
    "o tema %s se lê nos dois modos",
    (id) => {
      it.each(["claro", "escuro"] as const)("%s", (modo) => {
        const cores = paletaDaAparencia(com({ tema: id }))[modo];
        expect(contraste(cores.ink, cores.paper)).toBeGreaterThanOrEqual(7);
        expect(contraste(cores.ink, cores.surface)).toBeGreaterThanOrEqual(7);
        expect(contraste(cores.inkSoft, cores.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(cores.muted, cores.paper)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(cores.muted, cores.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(cores.muted, cores.paperSoft)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(cores.placeholder, cores.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contraste(cores.onAccent, cores.accent)).toBeGreaterThanOrEqual(4.5);
      });
    }
  );
});

describe("a cor da marca", () => {
  it("16 bolinhas, todas hex válidos e diferentes", () => {
    expect(CORES_DA_MARCA).toHaveLength(16);
    expect(new Set(CORES_DA_MARCA).size).toBe(16);
    for (const cor of CORES_DA_MARCA) expect(cor).toMatch(/^#[0-9A-F]{6}$/);
  });

  it.each(CORES_DA_MARCA.map((cor) => [cor]))("o texto sobre %s passa de 4,5:1", (cor) => {
    const paleta = paletaDaAparencia(com({ cores: { claro: { marca: cor }, escuro: {} } }));
    expect(contraste(paleta.claro.onAccent, paleta.claro.accent)).toBeGreaterThanOrEqual(4.5);
  });

  it("trocada no claro, vale também no escuro (o que não se define no escuro sai do claro)", () => {
    const paleta = paletaDaAparencia(com({ cores: { claro: { marca: "#2563EB" }, escuro: {} } }));
    expect(paleta.claro.accent).toBe("#2563EB");
    expect(paleta.escuro.accent).toBe("#2563EB");
    // Azul pede texto claro; o amarelo de hoje pedia escuro.
    expect(paleta.claro.onAccent).toBe("#FFFFFF");
  });

  it("definida no escuro, vale a do escuro", () => {
    const paleta = paletaDaAparencia(
      com({ cores: { claro: { marca: "#2563EB" }, escuro: { marca: "#60A5FA" } } })
    );
    expect(paleta.escuro.accent).toBe("#60A5FA");
  });

  it("só a marca muda: o fundo continua o do tema", () => {
    const paleta = paletaDaAparencia(com({ cores: { claro: { marca: "#2563EB" }, escuro: {} } }));
    expect(paleta.claro.paper).toBe(colors.light.paper);
    expect(paleta.claro.surface).toBe(colors.light.surface);
  });
});

describe("a cor de fundo", () => {
  it("cartões, bordas e textos acompanham o fundo novo, com contraste", () => {
    const paleta = paletaDaAparencia(com({ cores: { claro: { fundo: "#FDF6E3" }, escuro: {} } }));
    const cores = paleta.claro;
    expect(cores.paper).toBe("#FDF6E3");
    expect(contraste(cores.ink, cores.paper)).toBeGreaterThanOrEqual(7);
    expect(contraste(cores.muted, cores.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contraste(cores.muted, cores.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("fundo escuro no modo claro: o texto vira claro sozinho", () => {
    const cores = paletaDaAparencia(com({ cores: { claro: { fundo: "#101010" }, escuro: {} } })).claro;
    expect(contraste(cores.ink, cores.paper)).toBeGreaterThanOrEqual(7);
  });

  it("o fundo do claro não vaza pro escuro", () => {
    const paleta = paletaDaAparencia(com({ cores: { claro: { fundo: "#FDF6E3" }, escuro: {} } }));
    expect(paleta.escuro.paper).toBe(colors.dark.paper);
  });
});

describe("as nove cores, uma a uma", () => {
  it("cada uma cai no seu token", () => {
    const cores = paletaDaAparencia(
      com({
        tema: "classico",
        cores: {
          claro: {
            marca: "#111111",
            secundaria: "#222222",
            destaque: "#333333",
            fundo: "#FFFFFF",
            card: "#FAFAFA",
            apagado: "#555555",
            texto: "#0A0A0A",
            textoDeApoio: "#444444",
            linhas: "#E5E5E5",
          },
          escuro: {},
        },
      })
    ).claro;
    expect(cores).toMatchObject({
      accent: "#111111",
      paperSoft: "#222222",
      paleYellow: "#333333",
      paper: "#FFFFFF",
      surface: "#FAFAFA",
      muted: "#555555",
      ink: "#0A0A0A",
      inkSoft: "#444444",
      line: "#E5E5E5",
    });
  });
});

describe("aplicarTema", () => {
  it("troca o tema e descarta as cores personalizadas", () => {
    const antes = com({ cores: { claro: { marca: "#2563EB" }, escuro: {} } });
    const depois = aplicarTema(antes, "oceano");
    expect(depois.tema).toBe("oceano");
    expect(depois.cores).toEqual({ claro: {}, escuro: {} });
  });

  it("tema que abre no escuro põe o modo padrão no escuro", () => {
    expect(aplicarTema(APARENCIA_PADRAO, "ousado").modoPadrao).toBe("escuro");
  });

  it("saindo dele, volta pro automático", () => {
    const noEscuro = aplicarTema(APARENCIA_PADRAO, "meia-noite");
    expect(aplicarTema(noEscuro, "menta").modoPadrao).toBe("automatico");
  });

  it("entre temas claros, o modo escolhido fica", () => {
    expect(aplicarTema(com({ modoPadrao: "claro" }), "menta").modoPadrao).toBe("claro");
  });

  it("não mexe no resto (fonte, cantos, layout)", () => {
    const antes = com({ fonte: "poppins", cantos: "pilula", layoutDosServicos: "abas" });
    expect(aplicarTema(antes, "cobre")).toMatchObject({ fonte: "poppins", cantos: "pilula", layoutDosServicos: "abas" });
  });
});

describe("personalizada", () => {
  it("só quando alguma cor foi trocada à mão", () => {
    expect(personalizada(APARENCIA_PADRAO)).toBe(false);
    expect(personalizada(com({ cores: { claro: {}, escuro: { fundo: "#000000" } } }))).toBe(true);
  });
});
