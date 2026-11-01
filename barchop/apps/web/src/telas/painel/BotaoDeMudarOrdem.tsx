"use client";

import { Botao } from "../../componentes/Botao";
import { IconeOrdem } from "../../painel/icones";
import estilos from "./BotaoDeMudarOrdem.module.css";

// O "Mudar ordem" de Serviços e Equipe (redesenho do celular, PR 5): logo
// acima da lista que ele ordena, à direita, no mesmo lugar nas duas
// telas. No cabeçalho, era um segundo botão ao lado do principal; na
// Equipe os dois juntos não cabiam em 360px e alargavam a página.
export function BotaoDeMudarOrdem({ onClick }: { onClick: () => void }) {
  return (
    <div className={estilos.lugar}>
      <Botao variante="fantasma" onClick={onClick}>
        <IconeOrdem />
        Mudar ordem
      </Botao>
    </div>
  );
}
