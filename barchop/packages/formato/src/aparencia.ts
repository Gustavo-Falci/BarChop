import { colors } from "@barchop/design-tokens";

// A Aparência: o visual da página pública de cada barbearia (plano em
// .claude/plans/aparencia.plan.md). Listas fechadas num lugar só, como
// as regras: a API valida contra elas, a tela tira daqui as opções e a
// página pública monta o CSS com `paletaDaAparencia`.
//
// A regra que manda em tudo: barbearia que nunca abriu a tela continua
// exatamente como hoje. O tema BarChop são os tokens do design system,
// e o padrão de cada opção é o que a página já fazia.

export const MODOS_DE_COR = ["claro", "escuro", "automatico"] as const;
export const FONTES_DO_TEXTO = ["inter", "roboto", "poppins", "montserrat", "open-sans", "lato"] as const;
// A Clash Grotesk só nos títulos: é display, não aguenta parágrafo.
export const FONTES_DOS_TITULOS = ["clash", ...FONTES_DO_TEXTO] as const;
export const TAMANHOS_DO_TEXTO = ["compacto", "normal", "espacoso"] as const;
export const CANTOS = ["retos", "arredondados", "pilula"] as const;
export const BOTOES = ["solido", "contorno", "gradiente"] as const;
export const CARDS = ["plano", "elevado", "borda"] as const;
export const LAYOUTS_DOS_SERVICOS = ["agrupada", "abas"] as const;
// As nove cores que o dono edita uma a uma, cada uma num token (ver
// TOKEN_DA_COR).
export const NOVE_CORES = [
  "marca",
  "secundaria",
  "destaque",
  "fundo",
  "card",
  "apagado",
  "texto",
  "textoDeApoio",
  "linhas",
] as const;

export type ModoDeCor = (typeof MODOS_DE_COR)[number];
export type FonteDoTexto = (typeof FONTES_DO_TEXTO)[number];
export type FonteDosTitulos = (typeof FONTES_DOS_TITULOS)[number];
export type TamanhoDoTexto = (typeof TAMANHOS_DO_TEXTO)[number];
export type Cantos = (typeof CANTOS)[number];
export type Botao = (typeof BOTOES)[number];
export type Cards = (typeof CARDS)[number];
export type LayoutDosServicos = (typeof LAYOUTS_DOS_SERVICOS)[number];
export type NomeDaCor = (typeof NOVE_CORES)[number];
// "#RRGGBB", sempre em maiúsculas depois de normalizado.
export type Hex = string;
export type CoresPersonalizadas = Partial<Record<NomeDaCor, Hex>>;

export interface Aparencia {
  tema: IdDoTema;
  modoPadrao: ModoDeCor;
  // Ligado, a página mostra o botão lua/sol pro visitante.
  clienteTrocaModo: boolean;
  fonte: FonteDoTexto;
  // Nula = os títulos usam a mesma fonte do texto.
  fonteDosTitulos: FonteDosTitulos | null;
  tamanhoDoTexto: TamanhoDoTexto;
  cantos: Cantos;
  botao: Botao;
  cards: Cards;
  // O que o dono trocou à mão, por modo. Vazio = as cores do tema.
  cores: { claro: CoresPersonalizadas; escuro: CoresPersonalizadas };
  layoutDosServicos: LayoutDosServicos;
}

// As cores que a página usa: as mesmas chaves dos tokens.
export type CoresDaPagina = Record<keyof typeof colors.light, string>;

// ---------------------------------------------------------------------------
// Cor: hex, mistura e contraste (WCAG 2)
// ---------------------------------------------------------------------------

const PADRAO_HEX = /^#[0-9A-F]{6}$/i;

export function ehHex(valor: unknown): valor is Hex {
  return typeof valor === "string" && PADRAO_HEX.test(valor);
}

