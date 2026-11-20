import type { FastifyReply, FastifyRequest } from "fastify";
import { PADRAO_SLUG } from "@barchop/formato";
import { origemPermitida, origensPermitidas } from "./borda";
import { enderecoDasBarbearias } from "./endereco";

// A sessão do navegador em cookie httpOnly, não no localStorage: um
// script injetado em qualquer página lia o token de 7 dias e o levava
// embora (auditoria de 15/11, SEC-003). O cookie é posto pela própria
// API (api.barchop.com.br), que é do mesmo site que o painel e as
// barbearias: o fetch com `credentials: "include"` leva ele junto, sem
// proxiar a API pelo Next.
//
// O cabeçalho `Authorization: Bearer` continua valendo: é o do app
// mobile, que não tem cookie, e o da web antiga até a nova entrar.
//
// O cookie vai em toda chamada credenciada pra API, venha da página que
// vier. Por isso cada tipo só vale vindo da origem dele:
//
// - painel e suporte, só do host do painel (URL_DO_PAINEL). A página de
//   uma barbearia mostra texto que o dono dela escreve; se um dia ela
//   tiver uma falha de script, o painel de quem a visitou não fica ao
//   alcance;
// - cliente, só do host da própria barbearia (URL_DAS_BARBEARIAS), e um
//   cookie por barbearia: o login do cliente é por barbearia, e o de uma
//   não pode ser usado pela página de outra.
//
// Pedido sem Origin (navegação, formulário de outro site num navegador
// antigo, app mobile) não usa cookie nenhum. É esta checagem que faz o
// papel de proteção contra CSRF: o fetch entre origens sempre manda o
// Origin, e um site de fora nunca está na lista.

export type TipoDeSessao = "painel" | "suporte" | "cliente";

// O cliente diz de qual barbearia é a sessão que quer usar. Não prova
// nada: só escolhe qual cookie ler, e o hook confere que o token é
// mesmo dessa barbearia e que a origem é a página dela.
export const CABECALHO_DA_BARBEARIA = "x-barchop-barbearia";

const HORA = 60 * 60;
const DURACAO: Record<TipoDeSessao, number> = {
  painel: 7 * 24 * HORA,
  cliente: 7 * 24 * HORA,
  // O mesmo prazo do token do suporte (plugins/auth.ts, SEC-008).
  suporte: 2 * HORA,
};

const FORMATO_DO_SLUG = new RegExp(PADRAO_SLUG);

export interface TokenDoPedido {
  token: string;
  via: "cabecalho" | "cookie";
  // Só no cliente por cookie: a barbearia que o cabeçalho escolheu.
  slug?: string;
}

// Lidos a cada pedido, e não na subida: os testes trocam o ambiente
// entre um caso e outro, e montar isto custa umas poucas strings.
function ambiente(): Record<string, string | undefined> {
  return process.env;
}

function origemDa(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

// HTTPS no painel = produção (ou algo igual a ela): cookie `Secure` e
// com o prefixo `__Host-`, que o navegador só aceita sem Domain, com
// Path=/ e vindo de HTTPS. Em desenvolvimento, http://localhost, sem os
// dois.
function emHttps(): boolean {
  return ambiente().URL_DO_PAINEL?.startsWith("https://") ?? false;
}

export function nomeDoCookie(tipo: TipoDeSessao, slug?: string): string {
  const base = tipo === "cliente" ? `barchop_cliente_${slug}` : `barchop_${tipo}`;
  return emHttps() ? `__Host-${base}` : base;
}

function cabecalhoUnico(request: FastifyRequest, nome: string): string | undefined {
  const valor = request.headers[nome];
  return typeof valor === "string" ? valor : undefined;
}

// A origem pode usar o cookie deste tipo (e desta barbearia)?
export function origemDaSessao(request: FastifyRequest, tipo: TipoDeSessao, slug?: string): boolean {
  const origem = cabecalhoUnico(request, "origin");
  if (!origem) return false;

  const env = ambiente();
  if (!origemPermitida(origensPermitidas(env), origem)) return false;

  const painel = origemDa(env.URL_DO_PAINEL);
  if (tipo !== "cliente") return painel === undefined || origem === painel;

  if (!slug) return false;
  // Sem molde, a página da barbearia mora em `<painel>/<slug>` (ver
  // lib/endereco.ts), e a origem é a do painel. Sem nenhum dos dois
  // (desenvolvimento), vale qualquer origem da lista.
  const endereco = enderecoDasBarbearias(env);
  if (!endereco) return true;
  return origem === origemDa(endereco(slug));
}

function lerCookie(request: FastifyRequest, nome: string): string | undefined {
  const bruto = cabecalhoUnico(request, "cookie");
  if (!bruto) return undefined;
  for (const parte of bruto.split(";")) {
    const igual = parte.indexOf("=");
    if (igual < 0) continue;
    if (parte.slice(0, igual).trim() === nome) {
      const valor = parte.slice(igual + 1).trim();
      return valor || undefined;
    }
  }
  return undefined;
}

// De onde vem o token deste pedido: o cabeçalho, se veio (app mobile,
// web antiga), ou o cookie do tipo pedido, se a origem pode usá-lo.
// Cabeçalho torto é pedido sem sessão, como era com o @fastify/jwt.
export function tokenDoPedido(request: FastifyRequest, tipo: TipoDeSessao): TokenDoPedido | null {
  const autorizacao = cabecalhoUnico(request, "authorization");
  if (autorizacao !== undefined) {
    const achado = /^Bearer\s+(\S+)$/i.exec(autorizacao);
    return achado ? { token: achado[1], via: "cabecalho" } : null;
  }

  let slug: string | undefined;
  if (tipo === "cliente") {
    slug = cabecalhoUnico(request, CABECALHO_DA_BARBEARIA);
    if (!slug || !FORMATO_DO_SLUG.test(slug)) return null;
  }

  const token = lerCookie(request, nomeDoCookie(tipo, slug));
  if (!token || !origemDaSessao(request, tipo, slug)) return null;
  return { token, via: "cookie", slug };
}

function serializar(nome: string, valor: string, segundos: number): string {
  const partes = [`${nome}=${valor}`, "Path=/", `Max-Age=${segundos}`, "HttpOnly", "SameSite=Lax"];
  if (emHttps()) partes.push("Secure");
  return partes.join("; ");
}

// Acrescenta, sem apagar um Set-Cookie que outra parte já pôs.
function acrescentar(reply: FastifyReply, cookie: string): void {
  const atual = reply.getHeader("set-cookie");
  const lista = atual === undefined ? [] : Array.isArray(atual) ? atual.map(String) : [String(atual)];
  reply.header("set-cookie", [...lista, cookie]);
}

// Depois de um login: o navegador da origem certa ganha o cookie. Sem
// Origin (app mobile) ou de outra origem, nada muda — o token segue no
// corpo da resposta, como sempre foi.
export function gravarSessao(
  request: FastifyRequest,
  reply: FastifyReply,
  tipo: TipoDeSessao,
  token: string,
  slug?: string
): void {
  if (!origemDaSessao(request, tipo, slug)) return;
  acrescentar(reply, serializar(nomeDoCookie(tipo, slug), token, DURACAO[tipo]));
}

// O "Sair" e o token recusado: só a API apaga um cookie httpOnly.
export function apagarSessao(reply: FastifyReply, tipo: TipoDeSessao, slug?: string): void {
  acrescentar(reply, serializar(nomeDoCookie(tipo, slug), "", 0));
}

export function slugValido(texto: string | undefined): texto is string {
  return !!texto && FORMATO_DO_SLUG.test(texto);
}
