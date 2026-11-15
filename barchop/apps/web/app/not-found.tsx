import { headers } from "next/headers";
import { NaoEncontrado } from "../src/telas/NaoEncontrado";
import { versaoDoNaoEncontrado } from "../src/tenant/naoEncontrado";
import { CABECALHO_DA_BARBEARIA, CABECALHO_DO_CAMINHO } from "../src/tenant/rota";

// O 404 de todo host: endereço que não existe e o notFound() do layout
// de /[slug] (barbearia que não existe, nome reservado). A versão sai do
// que o proxy contou (src/tenant/naoEncontrado.ts). Sai com status 404:
// nada aqui é streamed — não há loading.tsx acima.
export default async function PaginaNaoEncontrada() {
  const cabecalhos = await headers();
  const versao = versaoDoNaoEncontrado({
    caminho: cabecalhos.get(CABECALHO_DO_CAMINHO),
    barbearia: cabecalhos.get(CABECALHO_DA_BARBEARIA),
  });
  // Sem <title> próprio: o not-found não exporta metadata, e um <title>
  // aqui disputa com o do layout raiz — a aba mostrava um ou outro
  // conforme a ordem de chegada. Fica o "BarChop" de todo o app.
  return <NaoEncontrado versao={versao} urlDoSite={process.env.NEXT_PUBLIC_URL_DO_SITE} />;
}
