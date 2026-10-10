"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { DiaDaJornada, ModoJornada } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Grupo } from "../../componentes/Grupo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./JornadaDoMembro.module.css";
import { temPausa } from "./pausa";

// A pausa que o "Adicionar pausa" e o "Aplicar" usam quando a pessoa
// ainda não tem nenhuma: o almoço mais comum.
const PAUSA_PADRAO = { inicio: "12:00", fim: "13:00" };

// A pausa de sempre nasce da primeira que a semana salva já tem.
function pausaDaSemana(semana: DiaDaJornada[]): { inicio: string; fim: string } {
  const dia = semana.find(temPausa);
  return dia ? { inicio: dia.pausaInicio!, fim: dia.pausaFim! } : PAUSA_PADRAO;
}

// O dia mostra os campos da pausa enquanto tiver alguma das duas horas:
// apagar uma não pode sumir com o campo que a pessoa está editando.
function pausaAberta(dia: DiaDaJornada): boolean {
  return dia.modo !== "folga" && (dia.pausaInicio != null || dia.pausaFim != null);
}

// O nome do dia e a preposição que ele pede: "na segunda", "no sábado".
// O nome acessível de cada controle carrega o dia — sete selects
// "Jornada" na mesma tela não se distinguem por voz.
const DIAS = [
  { nome: "domingo", em: "no" },
  { nome: "segunda", em: "na" },
  { nome: "terça", em: "na" },
  { nome: "quarta", em: "na" },
  { nome: "quinta", em: "na" },
  { nome: "sexta", em: "na" },
  { nome: "sábado", em: "no" },
];

