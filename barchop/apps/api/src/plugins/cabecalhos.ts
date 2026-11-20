import type { App } from "../tipos";

// Os cabeçalhos de segurança de toda resposta da API (auditoria de
// 15/11, SEC-003). A API só devolve JSON: nada dela é página, então a
// política pode ser a mais fechada que existe. Os do web moram em
// apps/web/cabecalhos-de-seguranca.js.
const CABECALHOS = {
  // Um ano, com os subdomínios: o mesmo valor do web, pra que quem
  // chegar primeiro pela API também fique preso ao HTTPS.
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // O JSON é JSON: o navegador não adivinha outro tipo.
  "X-Content-Type-Options": "nosniff",
  // Nenhuma resposta da API é lugar de onde se navega; e o token do
  // lembrete viaja no caminho.
  "Referrer-Policy": "no-referrer",
  // Se alguém abrir uma resposta como página, nada carrega nem roda, e
  // ninguém a põe num iframe.
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
} as const;

// No onRequest, e registrado ANTES do CORS: o preflight é respondido
// dentro do onRequest do plugin de CORS, e hook que viesse depois dele
// não rodaria. Posto aqui, vale também pro 404 e pros erros, que não
// passam por rota nenhuma.
export function registrarCabecalhosDeSeguranca(app: App): void {
  app.addHook("onRequest", async (_request, reply) => {
    reply.headers(CABECALHOS);
  });
}
