// Gera project/tokens.json do Design System a partir de @barchop/design-tokens.
// Os nomes são as custom properties que app/tokens-css.ts emite (--cor-*, --raio-*...).
import { writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";

import { ARQUIVO_DO_COMPONENTE, COMPONENTES, REPO, SAIDA } from "./caminhos.mts";

const t = await import(pathToFileURL(join(REPO, "packages/design-tokens/src/index.ts")).href);
const { colors, radius, spacing, borderWidth } = t;

const kebab = (n: string) => n.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);

// Notas de uso: tiradas dos comentários de packages/design-tokens e do uso no CSS.
const USO: Record<string, string> = {
  paper: "Fundo da página. O body desce de cor-paper a cor-paper-fim num degradê fixo na janela.",
  paperFim: "Fim do degradê do fundo (body). Não usar sozinho como superfície.",
  paperSoft: "Fundo suave dentro de cartões: campos de lista, resumo em pílula, linhas alternadas.",
  surface: "Superfície de cartão, folha e janela. Branco quente, nunca #fff puro.",
  ink: "Texto principal e títulos. No escuro fica abaixo do branco pra reduzir o halo.",
  inkSoft: "Texto de apoio forte: descrições, valores secundários.",
  muted: "Texto auxiliar e legendas. Claro: 5,50:1 na surface, 5,05:1 no paper-soft, 4,66:1 no paper-fim. Escuro: 5,13:1 na surface.",
  line: "Divisória de lista e separador entre linhas (fio de 1px).",
  lineStrong: "Contorno de campo, cartão e botão secundário: um passo acima da divisória.",
  accent: "O ouro da marca: botão principal, item ativo, bloco da agenda. Texto sobre ele usa cor-on-accent. Nunca como cor de texto sobre fundo claro (use cor-accent-text).",
  accentBorder: "Amarelo claro da proposta antiga. Sem uso no CSS hoje; mantido no pacote de tokens.",
  paleYellow: "Fundo do selecionado e do ícone do Vazio (o ouro a ~13% no escuro).",
  paleBlue: "Fundo informativo pontual (Home e perfil da barbearia).",
  dark: "Quase preto fixo nos dois temas: texto sobre o ouro e blocos escuros da marca.",
  onAccent: "Texto e ícone sobre cor-accent (o botão Agendar). Na página pública com outra cor da marca, a Aparência calcula por contraste.",
  accentOnDark: "A marca como texto sobre cor-dark (iniciais da fachada sem capa).",
  accentText: "A marca como texto e ícone sobre fundo claro (item ativo da barra, selecionado). Claro: 5,20:1 no pale-yellow, 5,89:1 na surface.",
  foco: "Anel de foco (:focus-visible, 3px, offset 2px): a tinta no claro, o ouro no escuro.",
  shadow: "Base das sombras. As sombras prontas estão em sombra-1, sombra-2 e sombra-botao.",
  erro: "Texto e borda de erro. Por tema: nenhum vermelho passa 4,5:1 nos dois fundos. Claro 6,54:1 na surface; escuro 6,93:1.",
  placeholder: "Placeholder de campo. Claro 5,78:1 na surface; escuro 5,34:1. Bem mais fraco que cor-ink-soft pra não passar por conteúdo.",
  ok: "Texto do estado ok (selo Configurado, Conectada). Claro 5,55:1 no ok-fundo; escuro 6,71:1.",
  okFundo: "Fundo do selo ok.",
  atencao: "Texto do estado atenção (Faltando, Configurar →). Claro 5,80:1 no atencao-fundo; escuro 6,28:1.",
  atencaoFundo: "Fundo do selo atenção.",
  erroFundo: "Fundo do aviso de erro. cor-erro sobre ele: 5,34:1 no claro, 5,60:1 no escuro.",
};

const corTokens = Object.keys(colors.light).map((k) => {
  const nome = `cor-${kebab(k)}`;
  if (!USO[k]) throw new Error(`sem nota de uso: ${k}`);
  return {
    name: nome,
    value: { light: colors.light[k].toLowerCase(), dark: colors.dark[k].toLowerCase() },
    usage: USO[k],
  };
});

// app/tokens-css.ts, SOMBRAS (claro -> light, escuro -> dark).
const SOMBRAS = {
  claro: {
    "sombra-1": "0 1px 2px rgba(38, 34, 28, 0.05), 0 8px 24px -16px rgba(38, 34, 28, 0.22)",
    "sombra-2": "0 2px 6px rgba(38, 34, 28, 0.06), 0 18px 40px -12px rgba(38, 34, 28, 0.28)",
    "sombra-botao": "0 2px 0 rgba(38, 34, 28, 0.22)",
  },
  escuro: {
    "sombra-1": "inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 14px 32px -20px rgba(0, 0, 0, 0.75)",
    "sombra-2": "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 18px 44px -12px rgba(0, 0, 0, 0.8)",
    "sombra-botao": "0 2px 0 rgba(0, 0, 0, 0.35)",
  },
} as const;
const USO_SOMBRA: Record<string, string> = {
  "sombra-1": "Cartão. No escuro ganha um fio claro de 2,5% no topo, que o separa do fundo.",
  "sombra-2": "O que flutua sobre a tela: menu, janela, folha.",
  "sombra-botao": "O botão, que afunda nos 2px da sua sombra ao apertar.",
};
const sombraTokens = (Object.keys(SOMBRAS.claro) as (keyof typeof SOMBRAS.claro)[]).map((n) => ({
  name: n,
  value: { light: SOMBRAS.claro[n], dark: SOMBRAS.escuro[n] },
  usage: USO_SOMBRA[n],
}));

