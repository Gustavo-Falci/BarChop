import { NextResponse, type NextRequest } from "next/server";
import {
  CABECALHO_DA_BARBEARIA,
  CABECALHO_DO_CAMINHO,
  decidirRota,
  type Site,
} from "./src/tenant/rota";

// O tenant pelo host (ADR-0002). A regra inteira mora em
// src/tenant/rota.ts, que é pura e testada; aqui só se executa.
//
// Lido a cada requisição, e não no topo do módulo, pros testes poderem
// trocar. Vazio ou ausente: nada muda, e o `/[slug]` do desenvolvimento
// segue como sempre.
function siteDoAmbiente(): Site | undefined {
  const valor = process.env.NEXT_PUBLIC_URL_DO_SITE;
  if (!valor) return undefined;
  const { protocol, host } = new URL(valor);
  return { protocolo: protocol, host };
}

export function proxy(request: NextRequest) {
  const decisao = decidirRota(
    {
      host: request.headers.get("host") ?? "",
      caminho: request.nextUrl.pathname,
      busca: request.nextUrl.search,
    },
    siteDoAmbiente()
  );

  if (decisao.tipo === "redirecionar") {
    return NextResponse.redirect(decisao.url, decisao.status);
  }

  // Os cabeçalhos pro app saem do proxy, nunca de quem chama: o que
  // vier de fora é sobrescrito ou apagado.
  const cabecalhos = new Headers(request.headers);
  cabecalhos.set(CABECALHO_DO_CAMINHO, `${request.nextUrl.pathname}${request.nextUrl.search}`);
  cabecalhos.delete(CABECALHO_DA_BARBEARIA);
  if (decisao.barbearia) cabecalhos.set(CABECALHO_DA_BARBEARIA, decisao.barbearia);
  const repasse = { request: { headers: cabecalhos } };

  if (decisao.tipo === "reescrever") {
    return NextResponse.rewrite(new URL(decisao.destino, request.url), repasse);
  }
  return NextResponse.next(repasse);
}

export const config = {
  // Fora: os arquivos do Next e os estáticos da raiz. Não se exclui
  // "todo caminho com ponto", como nos exemplos da documentação: o token
  // do link do lembrete é um JWT, cheio de pontos, e precisa ser
  // reescrito no host da barbearia.
  matcher: ["/((?!_next/|__next|favicon\\.ico$|robots\\.txt$|sitemap\\.xml$).*)"],
};
