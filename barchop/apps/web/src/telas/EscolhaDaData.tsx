"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { Calendario } from "../componentes/Calendario";
import { FaixaDeDias } from "../componentes/FaixaDeDias";
import { ListaDeHorarios } from "../componentes/ListaDeHorarios";
import { Resumo } from "../componentes/Resumo";
import { caminhoDoPasso } from "../fluxo/passos";
import { profissionaisQueFazem } from "../fluxo/profissionais";
import { usePassoDoFluxo } from "../fluxo/usePassoDoFluxo";
import {
  ehPassado,
  formatarDataComSemana,
  hojeIso,
  horaJaPassou,
  somarDias,
} from "../formato/datas";
import estilos from "./EscolhaDaData.module.css";
import { useNoHost } from "../tenant/ProvedorDoHost";

const DIAS_NA_FAIXA = 14;

// Dia e horário numa tela só. Eram duas: escolhia-se o dia numa, e só
// na seguinte se descobria se o horário servia — e às vezes que não
// tinha horário nenhum, com a volta por conta do navegador.
//
// A URL continua sendo o estado, como no resto do fluxo: o dia
// escolhido vai em `?data=`, então recarregar mantém a escolha, e os
// recados da confirmação (`?aviso=`) chegam aqui com o dia em que o
// horário falhou.
//
// `agora` é prop com padrão, do mesmo jeito que o agoraNaBarbearia da
// API recebe o instante: é o que deixa o teste escolher o dia sem fake
// timers.
export function EscolhaDaData({ agora = new Date() }: { agora?: Date }) {
  const { slug, servicoIds, data, remarcar, aviso, profissional, pronto } = usePassoDoFluxo(
    "data",
    agora
  );
  const router = useRouter();
  const noHost = useNoHost();
  const api = useApi();

  const hoje = hojeIso(agora);
  const faixa = Array.from({ length: DIAS_NA_FAIXA }, (_, i) =>
    somarDias(hoje, i)
  );
  // Dois estados, e não um só: o mês que o calendário mostra, e se ele
  // está aberto — o que só importa no celular, onde ele fica atrás do
  // "Outra data". No desktop o calendário está sempre à vista (o CSS
  // decide), e fechar ao escolher não pode levá-lo de volta pro mês
  // atual.
  const [mes, setMes] = useState(() => hoje.slice(0, 7));
  const [calendarioAbertoNoCelular, setCalendarioAberto] = useState(false);

  // O perfil uma vez só, e não a cada troca de dia: é com ele que o
  // profissional da URL é conferido.
  const perfil = useRequisicao(
    async () => (pronto ? api.publico.perfilDaBarbearia(slug) : null),
    [slug, pronto]
  );
  // Sem profissional na URL é "qualquer um": a API junta a agenda de
  // quem faz os serviços.
  const barbeiroId = profissional;
  // O profissional da URL ainda serve? Link velho, ou serviço trocado
  // depois de escolher, podem trazer quem não faz o que foi pedido — e a
  // API responderia 422. `undefined` enquanto o perfil não chegou.
  const profissionalServe = !profissional
    ? true
    : perfil.dados
      ? profissionaisQueFazem(perfil.dados.barbeiros, servicoIds).some(
          (barbeiro) => barbeiro.id === profissional
        )
      : undefined;
  const podeConsultar = pronto && profissionalServe === true;

  useEffect(() => {
    // `replace`: a URL com o profissional que não serve não merece
    // entrada no histórico.
    if (profissionalServe === false) {
      router.replace(noHost(caminhoDoPasso(slug, "profissional", { servicoIds, remarcar })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primitivos, ver usePassoDoFluxo
  }, [profissionalServe, slug, servicoIds.join(","), remarcar, router, noHost]);

  // A rota de disponibilidade é por mês, e a faixa atravessa a virada
  // (no dia 28 ela é quase toda do mês seguinte). Os meses vão em
  // paralelo e se juntam num mapa só.
  const meses = [
    ...new Set([
      hoje.slice(0, 7),
      faixa[faixa.length - 1].slice(0, 7),
      mes,
    ]),
  ];

  const agenda = useRequisicao(async () => {
    if (!podeConsultar) return null;
    const porMes = await Promise.all(
      meses.map((mes) =>
        api.publico.disponibilidadeDoMes(slug, { barbeiroId, mes, servicoIds })
      )
    );
    const dias: Record<string, boolean> = Object.assign({}, ...porMes);

    // A rota do mês não sabe que horas são (de propósito — ver o
    // comentário dela), então "hoje" chega `true` mesmo depois do
    // último horário. Sem esta checagem o dia ficava tocável e abria em
    // "nenhum horário". O filtro é o mesmo `horaJaPassou` da lista
    // abaixo, pra faixa e lista nunca discordarem sobre o mesmo dia.
    if (dias[hoje]) {
      const horarios = await api.publico.disponibilidadeDoDia(slug, {
        barbeiroId,
        data: hoje,
        servicoIds,
      });
      if (horarios.every((hora) => horaJaPassou(hoje, hora, agora))) {
        dias[hoje] = false;
      }
    }
    return dias;
  }, [slug, podeConsultar, barbeiroId, meses.join(","), servicoIds.join(","), hoje]);

  const dias = agenda.dados ?? {};

  // Data passada na URL (aba antiga, link velho) é ignorada, não
  // recusada: a tela cai no primeiro dia com vaga como se não houvesse
  // data nenhuma.
  const dataValida = data && !ehPassado(data, agora) ? data : undefined;
  // Sem data escolhida, o primeiro dia com vaga já vem aberto: quem
  // quer "o quanto antes" vê os horários sem tocar em nada.
  const dataEfetiva = dataValida ?? faixa.find((dia) => dias[dia]);

  const horarios = useRequisicao(async () => {
    if (!podeConsultar || !dataEfetiva) return null;
    const livres = await api.publico.disponibilidadeDoDia(slug, {
      barbeiroId,
      data: dataEfetiva,
      servicoIds,
    });
    // O dia viaja junto com a lista. O useRequisicao mantém a resposta
    // anterior enquanto busca a nova, e sem esta marca os horários de
    // ontem apareceriam sob o dia de hoje por um instante — e um toque
    // nesse instante mandaria uma hora que ninguém conferiu.
    return {
      data: dataEfetiva,
      livres: livres.filter((hora) => !horaJaPassou(dataEfetiva, hora, agora)),
    };
  }, [slug, podeConsultar, barbeiroId, dataEfetiva, servicoIds.join(",")]);

  if (!pronto) return null;

  // Sem isso, uma falha de rede desenharia todos os dias como
  // indisponíveis — uma tela enganosa, indistinguível de uma agenda
  // lotada de verdade.
  if (perfil.erro || agenda.erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Não foi possível carregar a agenda</h1>
      </main>
    );
  }

  if (!agenda.dados) return <main className={estilos.pagina}>Carregando…</main>;

  function escolherDia(dia: string) {
    // replace, e não push: o "voltar" do celular deve sair do passo, não
    // desfazer cada dia tocado. E sem rolar pro topo, que jogaria a
    // lista de horários pra fora da tela bem quando ela chega.
    router.replace(
      noHost(caminhoDoPasso(slug, "data", { servicoIds, data: dia, remarcar, profissional })),
      { scroll: false }
    );
  }

  const semVagaNaFaixa = !faixa.some((dia) => dias[dia]);
  const calendarioAberto =
    calendarioAbertoNoCelular || (semVagaNaFaixa && !dataValida);

  const listaDoDia =
    horarios.dados && horarios.dados.data === dataEfetiva
      ? horarios.dados.livres
      : null;

  // Pra quando o dia escolhido veio vazio: o próximo dia com vaga entre
  // os que já estão carregados.
  const proximoComVaga = dataEfetiva
    ? Object.keys(dias)
        .filter((dia) => dia > dataEfetiva && dias[dia])
        .sort()[0]
    : undefined;

  return (
    <main className={`${estilos.pagina} ${estilos.duasColunas}`}>
      <h1 className={estilos.titulo}>Escolha o dia e o horário</h1>

      {/* Dois blocos que só existem como caixa a partir de 900px: o dia à
          esquerda, os horários à direita. No celular são `display:
          contents` e os filhos seguem em fila, como antes. */}
      <div className={estilos.escolhaDoDia}>
        {/* A faixa é jeito de celular (rolar de lado com o dedo); no
            desktop o CSS a esconde e quem escolhe o dia é o calendário. */}
        <div className={estilos.faixa}>
          <FaixaDeDias
            dias={faixa}
            disponiveis={dias}
            selecionada={dataEfetiva}
            aoEscolher={escolherDia}
          />
        </div>

        {/* Sempre no DOM; no celular o CSS o esconde enquanto não for
            aberto pelo "Outra data" (ou por não haver vaga na faixa). */}
        <div
          className={estilos.calendario}
          data-aberto={calendarioAberto ? "true" : undefined}
        >
          <Calendario
            mes={mes}
            dias={dias}
            agora={agora}
            selecionada={dataEfetiva}
            aoTrocarMes={setMes}
            aoEscolher={(dia) => {
              escolherDia(dia);
              setCalendarioAberto(false);
            }}
          />
        </div>

        {calendarioAberto ? null : (
          // A saída pra além dos 14 dias no celular. Sem ela a faixa
          // teria tirado a possibilidade de agendar mais longe.
          <p className={estilos.outraData}>
            <button
              type="button"
              className={estilos.link}
              onClick={() => setCalendarioAberto(true)}
            >
              Outra data
            </button>
          </p>
        )}
      </div>

      <div className={estilos.escolhaDoHorario}>
        {/* Recado que veio pela URL da confirmação: ela montou do zero, e
            o estado local de lá não atravessa a navegação. */}
        {aviso === "horario_ocupado" ? (
          <Aviso>Esse horário acabou de ser ocupado. Escolha outro.</Aviso>
        ) : null}
        {aviso === "horario_expirou" ? (
          <Aviso>Esse horário já passou. Escolha outro.</Aviso>
        ) : null}

        {!dataEfetiva ? (
          <p>Nenhum horário livre nos próximos 14 dias. Veja outra data no calendário.</p>
        ) : (
          <div className={estilos.horarios}>
            <Resumo itens={[formatarDataComSemana(dataEfetiva)]} />

            {horarios.erro ? (
              // Sem isto, um 500 na busca do dia deixava "Carregando
              // horários…" pra sempre: `listaDoDia` nunca sai de null.
              <>
                <p role="alert">Não foi possível carregar os horários.</p>
                <Botao variante="contorno" onClick={horarios.recarregar}>
                  Tentar de novo
                </Botao>
              </>
            ) : listaDoDia === null ? (
              <p role="status">Carregando horários…</p>
            ) : listaDoDia.length === 0 ? (
              // Ainda aparece: a última vaga ocupada entre um toque e
              // outro, ou uma data escolhida no calendário. O botão é o que
              // impede de virar beco.
              <>
                <p>Nenhum horário livre nesse dia.</p>
                {proximoComVaga ? (
                  <Botao variante="contorno" onClick={() => escolherDia(proximoComVaga)}>
                    {`Ver ${formatarDataComSemana(proximoComVaga)}`}
                  </Botao>
                ) : null}
              </>
            ) : (
              <ListaDeHorarios
                horarios={listaDoDia}
                aoEscolher={(hora) =>
                  router.push(
                    noHost(caminhoDoPasso(slug, "confirmar", {
                      servicoIds,
                      data: dataEfetiva,
                      hora,
                      remarcar,
                      profissional,
                    }))
                  )
                }
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
