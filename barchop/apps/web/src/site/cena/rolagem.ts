// A rolagem do topo da home (home nova, marco 3), como conta pura: do
// progresso do topo preso (0 = repouso, 1 = fim da névoa) pro estado da
// cena 3D e pro que o CSS do topo desenha. As faixas vêm do hero do
// protótipo (template "Pente Fino", src/motion/hero.js); as cores, do
// site: o escuro do topo e o papel das seções de baixo, pra emenda não
// mostrar faixa.

export type EstadoDaCena = {
  /** Giro da cadeira, em radianos, somado à pose de repouso. */
  giro: number;
  /** 0 = enquadramento de repouso, 1 = câmera perto. */
  zoom: number;
  /** 0 = sem névoa, 1 = a cadeira sumida no claro. */
  nevoa: number;
  poeira: number;
  chao: number;
};

export type EstadoDoTopo = {
  cena: EstadoDaCena;
  /** 0..1: o quanto "Bar" e "Chop" já se afastaram. */
  afastamento: number;
  /** Opacidade das duas metades do nome. */
  nome: number;
  /** Opacidade do feixe de luz em CSS. */
  foco: number;
  /** Opacidade do sopro da grade da agenda. */
  grade: number;
  /** A promessa, o status, o apoio e os convites saem de uma vez. */
  interfaceFora: boolean;
  fundo: string;
  /** O cabeçalho passa pro tema claro. */
  claro: boolean;
};

const ESCURO = [21, 20, 18] as const; // dark.paperFim (#151412)
const CLARO = [247, 244, 238] as const; // light.paper (#F7F4EE)

const rgb = (c: readonly number[]) => `rgb(${c.join(", ")})`;
export const COR_DO_ESCURO = rgb(ESCURO);
export const COR_DO_CLARO = rgb(CLARO);
/** A mesma cor do fim, em número, pra névoa do three. */
export const NEVOA_DO_CLARO = (CLARO[0] << 16) | (CLARO[1] << 8) | CLARO[2];

/** O giro total da rolagem: uns 45°. */
const GIRO = 0.78;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const limita = (v: number) => Math.min(1, Math.max(0, v));
const faixa = (v: number, de: number, ate: number) => limita((v - de) / (ate - de));
const suave = (t: number) => t * t * (3 - 2 * t);

export function estadoDaRolagem(progresso: number): EstadoDoTopo {
  const p = limita(progresso);
  const perto = suave(faixa(p, 0, 0.72));
  const fundo = suave(faixa(p, 0.3, 0.72));

  return {
    cena: {
      giro: GIRO * perto,
      zoom: perto,
      nevoa: suave(faixa(p, 0.3, 0.97)),
      poeira: 1 - faixa(p, 0.3, 0.55),
      chao: 1 - faixa(p, 0.34, 0.62),
    },
    afastamento: suave(faixa(p, 0, 0.42)),
    nome: 1 - faixa(p, 0.1, 0.4),
    foco: 1 - faixa(p, 0.32, 0.66),
    grade: 1 - faixa(p, 0.2, 0.45),
    interfaceFora: p > 0.02,
    fundo: rgb(ESCURO.map((c, i) => Math.round(lerp(c, CLARO[i], fundo)))),
    claro: p > 0.62,
  };
}
