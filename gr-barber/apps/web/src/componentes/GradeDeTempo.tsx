"use client";

import type { CSSProperties } from "react";
// O tipo e o componente têm o mesmo nome de propósito — um descreve o
// que o outro desenha. O alias existe só para os dois conviverem aqui.
import type { GradeDeTempo as Grade } from "../painel/grade";
import { MINUTOS_POR_LINHA } from "../painel/grade";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./GradeDeTempo.module.css";

const NOMES_CURTOS = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

function nomeDoDia(data: string): string {
  // Meio-dia UTC pra leitura do dia da semana não escorregar de fuso —
  // a mesma precaução do `diaDaSemanaDe` em painel/grade.ts.
  return NOMES_CURTOS[new Date(`${data}T12:00:00Z`).getUTCDay()];
}

function emHora(minuto: number): string {
  const h = String(Math.floor(minuto / 60)).padStart(2, "0");
  const m = String(minuto % 60).padStart(2, "0");
  return `${h}:${m}`;
}

// De quanto em quanto tempo o eixo se marca entre as pontas. Em 30, a
// distância entre dois rótulos é de 6 linhas — 72px em
// `--altura-da-linha: 12px`, folgado para dois textos de --texto-xs.
// Descer para 15 encostaria um no outro.
const PASSO_DO_EIXO = 30;

// Perto demais de uma ponta, o rótulo do meio colide com ela: em
// `--altura-da-linha: 12px`, duas linhas são 24px para dois textos de
// --texto-xs. Quem cede é o do meio, que é a informação repetida.
const FOLGA_EM_MINUTOS = MINUTOS_POR_LINHA * 2;

// Rótulos do eixo da esquerda: as duas pontas da janela, SEMPRE, mais as
// marcas de meia em meia hora que couberem entre elas.
//
// As pontas são o que abre e o que fecha — abrindo 09:30 e fechando
// 18:30, só as horas cheias deixavam o barbeiro sem nenhuma marca de
// quando o dia começa e termina, justo os dois números que ele procura.
// Quando um agendamento cai fora do horário a janela estica pra cobri-lo
// (ver grade.ts), e aí a ponta mostra o limite dele, não o da barbearia:
// é a mesma verdade que a grade desenha, e o rótulo não pode mentir
// sobre onde a primeira linha está.
function rotulosDoEixo(
  grade: Grade
): { minuto: number; rotulo: string; linha: number }[] {
  const linhaDe = (minuto: number) =>
    (minuto - grade.minutoInicial) / MINUTOS_POR_LINHA + 1;

  const pontas = [grade.minutoInicial, grade.minutoFinal];
  const minutos = [...pontas];

  const primeira =
    Math.ceil(grade.minutoInicial / PASSO_DO_EIXO) * PASSO_DO_EIXO;
  for (
    let minuto = primeira;
    minuto < grade.minutoFinal;
    minuto += PASSO_DO_EIXO
  ) {
    const encosta = pontas.some(
      (ponta) => Math.abs(ponta - minuto) < FOLGA_EM_MINUTOS
    );
    if (!encosta) minutos.push(minuto);
  }

  return minutos
    .sort((um, outro) => um - outro)
    .map((minuto) => ({
      minuto,
      rotulo: emHora(minuto),
      // O fechamento cai na linha DEPOIS da última, que não existe na
      // grade: pedi-la abriria uma linha implícita só no eixo, e ele
      // ficaria mais alto que as colunas irmãs. Fica na última linha,
      // empurrado para a base dela pelo CSS.
      linha: minuto === grade.minutoFinal ? grade.totalLinhas : linhaDe(minuto),
    }));
}

