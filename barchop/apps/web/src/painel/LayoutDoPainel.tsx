import type { ReactNode } from "react";

import { NavegacaoDoPainel } from "./NavegacaoDoPainel";
import estilos from "./NavegacaoDoPainel.module.css";

// O shell do painel: barra lateral e área de conteúdo. Mora aqui, e não
// no layout da rota, porque precisa estar dentro do SessaoDoPainel — a
// barra lê `slug` e `sair` do usePainel(), que só existe lá dentro.
//
// O container que centra o conteúdo é deste shell, e não de cada tela:
// as doze telas repetiam `.pagina { max-width: 720px }` sem
// `margin-inline: auto`, e o resultado era tudo encostado na borda
// esquerda com o resto da janela vazio.
export function LayoutDoPainel({ children }: { children: ReactNode }) {
  return (
    <div className={estilos.shell}>
      <NavegacaoDoPainel />
      <main className={estilos.conteudo}>
        <div className={estilos.container}>{children}</div>
      </main>
    </div>
  );
}
