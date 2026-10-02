import { PerfilDaBarbearia } from "../../../src/telas/PerfilDaBarbearia";

// Sem Suspense: esta é a única tela do fluxo que não lê a query.
export default function Pagina() {
  return <PerfilDaBarbearia />;
}
