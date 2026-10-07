import type { Metadata } from "next";
import { Home } from "../../src/site/Home";

const TITULO = "BarChop — agenda online para barbearias";
const DESCRICAO =
  "O cliente agenda pelo link da sua barbearia, escolhe o profissional e recebe lembrete. Grátis durante o lançamento.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  // A prévia de quem cola barchop.com.br no WhatsApp. O endereço
  // relativo vira inteiro pelo metadataBase do layout do site.
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "BarChop",
    url: "/",
    title: TITULO,
    description: DESCRICAO,
  },
};

export default function Pagina() {
  return <Home />;
}
