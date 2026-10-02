"use client";

import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { EntrarNoPainel } from "../../../../src/telas/painel/EntrarNoPainel";

// Fora do subgrupo (guardado) de propósito: lá dentro a guarda
// redirecionaria esta tela pra ela mesma. Por isso o provedor é montado
// aqui, e não herdado do layout.
export default function Pagina() {
  return (
    <ProvedorDoPainel>
      <EntrarNoPainel />
    </ProvedorDoPainel>
  );
}
