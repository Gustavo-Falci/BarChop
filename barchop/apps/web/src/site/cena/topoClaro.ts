// O aviso do topo da home pro cabeçalho (home nova, marco 3): com a cena
// 3D presa na rolagem, o topo fica debaixo do cabeçalho até a névoa
// acabar, então é o topo que diz quando já clareou. Evento no document,
// com `detail` true (claro) ou false (escuro de novo).
export const TOPO_CLARO = "barchop:topo-claro";

export function avisarTopoClaro(claro: boolean) {
  document.dispatchEvent(new CustomEvent<boolean>(TOPO_CLARO, { detail: claro }));
}
