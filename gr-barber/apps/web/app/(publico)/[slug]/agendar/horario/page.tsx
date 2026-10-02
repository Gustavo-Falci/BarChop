import { redirecionarRotaAntiga } from "../../../../../src/fluxo/rotaAntiga";

// Dia e horário viraram uma tela só, em /agendar/data. Ver rotaAntiga.
export default function Pagina(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return redirecionarRotaAntiga("data", props);
}
