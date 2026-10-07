import type { ReactNode } from "react";

import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { SessaoDoPainel } from "../../../../src/painel/SessaoDoPainel";

// O cartaz fica fora do (guardado) pra não herdar a barra do painel —
// na impressão sai só ele. A guarda da sessão vem igual.
export default function LayoutDoCartaz({ children }: { children: ReactNode }) {
  return (
    <ProvedorDoPainel>
      <SessaoDoPainel>{children}</SessaoDoPainel>
    </ProvedorDoPainel>
  );
}
