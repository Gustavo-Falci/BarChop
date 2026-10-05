"use client";

import { ProvedorDoSuporte } from "../../../../src/suporte/ProvedorDoSuporte";
import { FilaDoSuporte } from "../../../../src/telas/suporte/FilaDoSuporte";

// Fora do (guardado): a guarda do painel pede a sessão do barbeiro, e
// esta área é do suporte da plataforma (Onda 1, F4d). A guarda dela
// mora na própria tela.
export default function Pagina() {
  return (
    <ProvedorDoSuporte>
      <FilaDoSuporte />
    </ProvedorDoSuporte>
  );
}
