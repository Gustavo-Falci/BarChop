"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { entradaDoItem, usePrimeiraCarga } from "../movimento/lista";
import { useMidia } from "../painel/useTelaDeCelular";
import { Vazio } from "./Vazio";
import estilos from "./Tabela.module.css";

export interface Linha {
  id: string;
  celulas: ReactNode[];
  // A linha continua listada, mas o que ela representa está fora de
  // serviço — o serviço desativado, que some do agendamento do cliente.
  // Mora aqui e não numa célula porque é propriedade da LINHA: um chip
  // na última coluna anuncia isso a meia tabela de distância do nome
  // que qualifica.
  atenuada?: boolean;
  // A linha no celular (redesenho, PR 6), dita pela tela: o nome continua
  // sendo `celulas[0]` (o botão que abre); o `detalhe` vai embaixo dele,
  // o `valor` à direita e as `acoes` no item, fora do botão. Com isto em
  // TODAS as linhas, a tabela vira lista até 640px, no lugar do cartão
  // "Rótulo: valor". A tela é que garante que nada do desktop se perde.
  noCelular?: {
    // Uma lista vira partes separadas por " · ", e cada parte só quebra
    // por dentro quando não cabe sozinha numa linha: o telefone não se
    // parte no hífen, nem "último agendamento" no meio.
    detalhe?: ReactNode | ReactNode[];
    valor?: ReactNode;
    acoes?: ReactNode;
  };
}

// O mesmo corte em que a tabela vira cartão (Tabela.module.css): entre
// 641 e 900px nada muda, a tabela larga continua.
export const CONSULTA_DA_LISTA_NO_CELULAR = "(max-width: 640px)";

// Um bloco de linhas com título — a categoria, na lista de serviços.
// O `resumo` é a linha de apoio ao lado do título ("2 serviços · R$ 40
// a R$ 60").
export interface Grupo {
  id: string;
  titulo: string;
  resumo?: ReactNode;
  linhas: Linha[];
}

// Alinhamento por coluna, na ordem do cabeçalho. Vale pro `th` e pro
// `td` juntos de propósito: cabeçalho à esquerda sobre número à direita
// é o tipo de desalinhamento que parece defeito.
export type Alinhamento = "inicio" | "fim";

