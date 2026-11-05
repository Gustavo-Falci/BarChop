// Caminhos e a lista de componentes do gerador do Design System.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const AQUI = dirname(fileURLToPath(import.meta.url));
// A raiz do monorepo (barchop/).
export const REPO = resolve(AQUI, "../..");
export const WEB = join(REPO, "apps/web");
// O que sai daqui é a árvore `project/` do artefato Design System, pronta pra publicar.
export const SAIDA = join(AQUI, "saida", "project");

// Os componentes do pacote: os que as telas públicas (onda B) importam.
// BotaoLink mora em Botao.tsx.
export const COMPONENTES = [
  "Botao",
  "BotaoLink",
  "Aviso",
  "Carregando",
  "IndicadorDePasso",
  "ItemDeServico",
  "Campo",
  "LogoDaBarbearia",
  "Chip",
  "Resumo",
  "MarcaDeConfirmado",
  "ListaDeHorarios",
  "FaixaDeDias",
  "CartaoDeServico",
  "Calendario",
];
export const ARQUIVO_DO_COMPONENTE: Record<string, string> = { BotaoLink: "Botao" };
