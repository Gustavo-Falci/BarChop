import type { ReactNode } from "react";
import { VIGENCIA } from "./controlador";
import estilos from "./DocumentoLegal.module.css";

export interface ItemDoSumario {
  id: string;
  titulo: string;
}

// A moldura dos textos longos do site (termos, privacidade): título,
// aviso de rascunho, data de vigência e as seções com h2 — o leitor de
// tela navega por elas. No desktop, o sumário fixo à esquerda e o texto
// à direita (as telas usam a largura — pedido do dono); o texto mantém
// a coluna de leitura.
export function DocumentoLegal({
  titulo,
  sumario,
  children,
}: {
  titulo: string;
  sumario: ItemDoSumario[];
  children: ReactNode;
}) {
  return (
    <main className={estilos.documento}>
      <div className={estilos.cabeca}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        <p className={estilos.aviso}>
          Texto em revisão jurídica. Pode mudar antes da versão final; quando mudar, avisamos no painel.
        </p>
        <p className={estilos.vigencia}>Vigente desde {VIGENCIA}.</p>
      </div>
      <nav aria-label="Nesta página" className={estilos.sumario}>
        <ol>
          {sumario.map((item) => (
            <li key={item.id}>
              <a href={`#${item.id}`}>{item.titulo}</a>
            </li>
          ))}
        </ol>
      </nav>
      <div className={estilos.texto}>{children}</div>
    </main>
  );
}

// Uma seção do documento, nomeada pelo título pra virar região.
export function SecaoLegal({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={estilos.secao}>
      <h2 id={id} className={estilos.subtitulo}>
        {titulo}
      </h2>
      {children}
    </section>
  );
}
