import { useId, type ReactNode } from "react";
import estilos from "./Grupo.module.css";

// A Secao sem moldura: o título de seção, a frase do que o grupo faz e,
// no fim, a ação que salva só aquilo. A moldura não é dele: quem usa
// põe o próprio cartão dentro (as linhas da Jornada, a lista dos
// Serviços), e a barra de salvar fica de fora (redesenho dos detalhes,
// PR 6).
export function Grupo({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  // Opcional e, nas telas que salvam por grupo, só presente quando algo
  // mudou: um Salvar sempre à vista não diz se há o que salvar.
  acao?: ReactNode;
  children: ReactNode;
}) {
  // Região nomeada pelo título, como a Secao: quem navega por landmark
  // pula de grupo em grupo.
  const id = useId();
  return (
    <section className={estilos.grupo} aria-labelledby={id}>
      <div className={estilos.topo}>
        <h2 id={id} className={estilos.titulo}>
          {titulo}
        </h2>
        {descricao ? <p className={estilos.descricao}>{descricao}</p> : null}
      </div>
      {children}
      {acao ? <div className={estilos.acao}>{acao}</div> : null}
    </section>
  );
}
