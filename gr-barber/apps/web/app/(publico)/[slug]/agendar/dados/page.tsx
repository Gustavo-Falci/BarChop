import { redirecionarRotaAntiga } from "../../../../../src/fluxo/rotaAntiga";

// Identificação entrou na confirmação, em /agendar/confirmar. Ver
// rotaAntiga.
export default function Pagina(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirecionarRotaAntiga("confirmar", props);
}
