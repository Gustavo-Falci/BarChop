"use client";

import type { CategoriaDeServico } from "@barchop/formato";
import type { MembroDaEquipe, ServicoSerializado } from "@barchop/types";
import { Botao } from "../../componentes/Botao";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { ListaReordenavel } from "../../componentes/ListaReordenavel";
import { MiniaturaDoServico } from "../../componentes/MiniaturaDoServico";
import { agruparPorCategoria, ordemDosServicos, primeirosEResto, SEM_CATEGORIA } from "../../painel/listas";
import estilos from "./MudarOrdem.module.css";

// O modo "Mudar ordem" de Serviços e Equipe (arrastar e reordenar, PR 4;
// ADR-0011). Troca a tabela pelas listas de arrastar em vez de pôr a
// alça nela: a tabela tem filtro e busca, e a ordem é a da página
// inteira — arrastar dentro de um filtro mexeria em quem não está à
// vista. Aqui entra só quem aparece na página; o resto vai pro fim.
//
// Salva ao soltar (a ListaReordenavel é otimista e desfaz se der erro);
// "Pronto" só volta pra tabela.

function Faixa({ aoTerminar }: { aoTerminar: () => void }) {
  return (
    <div className={estilos.faixa}>
      <p className={estilos.dica}>
        <strong>É a ordem da sua página.</strong> Arraste pela alça ⋮⋮, ou foque nela e use espaço e as
        setas. Salva ao soltar.
      </p>
      <Botao onClick={aoTerminar}>Pronto</Botao>
    </div>
  );
}

export function OrdemDosServicos({
  servicos,
  ordemCategorias,
  aoSalvarServicos,
  aoSalvarCategorias,
  aoTerminar,
}: {
  // Todos, inativos inclusive: a API pede a lista inteira.
  servicos: ServicoSerializado[];
  ordemCategorias: readonly string[];
  aoSalvarServicos: (ids: string[]) => Promise<void>;
  aoSalvarCategorias: (categorias: CategoriaDeServico[]) => Promise<void>;
  aoTerminar: () => void;
}) {
  const grupos = agruparPorCategoria(
    servicos.filter((servico) => servico.ativo),
    ordemCategorias
  );
  // As categorias com serviço na página; "Sem categoria" fica sempre no
  // fim e não entra.
  const categorias = grupos
    .filter((grupo) => grupo.id !== "sem-categoria")
    .map((grupo) => ({ id: grupo.id.replace("categoria:", "") as CategoriaDeServico, titulo: grupo.titulo }));

  return (
    <div className={estilos.ordem}>
      <Faixa aoTerminar={aoTerminar} />
      <div className={estilos.servicos}>
        {categorias.length > 1 ? (
          <section className={estilos.coluna} aria-labelledby="ordem-das-categorias">
            <h2 id="ordem-das-categorias" className={estilos.titulo}>
              Categorias
            </h2>
            <ListaReordenavel
              itens={categorias}
              nomeDaLista="Categorias"
              rotulo={(categoria) => categoria.titulo}
              // As vazias seguem na ordem salva, depois das com serviço.
              aoReordenar={(ids) =>
                aoSalvarCategorias(primeirosEResto(ids, ordemCategorias) as CategoriaDeServico[])
              }
              renderizar={(categoria, alca) => (
                <div className={estilos.linha}>
                  {alca}
                  <span className={estilos.nome}>{categoria.titulo}</span>
                </div>
              )}
            />
          </section>
        ) : null}
        <div className={estilos.grupos}>
          {grupos.map((grupo) => (
            <section key={grupo.id} className={estilos.coluna} aria-labelledby={`ordem-${grupo.id}`}>
              <h2 id={`ordem-${grupo.id}`} className={estilos.titulo}>
                {grupo.titulo}
              </h2>
              <ListaReordenavel
                itens={grupo.servicos}
                nomeDaLista={
                  grupo.titulo === SEM_CATEGORIA ? "Serviços sem categoria" : `Serviços de ${grupo.titulo}`
                }
                rotulo={(servico) => servico.nome}
                aoReordenar={(ids) => aoSalvarServicos(ordemDosServicos(servicos, ordemCategorias, grupo.id, ids))}
                renderizar={(servico, alca) => (
                  <div className={estilos.linha}>
                    {alca}
                    <MiniaturaDoServico nome={servico.nome} fotoUrl={servico.fotoUrl} />
                    <span className={estilos.nome}>{servico.nome}</span>
                    <span className={estilos.apoio}>
                      {servico.duracaoMinutos} min · {formatarPreco(servico.preco)}
                    </span>
                  </div>
                )}
              />
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrdemDaEquipe({
  equipe,
  rotuloDoPapel,
  aoSalvar,
  aoTerminar,
}: {
  // A equipe inteira: a API pede todos.
  equipe: MembroDaEquipe[];
  rotuloDoPapel: (membro: MembroDaEquipe) => string;
  aoSalvar: (ids: string[]) => Promise<void>;
  aoTerminar: () => void;
}) {
  // Quem o cliente escolhe na página: ativo e que atende.
  const naPagina = equipe.filter((membro) => membro.ativo && membro.atende);

  return (
    <div className={estilos.ordem}>
      <Faixa aoTerminar={aoTerminar} />
      <section className={`${estilos.coluna} ${estilos.equipe}`}>
        <ListaReordenavel
          itens={naPagina}
          nomeDaLista="Equipe na sua página"
          rotulo={(membro) => membro.nome}
          aoReordenar={(ids) => aoSalvar(primeirosEResto(ids, equipe.map((membro) => membro.id)))}
          renderizar={(membro, alca) => (
            <div className={estilos.linha}>
              {alca}
              <span className={estilos.nome}>{membro.nome}</span>
              <span className={estilos.apoio}>{rotuloDoPapel(membro)}</span>
            </div>
          )}
        />
      </section>
    </div>
  );
}
