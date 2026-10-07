import type { Metadata } from "next";
import { Termos } from "../../../src/site/Termos";

export const metadata: Metadata = {
  title: "Termos de uso — BarChop",
  description: "As regras de uso do BarChop, a agenda online para barbearias.",
};

export default function Pagina() {
  return <Termos />;
}
