import { resumoDaAssinatura } from "../lib/assinatura";
import { exigirPapel } from "../plugins/auth";
import type { App } from "../tipos";

// A assinatura do BarChop no painel (Onda 2, marco 1). Só o dono vê e
// mexe nela (decisão 7 do plano cobranca-do-barchop). Checkout e
// Portal da Stripe entram no PR 4.
export function registrarRotasAssinatura(app: App): void {
  app.get("/barbearias/me/assinatura", { onRequest: exigirPapel("dono") }, async (request) =>
    resumoDaAssinatura(request.user.barbeariaId, new Date())
  );
}