const MODOS: { valor: ModoJornada; rotulo: string }[] = [
  { valor: "barbearia", rotulo: "Horário da barbearia" },
  { valor: "proprio", rotulo: "Horário próprio" },
  { valor: "folga", rotulo: "Folga" },
];

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// A semana de trabalho do membro: em cada dia ele acompanha o horário
// da barbearia, tem o próprio, ou folga. O horário próprio é recortado
// no da barbearia pela API — não atende com a porta fechada. Cada dia de
// trabalho pode ter a pausa do almoço (painel v2, marco 3).
export function JornadaDoMembro({ membroId }: { membroId: string }) {
  const api = useApiDoPainel();
  const salva = useRequisicao(() => api.barbeiro.jornada(membroId), [membroId]);

  const [semana, setSemana] = useState<DiaDaJornada[]>([]);
  const [pausaDeSempre, setPausaDeSempre] = useState(PAUSA_PADRAO);
  const [erro, setErro] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização, como em CadastroDeServico: um
  // efeito deixaria a semana vazia aparecer por um quadro. `vista` é a
  // última resposta do GET; `gravada`, o que está no banco, que o Salvar
  // também troca — com uma só, a tela voltava pra semana de antes logo
  // depois de salvar (ver ServicosDoMembro).
  const [vista, setVista] = useState<DiaDaJornada[] | null>(null);
  const [gravada, setGravada] = useState<DiaDaJornada[] | null>(null);
  if (salva.dados && salva.dados !== vista) {
    setVista(salva.dados);
    setGravada(salva.dados);
    setSemana(salva.dados);
    setPausaDeSempre(pausaDaSemana(salva.dados));
  }

  if (salva.erro) {
    return <Aviso>{salva.erro.mensagem || "Não foi possível carregar a jornada agora."}</Aviso>;
  }

  function trocarDia(diaSemana: number, mudanca: Partial<DiaDaJornada>) {
    setConfirmacao(undefined);
    setSemana((atual) =>
      atual.map((dia) => (dia.diaSemana === diaSemana ? { ...dia, ...mudanca } : dia))
    );
  }

  function escolherModo(dia: DiaDaJornada, modo: ModoJornada) {
    // Sair do próprio limpa as horas, como o "fechado" do funcionamento:
    // guardá-las seria um estado que a API descarta e a tela reexibiria.
    // Folga limpa a pausa pelo mesmo motivo.
    trocarDia(dia.diaSemana, {
      modo,
      ...(modo === "proprio"
        ? { horaInicio: dia.horaInicio, horaFim: dia.horaFim }
        : { horaInicio: null, horaFim: null }),
      ...(modo === "folga" ? { pausaInicio: null, pausaFim: null } : {}),
    });
  }

  // A pausa de sempre em todo dia de trabalho; a folga fica sem.
  function aplicarPausa() {
    if (!pausaDeSempre.inicio || !pausaDeSempre.fim || pausaDeSempre.inicio >= pausaDeSempre.fim) {
      setErro("A pausa de sempre precisa começar antes de terminar.");
      return;
    }
    setErro(undefined);
    setConfirmacao(undefined);
    setSemana((atual) =>
      atual.map((dia) =>
        dia.modo === "folga" ? dia : { ...dia, pausaInicio: pausaDeSempre.inicio, pausaFim: pausaDeSempre.fim }
      )
    );
  }

  async function salvar() {
    setErro(undefined);
    setConfirmacao(undefined);

    // A mesma regra da API, antes da ida: as duas horas, e a entrada
    // antes da saída. "HH:mm" compara como texto na ordem do relógio.
    for (const dia of semana) {
      const nome = capitalizar(DIAS[dia.diaSemana].nome);
      if (pausaAberta(dia)) {
        if (!dia.pausaInicio || !dia.pausaFim) {
          setErro(`${nome}: informe o começo e o fim da pausa.`);
          return;
        }
        if (dia.pausaInicio >= dia.pausaFim) {
          setErro(`${nome}: a pausa precisa começar antes de terminar.`);
          return;
        }
      }
      if (dia.modo !== "proprio") continue;
      if (!dia.horaInicio || !dia.horaFim) {
        setErro(`${nome}: informe a entrada e a saída do horário próprio.`);
        return;
      }
      if (dia.horaInicio >= dia.horaFim) {
        setErro(`${nome}: a entrada precisa ser antes da saída.`);
        return;
      }
    }

    setSalvando(true);
    try {
      const resposta = await api.barbeiro.salvarJornada(membroId, semana);
      setGravada(resposta);
      setSemana(resposta);
      setConfirmacao("Jornada salva.");
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível salvar a jornada agora.");
    } finally {
      setSalvando(false);
    }
  }

  // O Salvar só aparece com a semana diferente da gravada. Sete dias de
  // campos curtos: comparar o texto basta.
  const mudou = gravada !== null && JSON.stringify(semana) !== JSON.stringify(gravada);

  function descartar() {
    if (!gravada) return;
    setErro(undefined);
    setSemana(gravada);
    setPausaDeSempre(pausaDaSemana(gravada));
  }

  return (
    <Grupo
      titulo="Jornada"
      descricao="Em que dias e horários a pessoa atende. O horário próprio vale só dentro do horário da barbearia; na pausa, ninguém marca com ela."
      acao={
        mudou ? (
          <>
            <Botao onClick={salvar} carregando={salvando}>
              Salvar jornada
            </Botao>
            <Botao variante="contorno" onClick={descartar}>
              Descartar
            </Botao>
          </>
        ) : undefined
      }
    >
      {!salva.dados ? <p>Carregando…</p> : null}
      {/* Um atalho pra pausa de todo dia, como a rotina em Horários: a
          pausa de cada dia continua editável aqui embaixo. */}
      <div className={estilos.pausaDeSempre}>
        <Campo
          rotulo="Pausa de sempre: começa"
          type="time"
          aria-label="Pausa de sempre: início"
          valor={pausaDeSempre.inicio}
          onChange={(valor) => setPausaDeSempre((atual) => ({ ...atual, inicio: valor }))}
        />
        <Campo
          rotulo="Termina"
          type="time"
          aria-label="Pausa de sempre: fim"
          valor={pausaDeSempre.fim}
          onChange={(valor) => setPausaDeSempre((atual) => ({ ...atual, fim: valor }))}
        />
        <Botao variante="contorno" onClick={aplicarPausa} disabled={!salva.dados}>
          Aplicar aos dias de trabalho
        </Botao>
      </div>
      {/* Os dias num bloco só: a régua da última linha some pelo
          `:last-child`, com ou sem os botões de salvar depois. */}
      <div>
        {semana.map((dia) => {
          const { nome, em } = DIAS[dia.diaSemana];
          return (
            <div key={dia.diaSemana} className={estilos.dia}>
              <span>{capitalizar(nome)}</span>
              <select
                className={estilos.modo}
                aria-label={`Jornada ${em} ${nome}`}
                value={dia.modo}
                onChange={(evento) => escolherModo(dia, evento.target.value as ModoJornada)}
              >
                {MODOS.map((modo) => (
                  <option key={modo.valor} value={modo.valor}>
                    {modo.rotulo}
                  </option>
                ))}
              </select>
              {/* Embrulhado, como em Configurações: as linhas mantêm o
                  mesmo número de colunas com ou sem as horas. O horário
                  e a pausa em faixas próprias: juntos numa linha só, o
                  "até" da pausa quebrava sozinho pra linha de baixo. */}
              <div className={estilos.horas}>
                {dia.modo === "proprio" ? (
                  <div className={estilos.faixa}>
                    <Campo
                      rotulo="Entrada"
                      type="time"
                      aria-label={`Entrada ${em} ${nome}`}
                      valor={dia.horaInicio ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { horaInicio: valor || null })}
                    />
                    <Campo
                      rotulo="Saída"
                      type="time"
                      aria-label={`Saída ${em} ${nome}`}
                      valor={dia.horaFim ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { horaFim: valor || null })}
                    />
                  </div>
                ) : null}
                {pausaAberta(dia) ? (
                  <div className={estilos.faixa}>
                    <Campo
                      rotulo="Pausa"
                      type="time"
                      aria-label={`Início da pausa ${em} ${nome}`}
                      valor={dia.pausaInicio ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { pausaInicio: valor || null })}
                    />
                    <Campo
                      rotulo="até"
                      type="time"
                      aria-label={`Fim da pausa ${em} ${nome}`}
                      valor={dia.pausaFim ?? ""}
                      onChange={(valor) => trocarDia(dia.diaSemana, { pausaFim: valor || null })}
                    />
                    <Botao
                      variante="fantasma"
                      aria-label={`Tirar pausa ${em} ${nome}`}
                      onClick={() => trocarDia(dia.diaSemana, { pausaInicio: null, pausaFim: null })}
                    >
                      Tirar pausa
                    </Botao>
                  </div>
                ) : dia.modo !== "folga" ? (
                  <Botao
                    variante="fantasma"
                    aria-label={`Adicionar pausa ${em} ${nome}`}
                    onClick={() =>
                      trocarDia(dia.diaSemana, { pausaInicio: pausaDeSempre.inicio, pausaFim: pausaDeSempre.fim })
                    }
                  >
                    + Pausa
                  </Botao>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {erro ? <Aviso>{erro}</Aviso> : null}
      {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}
    </Grupo>
  );
}
