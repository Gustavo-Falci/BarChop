import type { ReactNode } from "react";
import Link from "next/link";
import estilos from "./CabecalhoDaPagina.module.css";

// Título da tela e a ação principal dela, na mesma linha e separados do
// conteúdo por uma régua. Substitui o `.topo` que Clientes e Serviços
// declaravam cada um no seu CSS, e dá às outras telas o cabeçalho que
// elas não tinham.
export function CabecalhoDaPagina({
  titulo,
  apoio,
  acao,
  selo,
  voltar,
}: {
  titulo: string;
  // Uma linha de contexto sob o título — a data por extenso na agenda,
  // a contagem numa lista. Opcional porque nem toda tela tem o que
  // dizer aqui, e um subtítulo inventado é pior que nenhum.
  apoio?: ReactNode;
  acao?: ReactNode;
  // O estado da tela ("Configurado", "Faltando") ao lado do título —
  // um <Chip tamanho="pequeno">. Fica FORA do <h1>: dentro, o leitor de
  // tela leria o selo como parte do nome da tela.
  selo?: ReactNode;
  // A tela de cima, pras subtelas (Horários volta pra Configurações).
  // Sem ele, o único caminho de volta era a barra lateral.
  voltar?: { href: string; rotulo: string };
}) {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.textos}>
        {voltar ? (
          <Link href={voltar.href} className={estilos.voltar}>
            <span aria-hidden="true">← </span>
            {voltar.rotulo}
          </Link>
        ) : null}
        <div className={estilos.linhaDoTitulo}>
          <h1 className={estilos.titulo}>{titulo}</h1>
          {selo}
        </div>
        {apoio ? <p className={estilos.apoio}>{apoio}</p> : null}
      </div>
      {acao ? <div className={estilos.acao}>{acao}</div> : null}
    </header>
  );
}