export function Tabela({
  cabecalho,
  linhas,
  grupos,
  aoAbrir,
  vazio,
  dicaVazio,
  acaoVazio,
  larguras,
  alinhamentos,
}: {
  cabecalho: string[];
  // `linhas` OU `grupos`. Com grupos, cada um vira um <tbody> com o
  // título na primeira linha — é o que liga a linha ao grupo pra quem
  // navega a tabela pelo leitor de tela. Grupo sem linha não aparece.
  linhas?: Linha[];
  grupos?: Grupo[];
  aoAbrir?: (id: string) => void;
  vazio: string;
  // A tabela vazia era um <p> solto. O texto continua o mesmo; o que
  // ela ganha é a moldura e — quando a tela sabe qual é — a saída.
  dicaVazio?: ReactNode;
  acaoVazio?: ReactNode;
  // Uma largura por coluna, na ordem do cabeçalho. Sem elas o navegador
  // reparte pelo conteúdo, e numa tela larga a última coluna ganha todo
  // o excesso: o texto fica encostado na esquerda dela e sobram
  // centenas de pixels vazios à direita da tabela.
  larguras?: string[];
  // Mesma gramática de `larguras`: um valor por coluna, na ordem do
  // cabeçalho. Ausente, tudo fica no padrão da casa (à esquerda).
  alinhamentos?: Alinhamento[];
}) {
  // Uma classe só por coluna, calculada uma vez e usada no cabeçalho e
  // em cada linha — `td` e `th` da mesma coluna não têm como divergir.
  const classeDaColuna = (indice: number) =>
    alinhamentos?.[indice] === "fim" ? estilos.fim : undefined;

  // Sem grupos, a lista inteira é um bloco só, sem título.
  // A primeira carga entra escalonada (os seis primeiros, motion PR 4).
  // Depois, a linha que aparece num filtro não anima, e nenhuma usa
  // `layout`: com cem clientes, medir cada linha a cada mudança pesaria.
  const primeiraCarga = usePrimeiraCarga();
  const celular = useMidia(CONSULTA_DA_LISTA_NO_CELULAR);
  const blocos: (Partial<Grupo> & { linhas: Linha[] })[] = grupos
    ? grupos.filter((grupo) => grupo.linhas.length > 0)
    : [{ linhas: linhas ?? [] }];

  if (blocos.every((bloco) => bloco.linhas.length === 0)) {
    return <Vazio mensagem={vazio} dica={dicaVazio} acao={acaoVazio} />;
  }

  // O índice corre pela tabela inteira, atravessando os grupos: o
  // escalonamento é de cima pra baixo, não recomeça a cada categoria.
  let indiceDaLinha = 0;

  if (celular && blocos.every((bloco) => bloco.linhas.every((linha) => linha.noCelular))) {
    return (
      <div className={estilos.listaNoCelular}>
        {blocos.map((bloco, indice) => (
          <div key={bloco.id ?? indice} className={estilos.blocoNoCelular}>
            {bloco.titulo ? (
              <h2 className={estilos.tituloDoBloco}>
                {bloco.titulo}
                {bloco.resumo ? <span className={estilos.resumo}>{bloco.resumo}</span> : null}
              </h2>
            ) : null}
            <ul className={estilos.itens} aria-label={bloco.titulo}>
              {bloco.linhas.map((linha) => {
                const { detalhe, valor, acoes } = linha.noCelular!;
                return (
                  // O item inteiro abre, como a linha da tabela; o botão
                  // do nome é o que dá foco, Enter e nome acessível. O
                  // nome acessível é só o nome: o detalhe fica fora dele.
                  <m.li
                    key={linha.id}
                    {...entradaDoItem(indiceDaLinha++, { primeiraCarga })}
                    className={`${estilos.item}${aoAbrir ? ` ${estilos.clicavel}` : ""}`}
                    data-atenuada={linha.atenuada ? "" : undefined}
                    onClick={aoAbrir ? () => aoAbrir(linha.id) : undefined}
                  >
                    <div className={estilos.principal}>
                      {aoAbrir ? (
                        <button
                          type="button"
                          className={estilos.nomeDoItem}
                          onClick={(evento) => {
                            evento.stopPropagation();
                            aoAbrir(linha.id);
                          }}
                        >
                          {linha.celulas[0]}
                        </button>
                      ) : (
                        <span className={estilos.nomeDoItem}>{linha.celulas[0]}</span>
                      )}
                      {detalhe ? (
                        <span className={estilos.detalheDoItem}>
                          {Array.isArray(detalhe)
                            ? detalhe.map((parte, indice) => (
                                <span key={indice}>
                                  {indice > 0 ? " · " : null}
                                  <span className={estilos.parteDoDetalhe}>{parte}</span>
                                </span>
                              ))
                            : detalhe}
                        </span>
                      ) : null}
                    </div>
                    {valor || acoes ? (
                      <div className={estilos.lateral}>
                        {valor ? <span className={estilos.valorDoItem}>{valor}</span> : null}
                        {acoes}
                      </div>
                    ) : null}
                  </m.li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  function desenharLinha(linha: Linha) {
    const indice = indiceDaLinha++;
    return (
      // A linha inteira abre, porque é a linha inteira que o CSS
      // acende no hover — realçar sete colunas e aceitar clique em
      // uma só é prometer um alvo que não existe.
      <m.tr
        key={linha.id}
        {...entradaDoItem(indice, { primeiraCarga })}
        className={
          [aoAbrir ? estilos.clicavel : "", linha.atenuada ? estilos.atenuada : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
        onClick={aoAbrir ? () => aoAbrir(linha.id) : undefined}
      >
        {linha.celulas.map((celula, indice) => (
          // O nome da coluna vai junto da célula: no celular a linha vira
          // cartão, e o CSS escreve o rótulo antes do valor.
          <td key={indice} className={classeDaColuna(indice)} data-rotulo={cabecalho[indice] || undefined}>
            {/* O botão continua na primeira célula, e não some com
              a linha clicável: <tr> com onClick não chega pelo
              teclado, e é ele que dá foco, Enter e nome acessível.
              `stopPropagation` para o clique no nome não contar
              duas vezes — a dele e a da linha. */}
            {indice === 0 && aoAbrir ? (
              <button
                type="button"
                onClick={(evento) => {
                  evento.stopPropagation();
                  aoAbrir(linha.id);
                }}
              >
                {celula}
              </button>
            ) : (
              celula
            )}
          </td>
        ))}
      </m.tr>
    );
  }

  return (
    <div className={estilos.moldura}>
      <table className={estilos.tabela}>
        {larguras ? (
          <colgroup>
            {larguras.map((largura, indice) => (
              <col key={indice} style={{ width: largura }} />
            ))}
          </colgroup>
        ) : null}
        <thead>
          <tr>
            {cabecalho.map((titulo, indice) => (
              <th key={titulo} className={classeDaColuna(indice)}>
                {titulo}
              </th>
            ))}
          </tr>
        </thead>
        {blocos.map((bloco, indice) => (
          <tbody key={bloco.id ?? indice}>
            {bloco.titulo ? (
              <tr className={estilos.linhaDoGrupo}>
                <th scope="rowgroup" colSpan={cabecalho.length} className={estilos.grupo}>
                  {bloco.titulo}
                  {bloco.resumo ? <span className={estilos.resumo}>{bloco.resumo}</span> : null}
                </th>
              </tr>
            ) : null}
            {bloco.linhas.map(desenharLinha)}
          </tbody>
        ))}
      </table>
    </div>
  );
}
