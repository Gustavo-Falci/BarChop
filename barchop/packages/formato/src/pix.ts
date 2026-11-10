import type { Ciclo } from "./planos";

// O Pix do BarChop (plano pix-do-barchop): o BR Code estático com o
// valor exato, gerado pelo próprio BarChop na chave do BarChop, e o
// período que um Pix paga. Sem integração com banco: quem confere o
// pagamento é o Suporte, no extrato.

// `aguardando` = o dono tocou "Já paguei" e o plano já vale; o Suporte
// confirma ou recusa; `desfeito` = o dono tocou "Ainda não paguei". A
// lista vira CHECK na migration do pagamento_pix.
export const SITUACOES_DO_PIX = ["aguardando", "confirmado", "recusado", "desfeito"] as const;
export type SituacaoDoPix = (typeof SITUACOES_DO_PIX)[number];

// CRC-16/CCITT-FALSE (polinômio 0x1021, início 0xFFFF), em 4 dígitos
// hexadecimais maiúsculos: o campo 63 do BR Code, calculado sobre tudo
// que vem antes dele, inclusive o "6304".
export function crc16DoPix(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i += 1) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

// Nome e cidade do recebedor: sem acento, só ASCII, cortados no limite
// do BR Code. Banco que lê o QR mostra o nome do recebedor pra quem paga.
function semAcento(texto: string, limite: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .slice(0, limite);
}

const PADRAO_DO_IDENTIFICADOR = /^[A-Za-z0-9]{1,25}$/;

export interface DadosDoBrCode {
  chave: string;
  nome: string;
  cidade: string;
  // Sem valor, quem paga digita (o QR do manual). O BarChop sempre manda.
  valorCentavos: number | null;
  // O txid do QR estático (62/05): o banco de quem paga o repassa intacto
  // ao recebedor. Sem ele, "***", como o manual pede.
  identificador: string | null;
}

// O "copia e cola" e o conteúdo do QR (Manual de Padrões para Iniciação
// do Pix, item 2.6; EMV QRCPS-MPM).
export function brCodeDoPix(dados: DadosDoBrCode): string {
  if (dados.identificador !== null && !PADRAO_DO_IDENTIFICADOR.test(dados.identificador)) {
    throw new RangeError(`identificador do Pix inválido: ${dados.identificador}`);
  }
  if (dados.valorCentavos !== null && (!Number.isInteger(dados.valorCentavos) || dados.valorCentavos < 1)) {
    throw new RangeError(`valor do Pix inválido: ${dados.valorCentavos}`);
  }
  const conta = campo("00", "br.gov.bcb.pix") + campo("01", dados.chave);
  const semCrc =
    campo("00", "01") +
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") +
    (dados.valorCentavos !== null ? campo("54", (dados.valorCentavos / 100).toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", semAcento(dados.nome, 25)) +
    campo("60", semAcento(dados.cidade, 15)) +
    campo("62", campo("05", dados.identificador ?? "***")) +
    "6304";
  return semCrc + crc16DoPix(semCrc);
}

// A chave na tela, pra quem paga conferir sem a chave inteira à mostra:
// e-mail com a primeira letra e o domínio; o resto, os 4 últimos.
export function chaveMascarada(chave: string): string {
  const arroba = chave.indexOf("@");
  if (arroba > 0) return `${chave[0]}•••${chave.slice(arroba)}`;
  return `•••${chave.slice(-4)}`;
}

// O Brasil não tem horário de verão desde 2019: São Paulo é UTC−3 o ano
// todo.
const FUSO_DE_SAO_PAULO = 3 * 60 * 60 * 1000;
const UM_DIA = 24 * 60 * 60 * 1000;

export function inicioDoDiaEmSaoPaulo(agora: Date): Date {
  const local = agora.getTime() - FUSO_DE_SAO_PAULO;
  return new Date(Math.floor(local / UM_DIA) * UM_DIA + FUSO_DE_SAO_PAULO);
}

// O fim do período pago: um mês (ou doze) depois do início, no relógio
// de São Paulo. Dia que não existe no mês de chegada vira o último dia
// dele (31/01 → 28 ou 29/02), sem escorregar pro mês seguinte.
export function fimDoPeriodoDoPix(inicio: Date, ciclo: Ciclo): Date {
  const meses = ciclo === "anual" ? 12 : 1;
  const local = new Date(inicio.getTime() - FUSO_DE_SAO_PAULO);
  const dia = local.getUTCDate();
  const destino = new Date(local.getTime());
  destino.setUTCDate(1);
  destino.setUTCMonth(destino.getUTCMonth() + meses);
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(dia, ultimoDia));
  return new Date(destino.getTime() + FUSO_DE_SAO_PAULO);
}
