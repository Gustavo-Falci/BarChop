import { Suspense } from "react";
import { PlanosDaBarbearia } from "../../../../src/telas/PlanosDaBarbearia";

// Com Suspense porque a tela lê `?plano=` (quem voltou do login cai no
// plano que escolheu), e isso é `useSearchParams`.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <PlanosDaBarbearia />
    </Suspense>
  );
}
