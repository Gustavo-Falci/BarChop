"use client";

import { ProvedorDoSuporte } from "../../../../../src/suporte/ProvedorDoSuporte";
import { AvisosDoSuporte } from "../../../../../src/telas/suporte/AvisosDoSuporte";

// Fora do (guardado), como a fila: a sessão aqui é a do suporte, e a
// guarda mora na própria tela.
export default function Pagina() {
  return (
    <ProvedorDoSuporte>
      <AvisosDoSuporte />
    </ProvedorDoSuporte>
  );
}
