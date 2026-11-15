import { eSlugDeBarbearia } from "./rota";

// Qual 404 mostrar (canvas "Página não encontrada", aprovado 15/11). O
// app/not-found.tsx atende todo host; quem diz de onde veio o pedido é o
// proxy: o caminho que o navegador pediu (CABECALHO_DO_CAMINHO) e, no
// host da barbearia, o nome dela (CABECALHO_DA_BARBEARIA).
//
// - painel: o caminho começa em /painel (o host do painel só serve isso);
// - barbearia: veio pelo host dela, ou pelo /<slug> do desenvolvimento;
// - site: o resto — reservados como /blog e /home, e o que não é slug.
export type VersaoDoNaoEncontrado = "site" | "barbearia" | "painel";

export function versaoDoNaoEncontrado({
  caminho,
  barbearia,
}: {
  caminho: string | null;
  barbearia: string | null;
}): VersaoDoNaoEncontrado {
  const rota = (caminho ?? "").split("?")[0]!;
  if (rota === "/painel" || rota.startsWith("/painel/")) return "painel";
  if (barbearia) return "barbearia";
  const primeiro = rota.split("/")[1] ?? "";
  return eSlugDeBarbearia(primeiro) ? "barbearia" : "site";
}
