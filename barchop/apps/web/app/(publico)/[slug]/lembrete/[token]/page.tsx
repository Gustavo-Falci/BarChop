import type { Metadata } from "next";
import { ConfirmarOuCancelar } from "../../../../../src/telas/ConfirmarOuCancelar";

// O token do link do lembrete está na URL, e ele confirma ou cancela um
// horário. `no-referrer`: a URL não sai no cabeçalho Referer pra nenhum
// recurso de fora (fonte, o Instagram da barbearia). `noindex`: um
// buscador que achasse o link não o guarda. O título continua vindo do
// layout — a mescla de metadata do Next é rasa, chave por chave.
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

// Sem Suspense: a tela lê o token pelo `useParams`, não pela query.
export default function Pagina() {
  return <ConfirmarOuCancelar />;
}
