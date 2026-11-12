"use client";

import { ProvedorDoSuporte } from "../../../../../src/suporte/ProvedorDoSuporte";
import { NumerosDoSuporte } from "../../../../../src/telas/suporte/NumerosDoSuporte";

// Fora do (guardado), como a fila e os avisos: a sessão aqui é a do
// suporte, e a guarda mora na própria tela.
export default function Pagina() {
  return (
    <ProvedorDoSuporte>
      <NumerosDoSuporte />
    </ProvedorDoSuporte>
  );
}
