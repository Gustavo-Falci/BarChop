import { Suspense } from "react";
import { MinhaConta } from "../../../../src/telas/MinhaConta";

// Com Suspense desde que a tela lê a volta da InfinitePay na query
// (`order_nsu`, `transaction_nsu`, `slug`): `useSearchParams` exige o
// limite, senão o build recusa.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <MinhaConta />
    </Suspense>
  );
}
