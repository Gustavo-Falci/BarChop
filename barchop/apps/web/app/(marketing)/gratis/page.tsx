import type { Metadata } from "next";
import { Gratis } from "../../../src/site/Gratis";

export const metadata: Metadata = {
  title: "BarChop Grátis — agenda online para quem trabalha sozinho",
  description:
    "Agenda online, link de agendamento e lembrete por e-mail, grátis para sempre com 1 profissional. Comece com 14 dias de tudo liberado.",
};

export default function Pagina() {
  return <Gratis />;
}
