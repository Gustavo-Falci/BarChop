import { canalDeEmail } from "./canal-email";
import { canalDeWhatsApp } from "./canal-whatsapp";

// Por onde as mensagens saem da API. No piloto o provedor real é o
// e-mail (Resend, `canal-email.ts`); o WhatsApp oficial entra quando a
// verificação da Meta andar. Quem chama fala só com esta interface, e
// trocar de provedor é escrever mais uma implementação, sem mexer em
// rota nenhuma.
export interface Mensagem {
  para: string;
  // Só o e-mail usa; os canais de texto curto ignoram.
  assunto?: string;
  texto: string;
  // Só o WhatsApp usa, e exige: a Meta só entrega mensagem iniciada pela
  // empresa com modelo aprovado. Os nomes e a ordem dos parâmetros são
  // os do modelo cadastrado no Business Manager (ver ADR-0009).
  modelo?: { nome: string; parametros: string[] };
}

// O que cada canal sabe entregar. O de e-mail não tem como mandar nada
// pra um telefone, e a rota precisa saber disso antes de emitir o
// código — senão o pedido vira um 500 no envio.
export type Destino = "email" | "telefone";

export interface CanalDeMensagem {
  nome: string;
  destinos: readonly Destino[];
  enviar(mensagem: Mensagem): Promise<void>;
}

export interface CanalDeMemoria extends CanalDeMensagem {
  enviadas: Mensagem[];
}

// Pros testes: guarda o que seria enviado, pra quem testa ler o código.
export function canalDeMemoria(): CanalDeMemoria {
  const enviadas: Mensagem[] = [];
  return {
    nome: "memoria",
    destinos: ["email", "telefone"],
    enviadas,
    async enviar(mensagem) {
      enviadas.push(mensagem);
    },
  };
}

// Dois provedores, um por destino: e-mail pro endereço, WhatsApp pro
// telefone. É como o WHATSAPP_ATIVO liga o WhatsApp sem tirar o e-mail
// de quem já o usa (convite, código do dono, lembrete por e-mail).
const PARECE_EMAIL = /@/;

export function canalComposto(email: CanalDeMensagem, telefone: CanalDeMensagem): CanalDeMensagem {
  return {
    nome: `${email.nome}+${telefone.nome}`,
    destinos: ["email", "telefone"],
    async enviar(mensagem) {
      await (PARECE_EMAIL.test(mensagem.para) ? email : telefone).enviar(mensagem);
    },
  };
}

interface Log {
  info(objeto: object, mensagem: string): void;
}

// Pro desenvolvimento: o código aparece no terminal do `pnpm dev`.
function canalDeLog(log: Log): CanalDeMensagem {
  return {
    nome: "log",
    destinos: ["email", "telefone"],
    async enviar(mensagem) {
      log.info({ para: mensagem.para, texto: mensagem.texto }, "mensagem (canal de log)");
    },
  };
}

// Escolhe pelo ambiente. Em produção o canal de log é recusado ao
// subir: código de verificação no log é conta de qualquer um que leia o
// log, e uma API que sobe assim sem ninguém perceber é pior do que uma
// que não sobe.
export function canalDoAmbiente(
  log: Log,
  env: Record<string, string | undefined> = process.env
): CanalDeMensagem {
  const base = canalBase(log, env);

  // WHATSAPP_ATIVO=true junta o WhatsApp pros telefones (ADR-0009). Fica
  // desligada até a Meta aprovar o negócio e os modelos. Valor torto é
  // erro: "sim" desligaria em silêncio quem achou que ligou.
  const whatsapp = env.WHATSAPP_ATIVO;
  if (whatsapp === undefined || whatsapp === "false") return base;
  if (whatsapp !== "true") {
    throw new Error(`WHATSAPP_ATIVO deve ser "true" ou "false", veio "${whatsapp}"`);
  }
  if (!env.WHATSAPP_TOKEN) throw new Error("WHATSAPP_ATIVO=true sem WHATSAPP_TOKEN");
  if (!env.WHATSAPP_NUMERO_ID) throw new Error("WHATSAPP_ATIVO=true sem WHATSAPP_NUMERO_ID");
  return canalComposto(
    base,
    canalDeWhatsApp({
      token: env.WHATSAPP_TOKEN,
      numeroId: env.WHATSAPP_NUMERO_ID,
      versao: env.WHATSAPP_VERSAO_API,
    })
  );
}

function canalBase(log: Log, env: Record<string, string | undefined>): CanalDeMensagem {
  const pedido = env.CANAL_DE_MENSAGEM;
  const producao = env.NODE_ENV === "production";

  if (producao && (pedido === undefined || pedido === "log" || pedido === "memoria")) {
    throw new Error(
      "CANAL_DE_MENSAGEM sem provedor real em produção — códigos de " +
        "verificação não podem sair pelo log nem ficar na memória."
    );
  }

  const escolhido = pedido ?? (env.NODE_ENV === "test" ? "memoria" : "log");
  if (escolhido === "memoria") return canalDeMemoria();
  if (escolhido === "log") return canalDeLog(log);
  if (escolhido === "email") {
    // Faltar credencial é erro na subida, pelo mesmo motivo do canal de
    // log em produção: a alternativa é descobrir no primeiro código que
    // não chegou.
    if (!env.RESEND_API_KEY) {
      throw new Error("CANAL_DE_MENSAGEM=email sem RESEND_API_KEY");
    }
    if (!env.EMAIL_REMETENTE) {
      throw new Error("CANAL_DE_MENSAGEM=email sem EMAIL_REMETENTE");
    }
    return canalDeEmail({ chave: env.RESEND_API_KEY, remetente: env.EMAIL_REMETENTE });
  }

  throw new Error(`CANAL_DE_MENSAGEM desconhecido: "${escolhido}"`);
}
