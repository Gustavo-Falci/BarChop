"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ServicoSerializado } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Botao } from "../componentes/Botao";
import { CartaoDeServico, type HorarioProximo } from "../componentes/CartaoDeServico";
import { formatarPreco } from "../componentes/ItemDeServico";
import { agruparPorCategoria } from "../fluxo/categorias";
import { iconeDaCategoria } from "../fluxo/iconeDaCategoria";
import { caminhoDoPasso } from "../fluxo/passos";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import estilos from "./EscolhaDeServicos.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";

function contagem(quantos: number): string {
  return `${quantos} ${quantos === 1 ? "serviço" : "serviços"}`;
}

// `agora` é prop com padrão, como no PerfilDaBarbearia: é o que deixa o
// teste fixar "hoje" e "amanhã" dos próximos horários.
export function EscolhaDeServicos({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, remarcar, profissional } = usePassoDoFluxo("servicos");
  const router = useRouter();
  const noHost = useNoHost();
  const api = useApi();
  const { dados, carregando, erro, recarregar } = useRequisicao(
    () => api.publico.servicos(slug),
    [slug]
  );
  // Os próximos horários de cada serviço, em paralelo com a lista. Se
  // falhar, os cartões ficam sem eles: são atalho, não conteúdo.
  const proximos = useRequisicao(() => api.publico.proximosHorarios(slug), [slug]);

  // Começa do que veio na URL: voltar do passo seguinte não pode perder
  // a escolha.
  const [escolhidos, setEscolhidos] = useState<string[]>(servicoIds);

  const servicos = dados ?? [];
  const selecionados = servicos.filter((s) => escolhidos.includes(s.id));
  const duracao = selecionados.reduce((t, s) => t + s.duracaoMinutos, 0);
  // centavo somado como float é o defeito que o preço em string existe pra evitar.
  const totalEmCentavos = selecionados.reduce(
    (soma, servico) => soma + Math.round(Number(servico.preco) * 100),
    0
  );
  const nadaEscolhido = selecionados.length === 0;

  function alternar(id: string) {
    setEscolhidos((atuais) =>
      atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]
    );
  }

  // Remarcando, sem atalhos: o atalho leva à confirmação de um
  // agendamento NOVO, e quem está remarcando quer mexer no que já tem.
  function proximosDe(servico: ServicoSerializado): HorarioProximo[] {
    if (remarcar) return [];
    const horarios =
      proximos.dados?.find((item) => item.servicoId === servico.id)?.horarios ?? [];
    return horarios.map((horario) => ({
      ...horario,
      href: noHost(
        caminhoDoPasso(slug, "confirmar", {
          servicoIds: [servico.id],
          data: horario.data,
          hora: horario.horaInicio,
        })
      ),
    }));
  }

  if (carregando) {
    return (
      <main className={estilos.pagina} aria-busy="true">
        <h1 className={estilos.titulo}>Escolha os serviços</h1>
        <p className={estilos.somenteLeitor}>Carregando os serviços…</p>
        <ul className={estilos.lista} aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <li key={n} className={estilos.esqueleto} />
          ))}
        </ul>
      </main>
    );
  }

  if (erro) {
    return (
      <main className={estilos.pagina}>
        <h1 className={estilos.titulo}>Não foi possível carregar os serviços</h1>
        <p className={estilos.apoio}>Confira a conexão e tente de novo.</p>
        <div>
          <Botao variante="contorno" onClick={recarregar}>
            Tentar de novo
          </Botao>
        </div>
      </main>
    );
  }

  if (servicos.length === 0) {
    return (
      <main className={estilos.pagina}>
        <h1 className={estilos.titulo}>Escolha os serviços</h1>
        <p className={estilos.apoio}>Esta barbearia ainda não cadastrou serviços.</p>
      </main>
    );
  }

  return (
    <main
      className={`${estilos.pagina} ${estilos.duasColunas} ${
        nadaEscolhido ? "" : estilos.comBarra
      }`}
    >
      <header className={estilos.cabecalho}>
        <h1 className={estilos.titulo}>Escolha os serviços</h1>
        <p className={estilos.apoio}>
          Marque um ou mais. O profissional e o horário vêm depois.
        </p>
      </header>

      <div className={estilos.grupos}>
        {agruparPorCategoria(servicos).map((grupo) => {
          const lista = (
            <ul className={estilos.lista}>
              {grupo.servicos.map((servico) => (
                <CartaoDeServico
                  key={servico.id}
                  servico={servico}
                  marcado={escolhidos.includes(servico.id)}
                  aoAlternar={alternar}
                  proximos={proximosDe(servico)}
                  agora={agora}
                />
              ))}
            </ul>
          );
          if (!grupo.titulo) return <div key="todos">{lista}</div>;
          const Icone = iconeDaCategoria(grupo.categoria);
          return (
            <section key={grupo.titulo} className={estilos.grupo} aria-label={grupo.titulo}>
              <h2 className={estilos.subtitulo}>
                <Icone width={22} height={22} />
                {grupo.titulo}
                <span className={estilos.contagem}>{contagem(grupo.servicos.length)}</span>
              </h2>
              {lista}
            </section>
          );
        })}
      </div>

      {/* Um elemento só pras duas telas: no desktop é a coluna da direita,
          acompanhando a rolagem; no celular vira a barra presa no rodapé,
          que só aparece com algo escolhido (data-vazio, no CSS). Um só
          porque dois resumos no DOM seriam lidos duas vezes. */}
      <section
        className={estilos.resumo}
        aria-label="Sua escolha"
        data-vazio={nadaEscolhido || undefined}
      >
        <h2 className={estilos.resumoTitulo}>Sua escolha</h2>
        {nadaEscolhido ? (
          <p className={estilos.resumoVazio}>Nenhum serviço escolhido ainda</p>
        ) : (
          <div className={estilos.numeros}>
            <span className={estilos.linha}>
              <span>{contagem(selecionados.length)}</span>
              <span className={estilos.separador} aria-hidden="true">·</span>
              <span>{duracao} min</span>
            </span>
            <span className={estilos.total}>
              {formatarPreco((totalEmCentavos / 100).toFixed(2))}
            </span>
          </div>
        )}

        <Botao
          disabled={nadaEscolhido}
          onClick={() =>
            router.push(
              // Remarcar não troca de profissional (a API mantém o do
              // agendamento): vai direto pro dia, levando quem atende.
              remarcar
                ? noHost(caminhoDoPasso(slug, "data", {
                    servicoIds: selecionados.map((s) => s.id),
                    remarcar,
                    profissional,
                  }))
                : noHost(caminhoDoPasso(slug, "profissional", {
                    servicoIds: selecionados.map((s) => s.id),
                  }))
            )
          }
        >
          Continuar
        </Botao>
      </section>
    </main>
  );
}
