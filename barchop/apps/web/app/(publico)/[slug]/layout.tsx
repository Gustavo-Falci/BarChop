import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProvedorDaApi } from "../../../src/api/ProvedorDaApi";
import { BarraDaBarbearia } from "../../../src/fluxo/BarraDaBarbearia";
import { metadataDaBarbearia } from "../../../src/fluxo/metadataDaBarbearia";
import { apiPublica } from "../../../src/sessao/cliente-da-api";
import { destinoDoSlugAntigo } from "../../../src/tenant/endereco";
import { ProvedorDoHost } from "../../../src/tenant/ProvedorDoHost";
import { CABECALHO_DA_BARBEARIA, CABECALHO_DO_CAMINHO } from "../../../src/tenant/rota";
import estilos from "./layout.module.css";

// No layout, e não em cada página: todas as telas do fluxo são da mesma
// barbearia, e a aba de qualquer passo deve dizer de qual. As telas são
// client components e não podem exportar metadata; o layout é server.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return metadataDaBarbearia(slug);
}

// O mesmo teto da metadata: com a API travada, a página abre sem o
// redirect em vez de esperar.
const TEMPO_MAXIMO_MS = 3000;

// O slug atual da barbearia que este slug acha — o próprio, ou o novo
// quando ele é um antigo (a API acha pelos dois). Qualquer falha devolve
// null e a página segue: quem explica slug inexistente é a tela.
async function slugAtual(slug: string): Promise<string | null> {
  const comTeto: typeof globalThis.fetch = (entrada, init) =>
    globalThis.fetch(entrada, { ...init, signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
  try {
    return (await apiPublica(comTeto).perfilDaBarbearia(slug)).slug;
  } catch {
    return null;
  }
}

// A barra da barbearia mora aqui, e não em cada tela, pelo mesmo motivo
// do shell do painel: identidade por repetição depende de ninguém
// esquecer, e quem esquecesse publicaria mais uma tela sem dizer de
// quem ela é. No layout ela também não remonta a cada passo do
// agendamento — o App Router preserva o layout entre as rotas filhas,
// então o nome é buscado uma vez por visita.
//
// Também é aqui que se resolve o host (ADR-0002): o proxy.ts diz, por
// cabeçalho, se a página veio pelo host da barbearia — aí os links das
// telas saem sem o slug — e qual caminho o navegador pediu. Slug antigo
// redireciona com 307, e não 308: o 308 fica no cache do navegador, e
// uma barbearia que voltasse ao nome anterior entraria em loop pra quem
// já tivesse visitado.
export default async function LayoutDaBarbearia({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cabecalhos = await headers();
  const barbeariaDoHost = cabecalhos.get(CABECALHO_DA_BARBEARIA);

  const atual = await slugAtual(slug);
  const destino =
    atual &&
    destinoDoSlugAntigo({
      pedido: slug,
      atual,
      caminho: cabecalhos.get(CABECALHO_DO_CAMINHO) ?? `/${slug}`,
      barbeariaDoHost,
      site: process.env.NEXT_PUBLIC_URL_DO_SITE,
    });
  if (destino) redirect(destino);

  return (
    <ProvedorDoHost barbearia={barbeariaDoHost}>
      <ProvedorDaApi>
        {/* O wrapper só existe pra declarar as larguras do fluxo (ver o
            CSS): a barra e a coluna leem a mesma variável daqui. */}
        <div className={estilos.fluxo}>
          <BarraDaBarbearia />
          {/* A coluna sai das telas e vem pra cá: as oito declaravam a
              largura e nenhuma a margem, então o fluxo inteiro encostava
              na esquerda no desktop. Aqui ela também fica na mesma vertical
              da barra acima, em vez de os dois combinarem por acaso. */}
          <div className={estilos.conteudo}>{children}</div>
        </div>
      </ProvedorDaApi>
    </ProvedorDoHost>
  );
}
