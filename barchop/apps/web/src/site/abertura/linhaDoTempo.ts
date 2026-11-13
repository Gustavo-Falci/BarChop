// Esboço: a linha do tempo da abertura vem no GREEN.
type Caixa = { x: number; y: number; largura: number };
export type Medidas = {
  largura: number;
  altura: number;
  celular: boolean;
  u: number;
  bar: Caixa;
  chop: Caixa;
  icone: Caixa;
};
export const DURACAO_DA_ABERTURA = 0;
export function caminhoDaNavalha(_m: Medidas): {
  pontos: { x: number; y: number; ang: number }[];
  parada: number;
  fios: string[];
} {
  return { pontos: [], parada: 0, fios: [] };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function quadroDaAbertura(_t: number, _m: Medidas): any {
  return { navalha: {}, lamina: {}, nome: { bar: {}, chop: {} }, agenda: {}, fios: {}, cabecalho: {}, interface: [] };
}
export function proximoTempo(_t: number, _dt: number, _acelerado: boolean): number {
  return 0;
}
export function podeAcelerar(_t: number): boolean {
  return false;
}
