import {
  DIAS_DE_TESTE,
  IDS_DOS_PLANOS,
  PLANOS,
  formatarReais,
  limiteDeProfissionais,
  precosDoCiclo,
  type IdDoPlano,
} from "@barchop/formato";
import { baseDoSite } from "./rastreadores";

// O /llms.txt (llmstxt.org): o que o site diz de si, em markdown, pra
// quem lê com IA — a única auditoria do Lighthouse que a home não
// passava. Os textos são os das metas das páginas; os preços saem de
// planos.ts, como na TabelaDePrecos. Nada aqui promete o que o site não
// mostra.

const PAGINAS = [
  {
    caminho: "/",
    nome: "Início",
    descricao:
      "o cliente agenda pelo link da barbearia, escolhe o profissional e recebe lembrete.",
  },
  {
    caminho: "/precos",
    nome: "Preços",
    descricao: "Grátis com 1 profissional, ou Essencial e Completo por profissional, mensal ou anual.",
  },
  {
    caminho: "/gratis",
    nome: "BarChop Grátis",
    descricao:
      "agenda online, link de agendamento e lembrete por e-mail, grátis para sempre com 1 profissional.",
  },
];

const PAGINAS_LEGAIS = [
  { caminho: "/termos", nome: "Termos de uso", descricao: "as regras de uso do BarChop." },
  {
    caminho: "/privacidade",
    nome: "Política de privacidade",
    descricao: "como o BarChop trata os dados das barbearias e dos clientes delas, pela LGPD.",
  },
];

function fraseDoLimite(plano: IdDoPlano): string {
  const limite = limiteDeProfissionais(plano);
  if (limite === null) return "Profissionais sem limite";
  return limite === 1 ? "1 profissional" : `Até ${limite} profissionais`;
}

function linhaDoPlano(plano: IdDoPlano): string {
  const { nome } = PLANOS[plano];
  const mensal = precosDoCiclo(plano, "mensal");
  if (mensal.base === 0) return `- ${nome}: ${formatarReais(0)} por mês, para sempre. ${fraseDoLimite(plano)}.`;
  const anual = precosDoCiclo(plano, "anual");
  return (
    `- ${nome}: ${formatarReais(mensal.base)} por mês com 1 profissional, ` +
    `mais ${formatarReais(mensal.extra)} por profissional a mais; ` +
    `no anual, ${formatarReais(anual.base)} e ${formatarReais(anual.extra)} (2 meses grátis). ` +
    `${fraseDoLimite(plano)}.`
  );
}

export function textoDoLlms(urlDoSite: string | undefined): string {
  const base = baseDoSite(urlDoSite);
  const endereco = (caminho: string) => (base ? new URL(caminho, base).toString() : caminho);
  const item = (p: { caminho: string; nome: string; descricao: string }) =>
    `- [${p.nome}](${endereco(p.caminho)}): ${p.descricao}`;

  return [
    "# BarChop",
    "",
    `> A agenda online para barbearias: o cliente agenda pelo link da barbearia, escolhe o profissional e recebe lembrete. ${DIAS_DE_TESTE} dias grátis, sem cartão.`,
    "",
    "## Páginas",
    "",
    ...PAGINAS.map(item),
    "",
    "## Planos",
    "",
    `Toda barbearia começa com ${DIAS_DE_TESTE} dias de tudo liberado, sem cartão.`,
    "",
    ...IDS_DOS_PLANOS.map(linhaDoPlano),
    "",
    "Incluir um profissional no meio do período cobra na hora só os dias que faltam; tirar um não devolve o período em curso, e a próxima cobrança já vem com um a menos.",
    "",
    // "Optional" é a palavra do formato: o que dá pra pular.
    "## Optional",
    "",
    ...PAGINAS_LEGAIS.map(item),
    "",
  ].join("\n");
}
