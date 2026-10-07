import type { Metadata } from "next";
import { Privacidade } from "../../../src/site/Privacidade";

export const metadata: Metadata = {
  title: "Política de privacidade — BarChop",
  description: "Como o BarChop trata os dados das barbearias e dos clientes delas, pela LGPD.",
};

export default function Pagina() {
  return <Privacidade />;
}
