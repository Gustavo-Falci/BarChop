"use client";

import { Suspense } from "react";
import { ProvedorDoPainel } from "../../../../src/painel/ProvedorDoPainel";
import { AceitarConvite } from "../../../../src/telas/painel/AceitarConvite";

// Fora do subgrupo (guardado), como /painel/entrar: o convidado ainda
// não tem sessão, e a guarda o mandaria pro login. Suspense porque a
// tela lê o `?email=` do link com useSearchParams, que exige o limite
// pra rota ser pré-renderizada.
export default function Pagina() {
  return (
    <ProvedorDoPainel>
      <Suspense fallback={<p>Carregando…</p>}>
        <AceitarConvite />
      </Suspense>
    </ProvedorDoPainel>
  );
}
