import type { CanalDeMensagem } from "./canal";
import { telefoneParaWhatsApp } from "./telefone";

// O WhatsApp oficial (ADR-0004), pela Cloud API da Meta. Fica atrás de
// WHATSAPP_ATIVO, desligada, até a verificação do negócio e os modelos
// saírem (ADR-0009): até lá códigos, convites e lembretes vão por
// e-mail. Um POST só, sem SDK, como o canal do Resend.
export interface ConfigDoWhatsApp {
  // Token permanente do usuário de sistema do Business Manager.
  token: string;
  // O id do número na Meta (não é o número de telefone).
  numeroId: string;
  // A Graph API é versionada na URL; trocar de versão é config, não código.
  versao?: string;
  fetch?: typeof fetch;
}

// Só o suficiente pra não gastar uma chamada com um e-mail.
const PARECE_TELEFONE = /^\(\d{2}\) \d{4,5}-\d{4}$/;

export function canalDeWhatsApp(config: ConfigDoWhatsApp): CanalDeMensagem {
  const enviarHttp = config.fetch ?? fetch;
  const url = `https://graph.facebook.com/${config.versao ?? "v21.0"}/${config.numeroId}/messages`;

  return {
    nome: "whatsapp",
    destinos: ["telefone"],
    async enviar(mensagem) {
      if (!PARECE_TELEFONE.test(mensagem.para)) {
        throw new Error("canal de WhatsApp recebeu um destino que não é telefone");
      }
      // Mensagem iniciada pela empresa só é entregue com modelo aprovado
      // pela Meta. Texto livre seria aceito pela API e descartado na
      // entrega — o cliente nunca receberia, e nada avisaria. Melhor
      // falhar aqui, onde o log mostra quem esqueceu o modelo.
      if (!mensagem.modelo) {
        throw new Error("canal de WhatsApp só envia mensagem com modelo aprovado (Mensagem.modelo)");
      }

      const resposta = await enviarHttp(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: telefoneParaWhatsApp(mensagem.para),
          type: "template",
          template: {
            name: mensagem.modelo.nome,
            language: { code: "pt_BR" },
            components: [
              {
                type: "body",
                parameters: mensagem.modelo.parametros.map((text) => ({ type: "text", text })),
              },
            ],
          },
        }),
      });

      // O corpo do erro da Meta não entra na mensagem: ele ecoa o
      // número, e quem chama joga isto no log.
      if (!resposta.ok) {
        throw new Error(`Cloud API do WhatsApp respondeu ${resposta.status}`);
      }
    },
  };
}
