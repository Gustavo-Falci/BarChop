import type { LimitesPublicos } from "../lib/limites";
import { resumirRelatorioDeCsp } from "../lib/relatorio-de-csp";
import type { App } from "../tipos";

// Pra onde o navegador manda o que a política de conteúdo do web
// bloquearia (auditoria de segurança de 15/11, SEC-003). A política
// entra em modo relatório (apps/web/cabecalhos-de-seguranca.js): nada é
// bloqueado, e o que seria aparece aqui, no log da API. É o que diz se a
// regra pode passar a valer sem tirar página do ar:
//
//   docker compose logs api | grep "relatório de CSP"
//
// Aberta, sem login: quem manda é o navegador de qualquer visitante. Por
// isso o corpo é pequeno, o limite é por IP, a resposta é sempre a mesma
// e o que vai pro log passa por `resumirRelatorioDeCsp`.

// Um relatório de verdade tem algumas centenas de bytes.
const TAMANHO_MAXIMO = 8 * 1024;

export function registrarRotaRelatorioDeCsp(app: App, limites: LimitesPublicos): void {
  // Escopo próprio: o leitor de corpo tolerante vale só aqui.
  app.register(async (escopo: App) => {
    // O navegador manda como `application/csp-report`; os mais novos,
    // como `application/reports+json`. Corpo que não é JSON vira `null`
    // em vez de 400: a resposta é a mesma pra tudo.
    escopo.removeAllContentTypeParsers();
    escopo.addContentTypeParser(
      ["application/csp-report", "application/reports+json", "application/json"],
      { parseAs: "string", bodyLimit: TAMANHO_MAXIMO },
      (_request, corpo, feito) => {
        try {
          feito(null, JSON.parse(corpo as string));
        } catch {
          feito(null, null);
        }
      }
    );

    escopo.post("/relatorios/csp", { preHandler: limites.relatorioDeCsp }, async (request, reply) => {
      const resumo = resumirRelatorioDeCsp(request.body);
      if (resumo) request.log.warn({ csp: resumo }, "relatório de CSP");
      return reply.code(204).send();
    });
  });
}
