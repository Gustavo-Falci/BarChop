import type { ReactNode } from "react";
import { VIGENCIA } from "./controlador";
import estilos from "./DocumentoLegal.module.css";

// A moldura dos textos longos do site (termos, privacidade): título,
// aviso de rascunho, data de vigência e as seções com h2 — o leitor de
// tela navega por elas. Coluna de leitura estreita: é texto corrido.
export function DocumentoLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className={estilos.documento}>
      <h1 className={estilos.titulo}>{titulo}</h1>
      <p className={estilos.aviso}>
        Texto em revisão jurídica. Pode mudar antes da versão final; quando mudar, avisamos no painel.
      </p>
      <p className={estilos.vigencia}>Vigente desde {VIGENCIA}.</p>
      {children}
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
