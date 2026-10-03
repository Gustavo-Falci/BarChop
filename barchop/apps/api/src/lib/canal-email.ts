import type { CanalDeMensagem } from "./canal";

// O canal real do piloto: códigos do dono e do cliente, convites e
// lembretes saem por e-mail enquanto a verificação da Meta espera (o
// WhatsApp oficial é ADR-0004). Fala direto com a API HTTP do Resend —
// um POST só, sem SDK pra manter.
export interface ConfigDoEmail {
  chave: string;
  // "Nome <endereco@dominio>", num domínio verificado no Resend.
  remetente: string;
  // Injetável pros testes; em produção é o fetch global do Node.
  fetch?: typeof fetch;
}

const URL_DO_RESEND = "https://api.resend.com/emails";

// Só o suficiente pra não gastar uma chamada com um telefone: quem
// valida o e-mail de verdade é a rota que o recebeu.
const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canalDeEmail(config: ConfigDoEmail): CanalDeMensagem {
  const enviarHttp = config.fetch ?? fetch;

  return {
    nome: "email",
    async enviar(mensagem) {
      if (!PARECE_EMAIL.test(mensagem.para)) {
        throw new Error("canal de e-mail recebeu um destino que não é e-mail");
      }

      const resposta = await enviarHttp(URL_DO_RESEND, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.chave}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.remetente,
          to: [mensagem.para],
          // E-mail sem assunto cai no spam ou some na caixa de entrada.
          subject: mensagem.assunto ?? "BarChop",
          text: mensagem.texto,
        }),
      });

      // O corpo do erro do Resend não entra na mensagem: ele pode ecoar o
      // destino, e quem chama joga isto no log.
      if (!resposta.ok) {
        throw new Error(`Resend respondeu ${resposta.status}`);
      }
    },
  };
}
