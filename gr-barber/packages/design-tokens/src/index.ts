// Mesmos valores do design system (gr-barber-design-system.html).
// Em objetos planos, não CSS — o React Native usa StyleSheet.create
// com esses valores; o Next.js pode consumi-los direto ou expor
// como CSS custom properties num provider.

export const colors = {
  light: {
    paper: "#F3F0E7",
    paperSoft: "#FAF8F3",
    surface: "#FFFFFF",
    ink: "#202020",
    inkSoft: "#514c42",
    muted: "#8a8375",
    line: "#e6e0d3",
    accent: "#FFD900",
    accentBorder: "#FFFB7B",
    paleYellow: "#FFF3B8",
    paleBlue: "#EFF8FA",
    dark: "#1A1A1A",
    shadow: "#000000",
    // O vermelho de erro era escrito à mão em Campo.module.css e
    // Aviso.module.css. Vira token porque precisa de valor POR TEMA:
    // nenhum vermelho passa 4,5:1 nos dois fundos ao mesmo tempo —
    // foram testados sete. Aqui ele dá 5,74:1 sobre o paper e 6,54:1
    // sobre a surface.
    erro: "#b3261e",
    // O placeholder não tinha cor nenhuma: caía no #757575 do
    // navegador, que dá 4,04:1 sobre o paper claro e 3,13:1 no escuro.
    // Este fica em 5,78:1 sobre a surface e 5,08:1 sobre o paper, e
    // ainda é bem mais fraco que o --cor-ink-soft (8,53:1) — um
    // placeholder que passa por conteúdo preenchido é outro problema.
    placeholder: "#6b6559",
  },
  dark: {
    paper: "#17160F",
    paperSoft: "#252419",
    surface: "#2C2A1F",
    ink: "#F3F0E7",
    inkSoft: "#cbc4b3",
    muted: "#B0A890",
    line: "#3d3b2e",
    accent: "#FFD900", // inalterado — continua pop igual
    accentBorder: "#FFFB7B",
    paleYellow: "#3d3410",
    paleBlue: "#152329",
    dark: "#1A1A1A",
    shadow: "#F3F0E7", // sombra clara no escuro, senão some contra o fundo
    // O #b3261e do claro dava 2,77:1 sobre este paper e 2,20:1 sobre
    // esta surface — o texto mais apagado da tela era justamente o que
    // dizia o que consertar. Este sobe pra 6,49:1 e 5,16:1.
    erro: "#FF6B5E",
    placeholder: "#9e9681", // 4,89:1 sobre a surface, 6,16:1 sobre o paper
  },
} as const;

export const radius = {
  sm: 11,
  md: 14,
  lg: 20,
  xl: 32,
  pill: 999,
} as const;

// deslocamento fixo, sem blur — a assinatura neobrutalista.
// No React Native isso vira uma view extra atrás (elevation
// nativo não reproduz sombra "offset"); no web é box-shadow direto.
export const shadowOffset = {
  sm: { x: 0, y: 3 },
  md: { x: 0, y: 4 },
  lg: { x: 0, y: 8 },
} as const;

export const typography = {
  display: {
    // produção: Clash Grotesk (Fontshare, licença Indie gratuita)
    fontFamily: "ClashGrotesk-Bold",
    fontWeight: "700",
  },
  body: {
    fontFamily: "Inter-Regular",
    fontWeight: "400",
  },
  bodyBold: {
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
} as const;

export type ThemeMode = "light" | "dark";
export type Colors = typeof colors.light;

// Escala de espaçamento em múltiplos de 4, que é o que o design system
// usa em todas as telas. Sem token, cada tela repetiria o número solto.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

// 2px é a borda da assinatura neobrutalista; 1px fica pras divisórias
// internas de lista, que com 2px virariam grade.
export const borderWidth = {
  hairline: 1,
  padrao: 2,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  display: 40,
} as const;
