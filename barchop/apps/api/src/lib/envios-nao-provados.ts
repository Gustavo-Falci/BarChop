import { contarNaJanela } from "./contador-de-limite";

// Quantas mensagens saíram hoje pra destinos que ninguém provou: o código
// de acesso do cliente, o convite da equipe e o e-mail de lembrete
// digitado no agendamento (auditoria de 15/11, SEC-012).
//
// Cada rota tem o teto dela por destino e por IP. Este contador é a visão
// do todo: um abuso espalhado por muitos destinos e muitos IPs passa por
// baixo de cada teto, mas aparece aqui — e é ele que gasta a cota do
// provedor e a reputação do domínio.
//
// Só avisa, não bloqueia: um teto global recusando pedidos seria um jeito
// de qualquer um desligar o login de todo mundo.

const DIA_MS = 24 * 60 * 60 * 1000;
const ALERTA_PADRAO = 300;

function limiteDeAlerta(): number {
  const configurado = Number(process.env.ALERTA_DE_ENVIOS_POR_DIA);
  return Number.isInteger(configurado) && configurado > 0 ? configurado : ALERTA_PADRAO;
}

interface Log {
  error(objeto: object, mensagem: string): void;
  warn(objeto: object, mensagem: string): void;
}

// Nunca lança: é telemetria, e a mensagem de quem pediu já está a caminho.
export async function contarEnvioNaoProvado(log: Log, agora: Date = new Date()): Promise<void> {
  try {
    const limite = limiteDeAlerta();
    const { contagem } = await contarNaJanela("envios-a-destino-nao-provado", DIA_MS, agora);
    // No limite e a cada múltiplo dele: uma linha por degrau, não uma por
    // mensagem.
    if (contagem % limite === 0) {
      log.error(
        { contagem, limite },
        "ALERTA: muitas mensagens pra destinos não provados nas últimas 24 horas"
      );
    }
  } catch (erro) {
    log.warn({ erro }, "não foi possível contar o envio a destino não provado");
  }
}
