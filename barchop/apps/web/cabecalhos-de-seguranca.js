// Os cabeçalhos de segurança de todas as respostas do web (auditoria de
// 15/11, SEC-003). CommonJS, e fora de src/, porque quem usa é o
// next.config.js — que o Next carrega antes de compilar TypeScript.
//
// Nada aqui conserta um XSS: é a segunda linha, pra quando houver um.

// O painel mora em `painel.<host do site>` (src/tenant/rota.ts).
const SUBDOMINIO_DO_PAINEL = "painel";

// Quem pode abrir uma página nossa dentro de um iframe: a própria
// origem e o painel, que mostra a página da barbearia (outro host) na
// prévia de Configurações → Aparência. Sem o site configurado
// (desenvolvimento) a prévia é da mesma origem.
function quemPodeEmoldurar(urlDoSite) {
  if (!urlDoSite) return "'self'";
  const { protocol, host } = new URL(urlDoSite);
  return `'self' ${protocol}//${SUBDOMINIO_DO_PAINEL}.${host}`;
}

// A política que limita de onde vem script e pra onde a página pode
// falar — em MODO RELATÓRIO: o navegador não bloqueia nada, só manda
// pra API o que bloquearia (POST /relatorios/csp, que escreve no log).
// Uma regra errada aqui tiraria a página do ar pra todo mundo; assim, é
// a produção que diz se ela pode valer. Quando o log ficar uma ou duas
// semanas sem relatório de coisa legítima, a regra passa pro cabeçalho
// que vale (`Content-Security-Policy`, mais abaixo).
//
// O que ela segura, mesmo com 'unsafe-inline': script carregado de
// outro site, `eval`, e a página falando com um servidor que não é o
// nosso — o caminho de um script injetado pra levar o token embora.
// 'unsafe-inline' fica porque os scripts de tema do layout são em linha;
// tirar pede nonce, e nonce obriga toda página a ser montada a cada
// visita (node_modules/next/dist/docs/.../content-security-policy.md).
// É uma decisão de desempenho, à parte.
//
// Só em produção e com a API configurada: em desenvolvimento o Next usa
// `eval`, e a página viveria mandando relatório do próprio ambiente.
function politicaEmRelatorio(urlDoSite, { urlDaApi, producao } = {}) {
  if (!producao || !urlDoSite || !urlDaApi) return null;
  const api = new URL(urlDaApi).origin;
  const site = new URL(urlDoSite);
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    // As imagens vêm do bucket, de outro host. `https:` inteiro por
    // enquanto: fechar no host do bucket pede uma variável nova no build.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`,
    // A prévia do painel mostra a página da barbearia, que é outro host.
    `frame-src 'self' ${site.protocol}//*.${site.host}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `report-uri ${api}/relatorios/csp`,
  ].join("; ");
}

/**
 * @param {string | undefined} urlDoSite NEXT_PUBLIC_URL_DO_SITE
 * @param {{ urlDaApi?: string, producao?: boolean }} [opcoes] NEXT_PUBLIC_API_URL e se é build de produção
 * @returns {{ key: string, value: string }[]}
 */
function cabecalhosDeSeguranca(urlDoSite, opcoes) {
  const emRelatorio = politicaEmRelatorio(urlDoSite, opcoes);
  return [
    ...(emRelatorio ? [{ key: "Content-Security-Policy-Report-Only", value: emRelatorio }] : []),
    // Um ano, com os subdomínios: cada barbearia mora num, e todos saem
    // pelo mesmo certificado coringa. O navegador ignora o cabeçalho em
    // http://localhost, então não atrapalha o desenvolvimento. Sem
    // `preload`: entrar na lista dos navegadores é difícil de desfazer.
    { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
    // O navegador usa o Content-Type que mandamos, sem adivinhar.
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Pra outro site vai só a origem: o link do lembrete leva o token
    // no caminho, e o caminho não pode sair no Referer.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // O produto não usa nenhuma das três; um script injetado também não.
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    // Só as diretivas que não dependem de nonce: iframe de terceiros
    // (clickjacking), plugin, <base> trocando a raiz dos links e
    // formulário mandando dados pra fora. A de script fica de fora de
    // propósito: errada, ela tira a página do ar. Está em modo relatório
    // (`politicaEmRelatorio`, acima) até a produção mostrar que cabe.
    {
      key: "Content-Security-Policy",
      value: [
        `frame-ancestors ${quemPodeEmoldurar(urlDoSite)}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];
}

module.exports = { cabecalhosDeSeguranca };