function canais(hex: Hex): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function paraHex([r, g, b]: [number, number, number]): Hex {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

// `t` = quanto de `b` entra: 0 devolve `a`, 1 devolve `b`.
export function misturar(a: Hex, b: Hex, t: number): Hex {
  const ca = canais(a);
  const cb = canais(b);
  return paraHex([0, 1, 2].map((i) => ca[i]! + (cb[i]! - ca[i]!) * t) as [number, number, number]);
}

function luminancia(hex: Hex): number {
  const [r, g, b] = canais(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: Hex, b: Hex): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}

// O texto sobre a cor da marca: branco quando passa de 4,5:1; senão o
// quase-preto da casa, e preto puro no meio do caminho — entre branco e
// preto, um dos dois sempre passa.
function textoSobre(fundo: Hex): Hex {
  if (contraste("#FFFFFF", fundo) >= 4.5) return "#FFFFFF";
  if (contraste(colors.light.dark, fundo) >= 4.5) return colors.light.dark;
  return "#000000";
}

// Puxa `cor` na direção de `alvo` até passar de `minimo` contra todos os
// fundos — o "apagado" que ainda se lê.
function garantirContraste(cor: Hex, alvo: Hex, fundos: Hex[], minimo: number): Hex {
  let atual = cor;
  for (let passo = 1; passo <= 50; passo += 1) {
    if (fundos.every((fundo) => contraste(atual, fundo) >= minimo)) return atual;
    atual = misturar(cor, alvo, passo / 50);
  }
  return alvo;
}

// ---------------------------------------------------------------------------
// Os temas
// ---------------------------------------------------------------------------

// De onde sai a paleta de um modo: o fundo, o texto, a cor da marca e a
// cor do realce (que tinge o "destaque").
interface Sementes {
  fundo: Hex;
  texto: Hex;
  marca: Hex;
  realce: Hex;
}

export interface Tema {
  id: string;
  nome: string;
  descricao: string;
  // O selo ESCURO: escolher o tema põe o modo padrão no escuro.
  abreNoEscuro: boolean;
  claro: Sementes;
  escuro: Sementes;
}

// Genérica no id pra que `IdDoTema` seja a união dos ids, e não string.
function tema<I extends string>(
  id: I,
  nome: string,
  descricao: string,
  cores: { marca: [Hex, Hex]; realce: Hex; claro: [Hex, Hex]; escuro: [Hex, Hex] },
  abreNoEscuro = false
): Tema & { id: I } {
  return {
    id,
    nome,
    descricao,
    abreNoEscuro,
    claro: { fundo: cores.claro[0], texto: cores.claro[1], marca: cores.marca[0], realce: cores.realce },
    escuro: { fundo: cores.escuro[0], texto: cores.escuro[1], marca: cores.marca[1], realce: cores.realce },
  };
}

// A ordem é a da tela. `marca` = [no claro, no escuro]; `claro` e
// `escuro` = [fundo, texto].
export const TEMAS = [
  tema("barchop", "BarChop", "O amarelo da casa sobre papel, com sombra marcada", {
    marca: [colors.light.accent, colors.dark.accent],
    realce: colors.light.accent,
    claro: [colors.light.paper, colors.light.ink],
    escuro: [colors.dark.paper, colors.dark.ink],
  }),
  tema("classico", "Clássico", "Azul de confiança, cabe em qualquer casa", {
    marca: ["#2563EB", "#3B82F6"],
    realce: "#3B82F6",
    claro: ["#FFFFFF", "#0F172A"],
    escuro: ["#0F172A", "#F1F5F9"],
  }),
  tema("ardosia", "Ardósia", "Cinza-azulado discreto com um toque de céu", {
    marca: ["#475569", "#64748B"],
    realce: "#0EA5E9",
    claro: ["#F8FAFC", "#0F172A"],
    escuro: ["#0B1220", "#E2E8F0"],
  }),
  tema("oceano", "Oceano", "Azul fundo com ciano calmo", {
    marca: ["#0369A1", "#0284C7"],
    realce: "#06B6D4",
    claro: ["#F7FBFD", "#0C1E2B"],
    escuro: ["#071A26", "#E0F2FE"],
  }),
  tema("menta", "Menta", "Verde-água leve, ar de spa", {
    marca: ["#0F766E", "#14B8A6"],
    realce: "#2DD4BF",
    claro: ["#F6FBFA", "#0B1F1C"],
    escuro: ["#06201C", "#DDF5F0"],
  }),
  tema("floresta", "Floresta", "Verde fechado com um toque de lima", {
    marca: ["#15803D", "#22C55E"],
    realce: "#84CC16",
    claro: ["#F7FAF5", "#0E1F12"],
    escuro: ["#0A1A0E", "#E3F1E3"],
  }),
  tema("citrico", "Cítrico", "Amarelo forte e ensolarado", {
    marca: ["#EAB308", "#FACC15"],
    realce: "#F97316",
    claro: ["#FFFDF5", "#1F1A05"],
    escuro: ["#1A1605", "#FEF9C3"],
  }),
  tema("quente", "Quente", "Laranja acolhedor sobre creme", {
    marca: ["#C2410C", "#EA580C"],
    realce: "#DC2626",
    claro: ["#FFF8EE", "#2A1405"],
    escuro: ["#1F1209", "#FDEBD8"],
  }),
  tema("cobre", "Cobre", "Bronze de oficina, marcante", {
    marca: ["#9A3412", "#C2410C"],
    realce: "#B45309",
    claro: ["#FBF7F3", "#2A1708"],
    escuro: ["#1C130C", "#F3E3D3"],
  }),
  tema(
    "ousado",
    "Ousado",
    "Vermelho de muita energia",
    {
      marca: ["#DC2626", "#EF4444"],
      realce: "#F59E0B",
      claro: ["#FFFFFF", "#111111"],
      escuro: ["#111318", "#F5F5F5"],
    },
    true
  ),
  tema("bordo", "Bordô", "Vinho com dourado, ar de alfaiataria", {
    marca: ["#881337", "#BE123C"],
    realce: "#CA8A04",
    claro: ["#FCF8F8", "#2A0A12"],
    escuro: ["#1A0B10", "#F5E1E6"],
  }),
  tema("florescer", "Florescer", "Rosa forte com lilás", {
    marca: ["#DB2777", "#EC4899"],
    realce: "#A855F7",
    claro: ["#FFF7FB", "#2A0B1C"],
    escuro: ["#1C0A15", "#FCE7F3"],
  }),
  tema("nude", "Nude", "Neutro quente, cor de areia", {
    marca: ["#8B6B5A", "#A6857A"],
    realce: "#C8A99A",
    claro: ["#FAF7F4", "#2A211C"],
    escuro: ["#1A1512", "#EFE6DF"],
  }),
  tema("elegante", "Elegante", "Índigo atual, refinado", {
    marca: ["#4F46E5", "#6366F1"],
    realce: "#EC4899",
    claro: ["#FAFAFF", "#151436"],
    escuro: ["#0F0E26", "#E8E7FF"],
  }),
  tema(
    "meia-noite",
    "Meia-noite",
    "Violeta sobre azul-marinho",
    {
      marca: ["#7C3AED", "#8B5CF6"],
      realce: "#34D399",
      claro: ["#FAF8FF", "#1A1033"],
      escuro: ["#0B1026", "#EDE9FE"],
    },
    true
  ),
  tema("gentleman", "Gentleman", "Carvão com latão, clássico de barbearia", {
    marca: ["#1C1C1C", "#B8860B"],
    realce: "#B8860B",
    claro: ["#FAFAF8", "#141414"],
    escuro: ["#141311", "#F0EDE6"],
  }),
  tema("minimalista", "Minimalista", "Preto e branco, sem enfeite", {
    marca: ["#171717", "#FAFAFA"],
    realce: "#737373",
    claro: ["#FFFFFF", "#0A0A0A"],
    escuro: ["#0A0A0A", "#FAFAFA"],
  }),
] as const;

export type IdDoTema = (typeof TEMAS)[number]["id"];

// A lista que a API valida.
export const IDS_DOS_TEMAS: readonly IdDoTema[] = TEMAS.map((item) => item.id);

export function temaPorId(id: IdDoTema): (typeof TEMAS)[number] {
  return TEMAS.find((item) => item.id === id) ?? TEMAS[0];
}

// As 16 bolinhas da cor da marca.
export const CORES_DA_MARCA = [
  "#FFD900",
  "#2563EB",
  "#475569",
  "#0369A1",
  "#0F766E",
  "#15803D",
  "#EAB308",
  "#C2410C",
  "#9A3412",
  "#DC2626",
  "#881337",
  "#DB2777",
  "#8B6B5A",
  "#4F46E5",
  "#7C3AED",
  "#1C1C1C",
] as const;

// ---------------------------------------------------------------------------
// O padrão e a leitura do que vem do banco
// ---------------------------------------------------------------------------

export const APARENCIA_PADRAO: Readonly<Aparencia> = {
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
};

function daLista<T extends string>(lista: readonly T[], valor: unknown, padrao: T): T {
  return typeof valor === "string" && (lista as readonly string[]).includes(valor) ? (valor as T) : padrao;
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerCores(valor: unknown): CoresPersonalizadas {
  if (!ehObjeto(valor)) return {};
  const cores: CoresPersonalizadas = {};
  for (const nome of NOVE_CORES) {
    const cor = valor[nome];
    if (ehHex(cor)) cores[nome] = cor.toUpperCase();
  }
  return cores;
}

// O que vem do banco (ou de um web mais novo que a API) vira sempre uma
// Aparência inteira: o que falta ou não se conhece cai no padrão, em vez
// de quebrar a página (a lição do #104). Sempre um objeto novo: quem
// editar o rascunho não mexe no padrão de todo mundo.
export function normalizarAparencia(valor: unknown): Aparencia {
  if (!ehObjeto(valor)) return { ...APARENCIA_PADRAO, cores: { claro: {}, escuro: {} } };
  const p = APARENCIA_PADRAO;
  const cores = ehObjeto(valor.cores) ? valor.cores : {};
  return {
    tema: daLista(IDS_DOS_TEMAS, valor.tema, p.tema),
    modoPadrao: daLista(MODOS_DE_COR, valor.modoPadrao, p.modoPadrao),
    clienteTrocaModo: typeof valor.clienteTrocaModo === "boolean" ? valor.clienteTrocaModo : p.clienteTrocaModo,
    fonte: daLista(FONTES_DO_TEXTO, valor.fonte, p.fonte),
    fonteDosTitulos:
      valor.fonteDosTitulos === null ? null : daLista(FONTES_DOS_TITULOS, valor.fonteDosTitulos, "clash"),
    tamanhoDoTexto: daLista(TAMANHOS_DO_TEXTO, valor.tamanhoDoTexto, p.tamanhoDoTexto),
    cantos: daLista(CANTOS, valor.cantos, p.cantos),
    botao: daLista(BOTOES, valor.botao, p.botao),
    cards: daLista(CARDS, valor.cards, p.cards),
    cores: { claro: lerCores(cores.claro), escuro: lerCores(cores.escuro) },
    layoutDosServicos: daLista(LAYOUTS_DOS_SERVICOS, valor.layoutDosServicos, p.layoutDosServicos),
  };
}

// ---------------------------------------------------------------------------
// A paleta
// ---------------------------------------------------------------------------

// Cada uma das nove cores no token que ela pinta.
export const TOKEN_DA_COR: Record<NomeDaCor, keyof CoresDaPagina> = {
  marca: "accent",
  secundaria: "paperSoft",
  destaque: "paleYellow",
  fundo: "paper",
  card: "surface",
  apagado: "muted",
  texto: "ink",
  textoDeApoio: "inkSoft",
  linhas: "line",
};

const BRANCO = "#FFFFFF";

function ehFundoEscuro(fundo: Hex): boolean {
  return luminancia(fundo) < 0.2;
}

// A paleta inteira a partir das sementes. Quem decide se é paleta de
// escuro é o fundo, não o modo: fundo escuro no modo claro pede texto
// claro do mesmo jeito.
function derivar(sementes: Sementes): CoresDaPagina {
  const { fundo, marca, realce } = sementes;
  const escuro = ehFundoEscuro(fundo);
  const base = escuro ? colors.dark : colors.light;
  const texto =
    contraste(sementes.texto, fundo) >= 7
      ? sementes.texto
      : contraste("#F5F5F5", fundo) >= contraste("#141414", fundo)
        ? "#F5F5F5"
        : "#141414";
  const surface = escuro ? misturar(fundo, texto, 0.06) : misturar(fundo, BRANCO, 0.7);
  const paperSoft = misturar(fundo, texto, escuro ? 0.1 : 0.04);
  const fundos = [fundo, surface, paperSoft];
  const muted = garantirContraste(misturar(texto, fundo, 0.5), texto, fundos, 4.5);
  return {
    ...base,
    paper: fundo,
    paperSoft,
    surface,
    ink: texto,
    inkSoft: garantirContraste(misturar(texto, fundo, 0.22), texto, fundos, 4.5),
    muted,
    line: misturar(fundo, texto, escuro ? 0.18 : 0.12),
    accent: marca,
    accentBorder: misturar(marca, BRANCO, 0.45),
    paleYellow: misturar(fundo, realce, escuro ? 0.22 : 0.16),
    onAccent: textoSobre(marca),
    shadow: escuro ? texto : "#000000",
    placeholder: muted,
  };
}

type Modo = "claro" | "escuro";

function paletaDoModo(aparencia: Aparencia, modo: Modo): CoresDaPagina {
  const escolhido = temaPorId(aparencia.tema);
  // No escuro, a marca que não foi definida lá vem do claro: a cor da
  // marca é uma só; fundo e texto, não.
  const minhas: CoresPersonalizadas =
    modo === "escuro"
      ? { ...(aparencia.cores.claro.marca ? { marca: aparencia.cores.claro.marca } : {}), ...aparencia.cores.escuro }
      : aparencia.cores.claro;

  const mudaOFundo = Boolean(minhas.fundo || minhas.texto);
  const sementes = { ...escolhido[modo], ...(minhas.fundo ? { fundo: minhas.fundo } : {}), ...(minhas.texto ? { texto: minhas.texto } : {}) };
  // O BarChop puro são os tokens, sem passar pela conta.
  const paleta: CoresDaPagina =
    escolhido.id === "barchop" && !mudaOFundo
      ? { ...(modo === "escuro" ? colors.dark : colors.light) }
      : derivar(sementes);

  if (minhas.marca && minhas.marca !== paleta.accent) {
    paleta.accent = minhas.marca;
    paleta.accentBorder = misturar(minhas.marca, BRANCO, 0.45);
    paleta.onAccent = textoSobre(minhas.marca);
  }
  for (const nome of NOVE_CORES) {
    const cor = minhas[nome];
    if (cor) paleta[TOKEN_DA_COR[nome]] = cor;
  }
  return paleta;
}

export function paletaDaAparencia(aparencia: Aparencia): { claro: CoresDaPagina; escuro: CoresDaPagina } {
  return { claro: paletaDoModo(aparencia, "claro"), escuro: paletaDoModo(aparencia, "escuro") };
}

// ---------------------------------------------------------------------------
// Ações da tela
// ---------------------------------------------------------------------------

// Escolher um tema descarta as cores trocadas à mão (é o "Voltar ao
// original" também). Tema que abre no escuro põe o modo no escuro; saindo
// dele, o modo volta pro automático.
export function aplicarTema(aparencia: Aparencia, id: IdDoTema): Aparencia {
  const novo = temaPorId(id);
  const anterior = temaPorId(aparencia.tema);
  let modoPadrao = aparencia.modoPadrao;
  if (novo.abreNoEscuro) modoPadrao = "escuro";
  else if (anterior.abreNoEscuro && modoPadrao === "escuro") modoPadrao = "automatico";
  return { ...aparencia, tema: novo.id, modoPadrao, cores: { claro: {}, escuro: {} } };
}

export function personalizada(aparencia: Aparencia): boolean {
  return Object.keys(aparencia.cores.claro).length > 0 || Object.keys(aparencia.cores.escuro).length > 0;
}
