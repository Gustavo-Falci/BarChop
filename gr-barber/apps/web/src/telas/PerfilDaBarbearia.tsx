"use client";

import { useParams, useRouter } from "next/navigation";
import type { HorarioSerializado } from "@gr-barber/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { formatarPreco } from "../componentes/ItemDeServico";
import { caminhoDoPasso } from "../fluxo/passos";
import estilos from "./PerfilDaBarbearia.module.css";

// Domingo a sábado, na ordem em que `diaSemana` vem da API (0 = domingo).
const DIAS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function PerfilDaBarbearia() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();

  const { dados, carregando, erro } = useRequisicao(
    () => api.publico.perfilDaBarbearia(slug),
    [slug]
  );

  // Segunda requisição, e não um campo a mais no perfil: a lista de
  // serviços já tem rota pública própria (que filtra os inativos), e o
  // primeiro passo do agendamento usa a mesma. Como as duas chamadas
  // partem do mesmo render, elas correm em paralelo — não há cascata.
  const servicos = useRequisicao(() => api.publico.servicos(slug), [slug]);

  if (carregando) return <main className={estilos.pagina}>Carregando…</main>;

  // 404 é o caso comum aqui, não excepcional: o link circula por
  // WhatsApp e o slug pode ter mudado.
  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1>
          {erro.codigo === "nao_encontrado"
            ? "Não encontramos essa barbearia"
            : "Não foi possível abrir esta página"}
        </h1>
      </main>
    );
  }

  const abertos = (dados?.horarios ?? []).filter((dia) => !dia.fechado);

  return (
    <main className={estilos.pagina}>
      <div className={estilos.faixa} />
      <div>
        <h1>{dados?.nome}</h1>
        {dados?.endereco ? (
          <p className={estilos.endereco}>{dados.endereco}</p>
        ) : null}
      </div>

      {/* Texto puro: ele é filho de um elemento React, que escapa por
          padrão. O `white-space: pre-line` do CSS é o que preserva as
          quebras de linha que o barbeiro digitou — a alternativa seria
          interpretar HTML, e aí este campo, que qualquer barbeiro
          escreve, viraria XSS na página mais pública do produto. */}
      {dados?.sobre ? <p className={estilos.sobre}>{dados.sobre}</p> : null}

      <Botao
        onClick={() =>
          router.push(caminhoDoPasso(slug, "servicos", { servicoIds: [] }))
        }
      >
        Agendar agora
      </Botao>

      {/* As duas seções aparecem só quando têm o que dizer. Uma
          barbearia recém-criada não tem serviço nem horário, e "Serviços
          (nenhum)" na própria página pública é pior do que não ter a
          seção: quem chegou pelo link leria como barbearia fechada, e
          quem acabou de criar a conta leria como produto quebrado. O
          lugar de cobrar o cadastro é o painel, não a vitrine. */}
      {servicos.dados && servicos.dados.length > 0 ? (
        <section className={estilos.secao}>
          <h2 className={estilos.titulo}>Serviços</h2>
          <ul className={estilos.lista}>
            {servicos.dados.map((servico) => (
              <li key={servico.id} className={estilos.linha}>
                <span>{servico.nome}</span>
                <span className={estilos.valor}>
                  {formatarPreco(servico.preco)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {abertos.length > 0 ? (
        <section className={estilos.secao}>
          <h2 className={estilos.titulo}>Horário de funcionamento</h2>
          <ul className={estilos.lista}>
            {abertos.map((dia) => (
              <li key={dia.diaSemana} className={estilos.linha}>
                <span>{DIAS[dia.diaSemana]}</span>
                <span className={estilos.valor}>{faixaDoDia(dia)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

// Só os dias abertos entram na lista, então abertura e fechamento
// existem — mas o tipo os declara anuláveis, e um dia marcado como
// aberto sem hora seria dado inconsistente do banco, não um caso a
// desenhar. O traço é o que evita "null às null".
function faixaDoDia(dia: HorarioSerializado): string {
  if (!dia.horaAbertura || !dia.horaFechamento) return "—";
  return `${dia.horaAbertura} às ${dia.horaFechamento}`;
}
