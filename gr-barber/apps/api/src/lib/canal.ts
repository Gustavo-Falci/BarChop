// Por onde os códigos de verificação saem da API. O provedor real
// (WhatsApp ou SMS pro cliente, e-mail pro barbeiro) ainda não foi
// escolhido — decisão do passo de infra no roadmap. Até lá, quem chama
// fala só com esta interface, e trocar de provedor é escrever mais uma
// implementação, sem mexer em rota nenhuma.
export interface Mensagem {
  para: string;
  texto: string;
}

export interface CanalDeMensagem {
  nome: string;
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
    enviadas,
    async enviar(mensagem) {
      enviadas.push(mensagem);
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

  throw new Error(`CANAL_DE_MENSAGEM desconhecido: "${escolhido}"`);
}
