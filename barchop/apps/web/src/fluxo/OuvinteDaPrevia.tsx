"use client";

import { useEffect } from "react";
import { MENSAGEM_DE_PRONTA, aplicarPrevia, deveAceitar, lerMensagemDaPrevia, origemDoPainel } from "./previa";

// Na página pública, dentro do iframe da prévia do painel: avisa que
// está pronta e aplica o rascunho que chegar. Fora de um iframe (o
// cliente abrindo o link), não faz nada.
export function OuvinteDaPrevia() {
  useEffect(() => {
    if (window.parent === window) return;
    const painel = origemDoPainel(process.env.NEXT_PUBLIC_URL_DO_SITE, window.location.origin);

    function aoReceber(evento: MessageEvent) {
      if (!deveAceitar(evento, painel, window.parent)) return;
      const mensagem = lerMensagemDaPrevia(evento.data);
      if (mensagem) aplicarPrevia(document, mensagem);
    }

    window.addEventListener("message", aoReceber);
    window.parent.postMessage({ tipo: MENSAGEM_DE_PRONTA }, painel);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  return null;
}
