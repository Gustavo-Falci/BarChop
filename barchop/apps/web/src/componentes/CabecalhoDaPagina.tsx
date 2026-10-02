import type { ReactNode } from "react";
import estilos from "./CabecalhoDaPagina.module.css";

// Título da tela e a ação principal dela, na mesma linha e separados do
// conteúdo por uma régua. Substitui o `.topo` que Clientes e Serviços
// declaravam cada um no seu CSS, e dá às outras telas o cabeçalho que
// elas não tinham.
export function CabecalhoDaPagina({
  titulo,
  apoio,
  acao,
}: {
  titulo: string;
  // Uma linha de contexto sob o título — a data por extenso na agenda,
  // a contagem numa lista. Opcional porque nem toda tela tem o que
  // dizer aqui, e um subtítulo inventado é pior que nenhum.
  apoio?: ReactNode;
  acao?: ReactNode;
}) {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.textos}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {apoio ? <p className={estilos.apoio}>{apoio}</p> : null}
      </div>
      {acao ? <div className={estilos.acao}>{acao}</div> : null}
    </header>
  );
}
