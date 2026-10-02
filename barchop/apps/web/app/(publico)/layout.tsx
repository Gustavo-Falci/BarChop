import type { ReactNode } from "react";

// O fluxo do cliente é sempre claro, mesmo com o sistema em escuro: é
// uma página que chega por link de WhatsApp pra quem não conhece o
// produto. Quem trava isso é o script de tema do layout raiz, que
// escreve data-theme="light" no <html> em toda rota fora de /painel —
// a <div data-theme> que ficava aqui era inerte, porque o body lê as
// custom properties do :root e não as de uma div.
export default function LayoutPublico({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