export function GradeDeTempo({
  grade,
  aoAbrir,
  aoCriar,
  aoAbrirDia,
}: {
  grade: Grade;
  aoAbrir: (id: string) => void;
  // O dia vai junto da hora: na vista de semana a hora sozinha não diz
  // qual coluna foi clicada.
  aoCriar: (data: string, hora: string) => void;
  // Só a vista de semana passa: é o cabeçalho clicável de cada coluna.
  aoAbrirDia?: (data: string) => void;
}) {
  if (grade.totalLinhas === 0) {
    return <p className={estilos.vazio}>Fechado neste dia.</p>;
  }

  // O número de colunas vai por custom property, e não por `auto-fit`:
  // cabeçalho e corpo são duas grades irmãs que precisam ter exatamente
  // as mesmas trilhas, e `auto-fit` as derivaria da contagem de filhos
  // de cada uma — que é diferente.
  const estiloDaGrade = {
    "--total-linhas": grade.totalLinhas,
    "--colunas": grade.colunas.length,
  } as CSSProperties;

  return (
    <div
      className={estilos.quadro}
      style={estiloDaGrade}
      data-testid="quadro-da-grade"
    >
      {/* Fora do invólucro que rola, e não dentro: assim a barra de
          rolagem começa abaixo do cabeçalho em vez de correr ao lado dos
          dias. O preço seria o cabeçalho sobrar mais largo que o corpo
          pela largura da barra — e quem paga é o CSS, reservando a mesma
          calha nos dois (ver `.cabecalho` e `.rolagem`). */}
      <div className={estilos.cabecalho} data-testid="cabecalho-da-grade">
        <span className={estilos.canto} />
        {grade.colunas.map((coluna) =>
          aoAbrirDia ? (
            <button
              key={coluna.data}
              type="button"
              className={estilos.diaDoCabecalho}
              // A data por extenso é o nome acessível: "8" sozinho não
              // distingue uma coluna da outra numa lista de sete.
              aria-label={formatarDataLonga(coluna.data)}
              onClick={() => aoAbrirDia(coluna.data)}
            >
              <span className={estilos.nomeDoDia}>
                {nomeDoDia(coluna.data)}
              </span>
              <span className={estilos.numeroDoDia}>
                {Number(coluna.data.slice(8))}
              </span>
            </button>
          ) : (
            // Sem navegação a vista de dia ainda precisa dizer que dia
            // está na tela — o que some é o clique, não o rótulo.
            <span key={coluna.data} className={estilos.diaDoCabecalho}>
              <span className={estilos.nomeDoDia}>
                {nomeDoDia(coluna.data)}
              </span>
              <span className={estilos.numeroDoDia}>
                {Number(coluna.data.slice(8))}
              </span>
            </span>
          ),
        )}
      </div>

      <div className={estilos.rolagem} data-testid="rolagem-da-grade">
        <div className={estilos.corpo} data-testid="corpo-da-grade">
          <div className={estilos.eixo}>
            {rotulosDoEixo(grade).map((hora) => (
              <span
                key={hora.minuto}
                className={estilos.hora}
                // O rótulo da primeira linha fica embaixo do cabeçalho
                // grudado e não pode subir meia linha como os outros.
                // Continua sendo `linha === 1`, e não "o primeiro da
                // lista": a abertura sempre abre a lista, mas a marca é
                // sobre encostar no topo, não sobre ser o primeiro.
                data-no-topo={hora.linha === 1 ? "true" : undefined}
                // O fechamento é o único que se mede pela base da linha
                // em vez do topo — é o fim da janela, não o começo de
                // mais uma faixa.
                data-no-fim={
                  hora.minuto === grade.minutoFinal ? "true" : undefined
                }
                style={{ "--linha": hora.linha } as CSSProperties}
              >
                {hora.rotulo}
              </span>
            ))}
          </div>

          {grade.colunas.map((coluna) => (
            <div key={coluna.data} className={estilos.coluna}>
              {coluna.fechado ? (
                <p className={estilos.fechado}>Fechado neste dia.</p>
              ) : null}

              {coluna.livres.map((faixa) =>
                // Faixa passada não vira botão: oferecer 09:00 às 10h é
                // ruído. A linha continua ocupada pra grade não ganhar
                // buraco.
                faixa.passada ? (
                  <span
                    key={faixa.hora}
                    className={estilos.passada}
                    style={
                      {
                        "--linha": faixa.linha,
                        "--linhas": faixa.linhas,
                      } as CSSProperties
                    }
                  />
                ) : (
                  <button
                    key={faixa.hora}
                    type="button"
                    className={estilos.livre}
                    style={
                      {
                        "--linha": faixa.linha,
                        "--linhas": faixa.linhas,
                      } as CSSProperties
                    }
                    onClick={() => aoCriar(coluna.data, faixa.hora)}
                  >
                    {faixa.hora}
                  </button>
                ),
              )}

              {coluna.eventos.map((evento) => (
                <button
                  key={evento.agendamento.id}
                  type="button"
                  className={estilos.evento}
                  style={
                    {
                      "--linha": evento.linha,
                      "--linhas": evento.linhas,
                      "--pista": evento.pista,
                      "--pistas": evento.pistas,
                    } as CSSProperties
                  }
                  onClick={() => aoAbrir(evento.agendamento.id)}
                >
                  {/* O nome completo entra no texto, e quem encurta é o CSS:
                  na coluna larga da vista de dia ele cabe inteiro, na
                  coluna estreita da semana trunca com reticências.
                  Cortar no JavaScript esconderia o sobrenome também na
                  vista de dia, onde há espaço de sobra. */}
                  <strong className={estilos.horaDoEvento}>
                    {evento.agendamento.horaInicio}
                  </strong>{" "}
                  {evento.agendamento.cliente.nome}
                  <span className={estilos.servicos}>
                    {evento.agendamento.servicos.map((s) => s.nome).join(" + ")}
                  </span>
                </button>
              ))}

              {grade.agora?.data === coluna.data ? (
                <span
                  data-testid="regua-do-agora"
                  className={estilos.agora}
                  style={
                    {
                      "--linha": grade.agora.linha,
                      "--fracao": grade.agora.fracao,
                    } as CSSProperties
                  }
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
