import type { ReactNode } from "react";

import { EntradaDaTela } from "../movimento/EntradaDaTela";
import { MovimentoDoPainel } from "../movimento/ProvedorDeMovimento";
import { BarraDoTopo } from "./BarraDoTopo";
import { FaixaDaAssinatura } from "./FaixaDaAssinatura";
import { NavegacaoDoPainel } from "./NavegacaoDoPainel";
import { ProvedorDaAssinatura } from "./ProvedorDaAssinatura";
import estilos from "./NavegacaoDoPainel.module.css";

// O shell do painel: barra lateral e área de conteúdo. Mora aqui, e não
// no layout da rota, porque precisa estar dentro do SessaoDoPainel — a
// barra lê `slug` e `sair` do usePainel(), que só existe lá dentro.
//
// O container que centra o conteúdo é deste shell, e não de cada tela:
// as doze telas repetiam `.pagina { max-width: 720px }` sem
// `margin-inline: auto`, e o resultado era tudo encostado na borda
// esquerda com o resto da janela vazio.
//
// A assinatura é lida aqui uma vez: a faixa, o menu da conta e a tela
// do plano mostram a mesma. O MovimentoDoPainel traz as animações de
// layout (o indicador que desliza), que só o painel usa.
export function LayoutDoPainel({ children }: { children: ReactNode }) {
  return (
    <ProvedorDaAssinatura>
      <MovimentoDoPainel>
        <div className={estilos.shell}>
          <NavegacaoDoPainel />
          {/* Barra de topo e conteúdo numa coluna só: a barra (com a
              faixa da assinatura embaixo dela) fica parada e quem rola é
              o <main>. */}
          <div className={estilos.coluna}>
            <div>
              <BarraDoTopo />
              <FaixaDaAssinatura />
            </div>
            <main className={estilos.conteudo}>
              <EntradaDaTela className={estilos.container}>{children}</EntradaDaTela>
            </main>
          </div>
        </div>
      </MovimentoDoPainel>
    </ProvedorDaAssinatura>
  );
}
