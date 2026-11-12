// Quem fica só com a imagem parada da cadeira (home nova, marco 3). Três
// portas: esta decide antes de baixar qualquer coisa; `quadrosLentos`
// decide depois dos primeiros quadros; o contexto WebGL perdido é com a
// CadeiraViva. O que o navegador não informa não conta contra.

export type Ambiente = {
  reduzido: boolean;
  webgl2: boolean;
  economia: boolean;
  /** `navigator.deviceMemory`, em GB (só Chrome informa). */
  memoria: number | undefined;
  nucleos: number | undefined;
  /** `navigator.connection.effectiveType`. */
  conexao: string | undefined;
};

const MINIMO_DE_MEMORIA = 4;
const MINIMO_DE_NUCLEOS = 4;
const CONEXOES_LENTAS = new Set(["slow-2g", "2g"]);

export function podeTer3D(a: Ambiente): boolean {
  if (a.reduzido || !a.webgl2 || a.economia) return false;
  if (a.memoria !== undefined && a.memoria < MINIMO_DE_MEMORIA) return false;
  if (a.nucleos !== undefined && a.nucleos < MINIMO_DE_NUCLEOS) return false;
  if (a.conexao !== undefined && CONEXOES_LENTAS.has(a.conexao)) return false;
  return true;
}

/** Quantos quadros a CadeiraViva mede antes de decidir. */
export const QUADROS_MEDIDOS = 30;
/** Mediana acima disso (25 quadros por segundo) volta pra imagem. */
const QUADRO_LENTO_MS = 40;

// A mediana, não a média: o primeiro quadro compila os shaders e demora,
// e isso não diz nada sobre o aparelho.
export function quadrosLentos(duracoes: number[]): boolean {
  if (duracoes.length < QUADROS_MEDIDOS) return false;
  const ordem = [...duracoes].sort((a, b) => a - b);
  const meio = ordem.length >> 1;
  const mediana = ordem.length % 2 ? ordem[meio]! : (ordem[meio - 1]! + ordem[meio]!) / 2;
  return mediana > QUADRO_LENTO_MS;
}

type NavegadorComDicas = Navigator & {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
};

// Lê o ambiente do navegador. O WebGL2 é testado num canvas solto, que
// fica pro coletor de lixo.
export function ambienteDoNavegador(): Ambiente {
  const nav = navigator as NavegadorComDicas;
  let webgl2 = false;
  try {
    webgl2 = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    webgl2 = false;
  }
  return {
    reduzido: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    webgl2,
    economia: nav.connection?.saveData === true,
    memoria: nav.deviceMemory,
    nucleos: nav.hardwareConcurrency || undefined,
    conexao: nav.connection?.effectiveType,
  };
}
