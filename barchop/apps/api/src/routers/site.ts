import { contar } from "../lib/contagem-do-site";
import type { LimitesPublicos } from "../lib/limites";
import type { App } from "../tipos";

// A home avisa que foi vista (home nova, marco 1: linha de base de
// visita → cadastro). Aberta, sem login e sem guardar nada de quem
// visitou: só soma 1 no total do dia. A home avisa uma vez por aba.
const corpoVisita = {
  type: "object",
  required: ["pagina"],
  additionalProperties: false,
  properties: {
    // Só a home conta por enquanto; outra página entra aqui e em
    // EVENTOS_DO_SITE se um dia precisar.
    pagina: { type: "string", enum: ["home"] },
  },
} as const;

export function registrarRotasSite(app: App, limites: LimitesPublicos): void {
  app.post(
    "/site/visita",
    { schema: { body: corpoVisita }, preHandler: limites.visita },
    async (request, reply) => {
      await contar("visita_home", { log: request.log });
      return reply.code(204).send();
    }
  );
}
