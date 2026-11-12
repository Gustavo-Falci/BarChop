// A rolagem do topo da home (home nova, marco 3), como conta pura: do
// progresso do topo preso (0 = repouso, 1 = fim da névoa) pro estado da
// cena 3D e pro que o CSS do topo desenha. As faixas vêm do hero do
// protótipo (template "Pente Fino", src/motion/hero.js). O fundo não é
// pintado de papel: a camada escura do topo some e deixa ver o degradê do
// próprio site, o mesmo das seções de baixo, e a emenda não mostra faixa.

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
  /** Opacidade da camada escura do topo (1 = escuro, 0 = o papel do site). */
  escuro: number;
  /** O cabeçalho passa pro tema claro. */
  claro: boolean;
};

/** A cor em que a névoa do 3D termina: light.paper (#F7F4EE). */
export const NEVOA_DO_CLARO = 0xf7f4ee;

/** O giro total da rolagem: uns 45°. */
const GIRO = 0.78;

const limita = (v: number) => Math.min(1, Math.max(0, v));
const faixa = (v: number, de: number, ate: number) => limita((v - de) / (ate - de));
const suave = (t: number) => t * t * (3 - 2 * t);

export function estadoDaRolagem(progresso: number): EstadoDoTopo {
  const p = limita(progresso);
  const perto = suave(faixa(p, 0, 0.72));

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
    escuro: 1 - suave(faixa(p, 0.3, 0.72)),
    claro: p > 0.62,
  };
}
