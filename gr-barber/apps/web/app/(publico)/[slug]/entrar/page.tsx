import { Suspense } from "react";
import { Entrar } from "../../../../src/telas/Entrar";

// Com Suspense desde que a tela passou a ler `?voltar=`: quem chega
// pelo passo "quem é você" do agendamento volta pro mesmo ponto do
// fluxo depois de entrar, e isso é `useSearchParams`, que exige o
// limite de Suspense.
export default function Pagina() {
  return (
    <Suspense fallback={<p>Carregando…</p>}>
      <Entrar />
    </Suspense>
  );
}
