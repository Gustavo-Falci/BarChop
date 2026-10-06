import type { ReactNode } from "react";
import estilos from "./Vazio.module.css";

// Tela sem conteúdo com o que dizer e o que fazer, em vez de uma linha
// de texto solta no canto. A `mensagem` continua sendo exatamente a
// frase que já existia em cada tela — o que muda é o que está em volta,
// não a palavra.
export function Vazio({
  mensagem,
  dica,
  acao,
  icone,
}: {
  mensagem: string;
  // O passo seguinte, em uma frase. Sem isto o estado vazio informa mas
  // não orienta, que é a metade que costuma faltar.
  dica?: ReactNode;
  acao?: ReactNode;
  // Um dos `Icone*` do painel, num círculo acima da frase. Escondido do
  // leitor de tela: ilustra a mensagem, não acrescenta nada a ela.
  icone?: ReactNode;
}) {
  return (
    <div className={estilos.vazio}>
      {icone ? (
        <span className={estilos.icone} aria-hidden="true">
          {icone}
        </span>
      ) : null}
      <p className={estilos.mensagem}>{mensagem}</p>
      {dica ? <p className={estilos.dica}>{dica}</p> : null}
      {acao}
    </div>
  );
}
