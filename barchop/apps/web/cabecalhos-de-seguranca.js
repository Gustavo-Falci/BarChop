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

/**
 * @param {string | undefined} urlDoSite NEXT_PUBLIC_URL_DO_SITE
 * @returns {{ key: string, value: string }[]}
 */
function cabecalhosDeSeguranca(urlDoSite) {
  return [
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
    // propósito: sem nonce ela teria de liberar script em linha (e não
    // protegeria), e com nonce errado tira a página do ar. Entra depois,
    // primeiro em modo relatório.
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
