import { Suspense } from "react";
import { EscolhaDoProfissional } from "../../../../../src/telas/EscolhaDoProfissional";

// O Suspense é exigência do Next 16: a tela lê useSearchParams (via
// usePassoDoFluxo), e a rota pré-renderizada precisa de um limite acima.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <EscolhaDoProfissional />
    </Suspense>
  );
}