const USO_ESPACO: Record<string, string> = {
  xs: "Entre ícone e texto; ajuste fino.",
  sm: "Entre itens de uma linha; padding vertical de botão.",
  md: "Padding de cartão no celular; entre campos.",
  lg: "Padding horizontal de botão; entre blocos.",
  xl: "Entre seções.",
  xxl: "Respiro grande de página (marketing).",
};
const USO_RAIO: Record<string, string> = {
  sm: "Itens pequenos: botão de lista, miniatura.",
  md: "Botão e campo (o botão lê --raio-botao, que a Aparência pode trocar, e cai neste).",
  lg: "Cartão e folha.",
  xl: "Blocos grandes de marketing.",
  pill: "Pílula: chip, filtro, selo, resumo.",
};
const USO_BORDA: Record<string, string> = {
  hairline: "Divisória de lista. Desde 17/10 o contorno é um fio de 1px.",
  padrao: "Contorno de controle e cartão (com cor-line-strong).",
};

const px = (v: number) => `${v}px`;
const USO_TEXTO: Record<string, string> = {
  xs: "Selo pequeno do Chip, notas curtas.",
  sm: "O mais usado: apoio do título, linhas de lista, rótulos.",
  md: "Corpo de texto e rótulo do botão.",
  lg: "h2 de seção e cartão.",
  xl: "h1 da página; números da Estatistica.",
  display: "Título de marketing e da página pública.",
};

