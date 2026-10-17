// Mesmos valores do design system (docs/design-system.html).
// Em objetos planos, não CSS — o React Native usa StyleSheet.create
// com esses valores; o Next.js pode consumi-los direto ou expor
// como CSS custom properties num provider.

// Paleta de 17/10 ("menos amarelo, menos moldura"): neutro quente nos
// dois modos, o amarelo num ouro mais calmo e o contorno num fio de
// 1px. Só hex: a página pública filtra o que não é #rrggbb e o mobile
// lê estes mesmos objetos. As transparências da proposta viraram o hex
// equivalente sobre a surface.
export const colors = {
  light: {
    paper: "#F7F4EE",
    // O fim do degradê do fundo: o papel desce de paper a paperFim.
    paperFim: "#EFEAE1",
    paperSoft: "#F7F3EB",
    // Branco levemente quente, nunca #FFF puro.
    surface: "#FFFDF9",
    ink: "#26221C",
    inkSoft: "#5B544A",
    // 5,50:1 sobre a surface, 5,05:1 sobre o paperSoft, 4,66:1 sobre o
    // paperFim. O de antes (#8a8375) ficava abaixo de 4,5:1 em todos.
    muted: "#6F6759",
    line: "#E9E2D5",
    // O contorno de campo e de cartão: um passo acima da divisória.
    lineStrong: "#DAD1C1",
    accent: "#F0C93A",
    accentBorder: "#FFFB7B",
    paleYellow: "#FAEFC8",
    paleBlue: "#EFF8FA",
    dark: "#1A1A1A",
    // O texto sobre a cor da marca (o botão Agendar). Hoje é o --cor-dark
    // nos dois modos; na página pública com outra cor da marca, a
    // Aparência calcula por contraste (@barchop/formato/aparencia).
    onAccent: "#1A1A1A",
    // A marca como texto sobre o --cor-dark (as iniciais da fachada sem
    // capa). O amarelo da casa já passa; com outra marca, a Aparência
    // clareia até passar de 4,5:1.
    accentOnDark: "#F0C93A",
    // A marca como texto e ícone sobre fundo claro (o item ativo da
    // barra, o selecionado): 5,20:1 sobre o paleYellow, 5,89:1 sobre a
    // surface. O ouro puro some no creme.
    accentText: "#7D5F00",
    // O anel de foco: a tinta no claro, o ouro no escuro (o anel claro
    // se confundia com a moldura que havia em tudo).
    foco: "#26221C",
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
    // Estados do painel v2: o selo "Configurado" (ok), o "Faltando" e o
    // "Configurar →" das Configurações (atencao), e o fundo do erro. O
    // texto usa a cor forte; o fundo do selo, a clara do mesmo estado.
    // Medido (WCAG): ok 5,55:1 sobre o okFundo e 6,55:1 sobre a
    // surface; atencao 5,80:1 e 6,80:1; erro 5,34:1 sobre o erroFundo.
    ok: "#1e6b34",
    okFundo: "#dff1e2",
    atencao: "#8a4b00",
    atencaoFundo: "#fdebc8",
    erroFundo: "#fbe3e0",
  },
  dark: {
    // Neutro quente, sem o verde-oliva de antes (#17160F / #2C2A1F).
    paper: "#1C1A17",
    paperFim: "#151412",
    paperSoft: "#28251F",
    surface: "#211F1B",
    // Um pouco abaixo do branco: menos halo em volta das letras.
    ink: "#ECE6DA",
    inkSoft: "#B8B0A2",
    // 5,13:1 sobre a surface, 4,76:1 sobre o paperSoft.
    muted: "#968F82",
    // rgba(240,228,205,.08) e .15 sobre a surface.
    line: "#322F29",
    lineStrong: "#403D36",
    // Ouro mais calmo: o #FFD900 de croma máximo deixava pós-imagem nas
    // áreas grandes (bloco da agenda, item ativo).
    accent: "#E8C547",
    accentBorder: "#FFFB7B",
    // rgba(232,197,71,.13) sobre a surface.
    paleYellow: "#3B3521",
    paleBlue: "#152329",
    dark: "#1A1A1A",
    onAccent: "#1A1A1A",
    accentOnDark: "#E8C547",
    accentText: "#EBCB5E",
    foco: "#E8C547",
    // A sombra deixou de ser clara: o mesmo tom do texto contornando
    // cada cartão era a moldura que brilhava. Agora a profundidade vem
    // da sombra difusa (--sombra-* em app/tokens-css.ts).
    shadow: "#000000",
    // 6,93:1 sobre a surface e 5,60:1 sobre o erroFundo. O #FF6B5E de
    // antes lia, mas era neon perto do resto.
    erro: "#E8918A",
    placeholder: "#9A9284", // 5,34:1 sobre a surface, 4,96:1 sobre o paperSoft
    // No escuro inverte: texto claro sobre fundo escuro do mesmo estado
    // (o fundo é a cor a 12% sobre a surface). ok 6,71:1 sobre o okFundo
    // e 8,51:1 sobre a surface; atencao 6,28:1 e 7,87:1.
    ok: "#86C99E",
    okFundo: "#2D332B",
    atencao: "#E3A862",
    atencaoFundo: "#382F24",
    erroFundo: "#392D28",
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

// Desde 17/10 o contorno é um fio de 1px (a moldura de 2px competia com
// o conteúdo). As duas medidas ficam com nome próprio porque dizem
// coisas diferentes: o contorno de um controle e a divisória de lista.
export const borderWidth = {
  hairline: 1,
  padrao: 1,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
  display: 40,
} as const;
