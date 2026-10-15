import type { Metadata } from "next";
import { Precos } from "../../../src/site/Precos";

export const metadata: Metadata = {
  title: "Preços — BarChop",
  description:
    "Grátis com 1 profissional, ou Essencial e Completo por profissional, mensal ou anual. 14 dias com tudo liberado, sem cartão.",
};

export default function Pagina() {
  return <Precos />;
}