const tokens = {
  name: "BarChop",
  version: 1,
  meta: {
    source: "github",
    repo: "Gustavo-Falci/BarChop",
    // O commit de onde saiu: `<branch>@<sha curto>`.
    ref: `${execSync("git rev-parse --abbrev-ref HEAD", { cwd: REPO }).toString().trim()}@${execSync("git rev-parse --short HEAD", { cwd: REPO }).toString().trim()}`,
    package: "barchop/packages/design-tokens",
    paths: {
      tokens: ["barchop/packages/design-tokens/src/index.ts", "barchop/apps/web/app/tokens-css.ts", "barchop/apps/web/app/globals.css"],
      fonts: ["barchop/apps/web/app/fontes.ts", "barchop/font/Inter/"],
      assets: [],
      docs: ["barchop/docs/UI_UX_DESIGN_GUIDELINES.md", "barchop/docs/design-system.html", "barchop/docs/product-brief.md"],
    },
    components: Object.fromEntries(
      COMPONENTES.map((c) => [c, `barchop/apps/web/src/componentes/${ARQUIVO_DO_COMPONENTE[c] ?? c}.tsx`]),
    ),
    synced: new Date().toISOString().slice(0, 10),
  },
  color: {
    themes: [
      { id: "light", name: "Claro" },
      { id: "dark", name: "Escuro" },
    ],
    tokens: corTokens,
  },
  type: {
    fonts: [
      { family: "Inter", file: "fonts/Inter-Regular-latin.woff2", weight: "400", style: "normal" },
      { family: "Inter", file: "fonts/Inter-SemiBold-latin.woff2", weight: "600", style: "normal" },
    ],
    families: {
      display: "\"Clash Grotesk\", system-ui, sans-serif",
      corpo: "Inter, system-ui, -apple-system, sans-serif",
    },
    groups: [
      {
        name: "Títulos",
        family: "display",
        styles: [
          { name: "display", fontSize: px(t.fontSize.display), lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", sample: "Agenda cheia, sem esforço", usage: "--texto-display. Título de marketing e página pública." },
          { name: "titulo-pagina", fontSize: px(t.fontSize.xl), lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", sample: "Novo agendamento", usage: "--texto-xl. h1 do CabecalhoDaPagina; números da Estatistica." },
          { name: "titulo-secao", fontSize: px(t.fontSize.lg), lineHeight: 1.15, fontWeight: 700, letterSpacing: "-0.02em", sample: "Como o cliente paga", usage: "--texto-lg. h2 das seções e cartões (no lugar de rótulo em caixa alta)." },
          { name: "botao", fontSize: px(t.fontSize.md), lineHeight: 1.5, fontWeight: 700, sample: "Confirmar agendamento", usage: "--texto-md. Rótulo do Botao (Clash 700)." },
        ],
      },
      {
        name: "Texto",
        family: "corpo",
        styles: [
          { name: "corpo", fontSize: px(t.fontSize.md), lineHeight: 1.5, fontWeight: 400, sample: "O cliente escolhe os serviços e vê só os horários que cabem.", usage: "--texto-md. Corpo de texto (body)." },
          { name: "apoio", fontSize: px(t.fontSize.sm), lineHeight: 1.5, fontWeight: 400, sample: "Depois de salvar, dá pra pôr a foto.", usage: "--texto-sm. O tamanho mais usado: apoio do título, linhas de lista, legendas." },
          { name: "rotulo", fontSize: px(t.fontSize.sm), lineHeight: 1.5, fontWeight: 600, sample: "Pausa de sempre", usage: "--texto-sm 600. Rótulo de campo, chip e resumo." },
          { name: "miudo", fontSize: px(t.fontSize.xs), lineHeight: 1.4, fontWeight: 600, sample: "Inativo", usage: "--texto-xs. Selo pequeno do Chip e notas curtas." },
        ],
      },
    ],
  },
  spacing: {
    tokens: Object.entries(spacing).map(([k, v]) => ({ name: `espaco-${k}`, value: px(v as number), usage: USO_ESPACO[k] })),
  },
  radius: {
    tokens: Object.entries(radius).map(([k, v]) => ({ name: `raio-${k}`, value: px(v as number), usage: USO_RAIO[k] })),
  },
  shadow: { tokens: sombraTokens },
  texto: {
    note: "Tamanhos de texto como custom properties (--texto-*), que os componentes leem direto. Os estilos de Tipografia combinam estes tamanhos com família, peso e entrelinha.",
    tokens: Object.entries(t.fontSize).map(([k, v]) => ({ name: `texto-${k}`, value: px(v as number), usage: USO_TEXTO[k] })),
  },
  borda: {
    tokens: Object.entries(borderWidth).map(([k, v]) => ({ name: `borda-${k}`, value: px(v as number), usage: USO_BORDA[k] })),
  },
};

for (const g of [USO_ESPACO, USO_RAIO, USO_BORDA]) for (const [k, v] of Object.entries(g)) if (!v) throw new Error(k);
const saida = join(SAIDA, "tokens.json");
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify(tokens, null, 2) + "\n");
writeFileSync(join(SAIDA, "tokens.css"), compilarCss());
console.log("ok", corTokens.length, "cores", sombraTokens.length, "sombras");

// O tokens.css que a página do Design System compila de tokens.json ao salvar, no mesmo
// formato ("tokens.css as compiled"). A página só escreve o seu quando alguém salva uma
// edição; até lá (e no canvas, que leva uma cópia) vale este. A primeira linha é a que a
// página reconhece como dela: depois de um salvamento lá, ela assume o arquivo.
function compilarCss(): string {
  const [primeiro, ...outros] = tokens.color.themes.map((tema) => tema.id) as ("light" | "dark")[];
  const porTema = [...tokens.color.tokens, ...tokens.shadow.tokens];
  const declarar = (pares: [string, string][]) => pares.map(([nome, valor]) => `  --${nome}: ${valor};`).join("\n");

  const blocos = [
    `/* ${tokens.name} — generated from tokens.json */`,
    `:root, [data-theme="${primeiro}"] {\n${declarar(porTema.map((tk) => [tk.name, tk.value[primeiro]]))}\n}`,
    ...outros.map(
      (tema) =>
        `[data-theme="${tema}"] {\n${declarar(porTema.filter((tk) => tk.value[tema] !== tk.value[primeiro]).map((tk) => [tk.name, tk.value[tema]]))}\n}`,
    ),
    `:root {\n${declarar([
      ...[tokens.spacing, tokens.radius, tokens.texto, tokens.borda].flatMap((familia) =>
        familia.tokens.map((tk): [string, string] => [tk.name, tk.value]),
      ),
      ...Object.entries(tokens.type.families).map(([chave, pilha]): [string, string] => [`font-${chave}`, pilha]),
    ])}\n}`,
    ...tokens.type.groups.flatMap((grupo) =>
      grupo.styles.map((estilo) => {
        const regras = [
          `font-family: var(--font-${grupo.family})`,
          `font-size: ${estilo.fontSize}`,
          `line-height: ${estilo.lineHeight}`,
          `font-weight: ${estilo.fontWeight}`,
          ...("letterSpacing" in estilo ? [`letter-spacing: ${estilo.letterSpacing}`] : []),
        ];
        return `.${estilo.name} { ${regras.join("; ")}; }`;
      }),
    ),
    ...tokens.type.fonts.map(
      (fonte) =>
        `@font-face { font-family: "${fonte.family}"; src: url("${fonte.file}") format("woff2"); font-weight: ${fonte.weight}; font-style: ${fonte.style}; font-display: swap; }`,
    ),
  ];
  return blocos.join("\n\n") + "\n";
}
