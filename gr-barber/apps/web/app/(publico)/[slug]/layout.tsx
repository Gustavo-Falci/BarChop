import type { ReactNode } from "react";
import { ProvedorDaApi } from "../../../src/api/ProvedorDaApi";
import { BarraDaBarbearia } from "../../../src/fluxo/BarraDaBarbearia";

// Server component: quem lê o slug é o provider, do lado do cliente,
// com useParams. Assim o `params` (que aqui seria uma Promise) não
// precisa ser aguardado só pra ser repassado.
//
// A barra da barbearia mora aqui, e não em cada tela, pelo mesmo motivo
// do shell do painel: identidade por repetição depende de ninguém
// esquecer, e quem esquecesse publicaria mais uma tela sem dizer de
// quem ela é. No layout ela também não remonta a cada passo do
// agendamento — o App Router preserva o layout entre as rotas filhas,
// então o nome é buscado uma vez por visita.
export default function LayoutDaBarbearia({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <ProvedorDaApi>
      <BarraDaBarbearia />
      {children}
    </ProvedorDaApi>
  );
}
