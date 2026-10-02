import type { ReactNode } from "react";

import { LayoutDoPainel } from "../../../../src/painel/LayoutDoPainel";
import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../../src/painel/SessaoDoPainel";

// O subgrupo (guardado) não entra no caminho: este layout vale de
// /painel pra baixo, menos /painel/entrar, que fica fora dele de
// propósito — lá dentro a guarda redirecionaria a tela pra ela mesma.
export default function LayoutGuardado({ children }: { children: ReactNode }) {
  return (
    <ProvedorDoPainel>
      <SessaoDoPainel>
        <LayoutDoPainel>{children}</LayoutDoPainel>
      </SessaoDoPainel>
    </ProvedorDoPainel>
  );
}
