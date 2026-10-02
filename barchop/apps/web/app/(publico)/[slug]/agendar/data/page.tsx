import { Suspense } from "react";
import { EscolhaDaData } from "../../../../../src/telas/EscolhaDaData";

// O Suspense é exigência do Next 16: quem lê useSearchParams numa rota
// pré-renderizada precisa de um limite acima, senão o build recusa.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <EscolhaDaData />
    </Suspense>
  );
}
