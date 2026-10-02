import { Suspense } from "react";
import { Confirmacao } from "../../../../../src/telas/Confirmacao";

export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Confirmacao />
    </Suspense>
  );
}
