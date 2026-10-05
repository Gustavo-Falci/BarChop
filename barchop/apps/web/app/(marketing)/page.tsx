import type { Metadata } from "next";
import { Home } from "../../src/site/Home";

export const metadata: Metadata = {
  title: "BarChop — agenda online para barbearias",
  description:
    "O cliente agenda pelo link da sua barbearia, escolhe o profissional e recebe lembrete. Grátis durante o lançamento.",
};

export default function Pagina() {
  return <Home />;
}
