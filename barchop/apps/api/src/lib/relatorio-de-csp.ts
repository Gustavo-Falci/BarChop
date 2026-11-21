// O que sobra de um relatório de violação de CSP pra ir pro log
// (auditoria de segurança de 15/11, SEC-003). Quem manda é o navegador de
// qualquer visitante — ou qualquer um fingindo ser um. Por isso o resumo
// é pouco, curto e sem segredo:
//
// - só os campos que servem pra achar a regra errada;
// - cada texto cortado e sem quebra de linha (ninguém forja linha de log);
// - endereço sem query nem fragmento, e com o token do link do lembrete
//   trocado por *** — o link é um "cancelar" que funciona.

export interface ResumoDeCsp {
  pagina: string | null;
  diretiva: string;
  bloqueado: string | null;
  arquivo: string | null;
  linha: number | null;
  modo: string | null;
}

const TAMANHO_MAXIMO = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== "string" || valor.length === 0) return null;
  // Caracteres de controle viram espaço antes do corte.
  return valor.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ").trim().slice(0, TAMANHO_MAXIMO) || null;
}

// `/lembrete/<token>` no web e `/lembretes/<token>` na API.
function semToken(caminho: string): string {
  return caminho.replace(/(\/lembretes?\/)[^/]+/, "$1***");
}

// Endereço vira origem + caminho. O que não é endereço (`eval`, `inline`,
// `data`, `blob`) passa como veio.
function endereco(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  if (!/^https?:\/\//i.test(bruto)) return bruto.split(/[?#]/)[0]!.slice(0, TAMANHO_MAXIMO) || null;
  try {
    const url = new URL(bruto);
    return `${url.origin}${semToken(url.pathname)}`.slice(0, TAMANHO_MAXIMO);
  } catch {
    return null;
  }
}

export function resumirRelatorioDeCsp(corpo: unknown): ResumoDeCsp | null {
  if (typeof corpo !== "object" || corpo === null) return null;
  const relatorio = (corpo as Record<string, unknown>)["csp-report"];
  if (typeof relatorio !== "object" || relatorio === null) return null;
  const campos = relatorio as Record<string, unknown>;

  const diretiva = texto(campos["effective-directive"]) ?? texto(campos["violated-directive"]);
  if (!diretiva) return null;

  const linha = campos["line-number"];
  return {
    pagina: endereco(campos["document-uri"]),
    diretiva,
    bloqueado: endereco(campos["blocked-uri"]),
    arquivo: endereco(campos["source-file"]),
    linha: typeof linha === "number" && Number.isFinite(linha) ? linha : null,
    modo: texto(campos.disposition),
  };
}
