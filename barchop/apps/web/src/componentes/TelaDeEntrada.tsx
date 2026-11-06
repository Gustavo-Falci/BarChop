import type { ReactNode } from "react";
import estilos from "./TelaDeEntrada.module.css";

type Props = {
  titulo: string;
  apoio?: ReactNode;
  // Nome da área depois da marca ("Suporte"), quando não é o painel.
  area?: string;
  // O caminho de volta, acima do título: um botão (troca de modo) ou um
  // link (outra tela). Quem chama monta, porque só ele sabe qual dos dois.
  voltar?: ReactNode;
  children: ReactNode;
};

// O formato único das telas de entrada (onda C): a barra do BarChop no
// topo e o título em cima, com o formulário embaixo. Vale para Entrar,
// Recuperar, Convite, Cadastro e Entrar no suporte. No computador a
// barra some: a metade escura com a marca já faz esse papel.
export function TelaDeEntrada({ titulo, apoio, area, voltar, children }: Props) {
  return (
    <div className={estilos.tela}>
      <BarraDaEntrada area={area} />

      <main className={estilos.pagina}>
        {voltar}
        <div className={estilos.cabecalho}>
          <h1>{titulo}</h1>
          {apoio ? <p className={estilos.apoio}>{apoio}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}

// A barra sozinha, pra tela de entrada que tem a própria página (o
// cadastro, com a promessa ao lado do formulário no computador). O
// suporte também usa: com uma ação no fim (Sair) e visível no computador,
// onde não há a metade escura das entradas.
export function BarraDaEntrada({
  area,
  acao,
  sempreVisivel = false,
}: {
  area?: string;
  acao?: ReactNode;
  sempreVisivel?: boolean;
}) {
  return (
    <header className={sempreVisivel ? `${estilos.barra} ${estilos.sempreVisivel}` : estilos.barra}>
      <span className={estilos.marca} aria-hidden="true">
        B
      </span>
      <span className={estilos.nome}>BarChop</span>
      {area ? <span className={estilos.area}>· {area}</span> : null}
      {acao ? <span className={estilos.acaoDaBarra}>{acao}</span> : null}
    </header>
  );
}

// A casca sem a barra e sem a página: só o fundo de altura inteira, pra
// quem usa a BarraDaEntrada com a página dele.
export const classeDaTelaDeEntrada = estilos.tela;
