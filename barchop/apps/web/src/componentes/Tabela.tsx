import type { ReactNode } from "react";
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
}

// Alinhamento por coluna, na ordem do cabeçalho. Vale pro `th` e pro
// `td` juntos de propósito: cabeçalho à esquerda sobre número à direita
// é o tipo de desalinhamento que parece defeito.
export type Alinhamento = "inicio" | "fim";

export function Tabela({
  cabecalho,
  linhas,
  aoAbrir,
  vazio,
  dicaVazio,
  acaoVazio,
  larguras,
  alinhamentos,
}: {
  cabecalho: string[];
  linhas: Linha[];
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

  if (linhas.length === 0) {
    return <Vazio mensagem={vazio} dica={dicaVazio} acao={acaoVazio} />;
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
        <tbody>
          {linhas.map((linha) => (
            // A linha inteira abre, porque é a linha inteira que o CSS
            // acende no hover — realçar sete colunas e aceitar clique em
            // uma só é prometer um alvo que não existe.
            <tr
              key={linha.id}
              className={
                [
                  aoAbrir ? estilos.clicavel : "",
                  linha.atenuada ? estilos.atenuada : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onClick={aoAbrir ? () => aoAbrir(linha.id) : undefined}
            >
              {linha.celulas.map((celula, indice) => (
                <td key={indice} className={classeDaColuna(indice)}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
