"use client";

import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { DiaDaJornada, HorarioSerializado, ModoJornada } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { BarraDeMudancas } from "../../componentes/BarraDeMudancas";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Folha } from "../../componentes/Folha";
import { Grupo } from "../../componentes/Grupo";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { IconeSeta } from "../../painel/icones";
import estilos from "./JornadaDoMembro.module.css";
import estilosDaFolha from "../../componentes/FolhaDeEscolha.module.css";
import { temPausa } from "./pausa";
import { Carregando } from "../../componentes/Carregando";

// A pausa que o "+ Pausa" e o "Aplicar" usam quando a pessoa ainda não
// tem nenhuma: o almoço mais comum.
const PAUSA_PADRAO = { inicio: "12:00", fim: "13:00" };

// A pausa de sempre nasce da primeira que a semana salva já tem.
function pausaDaSemana(semana: DiaDaJornada[]): { inicio: string; fim: string } {
  const dia = semana.find(temPausa);
  return dia ? { inicio: dia.pausaInicio!, fim: dia.pausaFim! } : PAUSA_PADRAO;
}

// O dia tem a pausa aberta enquanto tiver alguma das duas horas: apagar
// uma não pode sumir com o campo que a pessoa está editando.
function pausaAberta(dia: DiaDaJornada): boolean {
  return dia.modo !== "folga" && (dia.pausaInicio != null || dia.pausaFim != null);
}

// O nome do dia e a preposição que ele pede: "na segunda", "no sábado".
// O nome acessível de cada controle carrega o dia — sete "Entrada" na
// mesma tela não se distinguiam por voz.
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

function rotuloDoModo(modo: ModoJornada): string {
  return MODOS.find((opcao) => opcao.valor === modo)?.rotulo ?? modo;
}

// As horas da barbearia num dia: "09:00–18:00", ou que ela fecha.
function horasDaBarbearia(horario: HorarioSerializado | undefined): string | undefined {
  if (!horario) return undefined;
  if (horario.fechado || !horario.horaAbertura || !horario.horaFechamento) return "barbearia fechada";
  return `${horario.horaAbertura}–${horario.horaFechamento}`;
}

// O resumo da linha do dia: "Horário próprio · 13:00–18:00 · pausa
// 15:00–15:30", "Folga". As horas da barbearia só quando já chegaram:
// a linha não espera por elas.
function resumoDoDia(dia: DiaDaJornada, horario: HorarioSerializado | undefined): string {
  const partes = [rotuloDoModo(dia.modo)];
  if (dia.modo === "barbearia") {
    const horas = horasDaBarbearia(horario);
    if (horas) partes.push(horas);
  }
  if (dia.modo === "proprio" && dia.horaInicio && dia.horaFim) {
    partes.push(`${dia.horaInicio}–${dia.horaFim}`);
  }
  if (dia.modo !== "folga" && temPausa(dia)) {
    partes.push(`pausa ${dia.pausaInicio}–${dia.pausaFim}`);
  }
  return partes.join(" · ");
}

// A mesma regra da API: as duas horas, e a entrada antes da saída.
// "HH:mm" compara como texto na ordem do relógio. Vale na folha do dia
// e de novo no Salvar.
function erroDoDia(dia: DiaDaJornada): string | undefined {
  const nome = capitalizar(DIAS[dia.diaSemana].nome);
  if (pausaAberta(dia)) {
    if (!dia.pausaInicio || !dia.pausaFim) return `${nome}: informe o começo e o fim da pausa.`;
    if (dia.pausaInicio >= dia.pausaFim) return `${nome}: a pausa precisa começar antes de terminar.`;
  }
  if (dia.modo !== "proprio") return undefined;
  if (!dia.horaInicio || !dia.horaFim) return `${nome}: informe a entrada e a saída do horário próprio.`;
  if (dia.horaInicio >= dia.horaFim) return `${nome}: a entrada precisa ser antes da saída.`;
  return undefined;
}

// O que a barra de salvar diz: "Segunda: Horário da barbearia → Folga",
// ou só que o horário ou a pausa do dia mudou.
function oQueMudou(gravada: DiaDaJornada[], semana: DiaDaJornada[]): string[] {
  return semana.flatMap((dia) => {
    const antes = gravada.find((outro) => outro.diaSemana === dia.diaSemana);
    if (!antes || JSON.stringify(antes) === JSON.stringify(dia)) return [];
    const nome = capitalizar(DIAS[dia.diaSemana].nome);
    return antes.modo !== dia.modo
      ? [`${nome}: ${rotuloDoModo(antes.modo)} → ${rotuloDoModo(dia.modo)}`]
      : [`${nome}: horário ou pausa`];
  });
}

// A semana de trabalho do membro: em cada dia ele acompanha o horário
// da barbearia, tem o próprio, ou folga. O horário próprio é recortado
// no da barbearia pela API — não atende com a porta fechada. Cada dia de
// trabalho pode ter a pausa do almoço (painel v2, marco 3).
//
// Um dia por linha, e tocar abre a folha do dia (redesenho dos
// detalhes, PR 6; decisão 4 do canvas): eram três pílulas por dia, que
// quebravam, e a semana passava de 1.300px no celular.
export function JornadaDoMembro({ membroId }: { membroId: string }) {
  const api = useApiDoPainel();
  const salva = useRequisicao(() => api.barbeiro.jornada(membroId), [membroId]);
  // As horas da barbearia, só pro resumo de quem acompanha o horário
  // dela. Sem elas (ainda carregando, ou erro), a linha sai sem as horas.
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  const [semana, setSemana] = useState<DiaDaJornada[]>([]);
  const [pausaDeSempre, setPausaDeSempre] = useState(PAUSA_PADRAO);
  const [erro, setErro] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  const [diaAberto, setDiaAberto] = useState<number | null>(null);
  const [pausaAbertaNaFolha, setPausaAbertaNaFolha] = useState(false);

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

  function horarioDo(diaSemana: number): HorarioSerializado | undefined {
    return horarios.dados?.find((horario) => horario.diaSemana === diaSemana);
  }

  function usarDia(novo: DiaDaJornada) {
    setErro(undefined);
    setConfirmacao(undefined);
    setSemana((atual) => atual.map((dia) => (dia.diaSemana === novo.diaSemana ? novo : dia)));
  }

  // A pausa de sempre em todo dia de trabalho; a folga fica sem.
  function aplicarPausa(pausa: { inicio: string; fim: string }) {
    setErro(undefined);
    setConfirmacao(undefined);
    setPausaDeSempre(pausa);
    setSemana((atual) =>
      atual.map((dia) => (dia.modo === "folga" ? dia : { ...dia, pausaInicio: pausa.inicio, pausaFim: pausa.fim }))
    );
  }

  async function salvar() {
    setErro(undefined);
    setConfirmacao(undefined);

    for (const dia of semana) {
      const problema = erroDoDia(dia);
      if (problema) {
        setErro(problema);
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

  const algumaPausa = semana.some((dia) => dia.modo !== "folga" && temPausa(dia));
  const aberto = diaAberto === null ? undefined : semana.find((dia) => dia.diaSemana === diaAberto);

  // A barra fica fora das duas seções, filha do invólucro da aba: dentro
  // da Jornada ela deixaria de ficar presa ao rolar até a Pausa.
  return (
    <div className={estilos.jornada}>
      <Grupo
        titulo="Jornada"
        descricao="Em que dias e horários a pessoa atende. O horário próprio vale só dentro do horário da barbearia; na pausa, ninguém marca com ela."
      >
        {!salva.dados ? <Carregando compacto /> : null}
        {semana.length > 0 ? (
          <ul className={estilos.cartao}>
            {semana.map((dia) => (
              <li key={dia.diaSemana}>
                <button type="button" className={estilos.linha} onClick={() => setDiaAberto(dia.diaSemana)}>
                  <span className={estilos.texto}>
                    <span className={estilos.nome}>{capitalizar(DIAS[dia.diaSemana].nome)}</span>
                    <span className={estilos.apoio}>{resumoDoDia(dia, horarioDo(dia.diaSemana))}</span>
                  </span>
                  <IconeSeta className={estilos.seta} width={18} height={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Grupo>

      {/* Um atalho pra pausa de todo dia, como a rotina em Horários: a
          pausa de cada dia continua na folha do dia. */}
      {semana.length > 0 ? (
        <Grupo titulo="Pausa">
          <div className={estilos.cartao}>
            <button type="button" className={estilos.linha} onClick={() => setPausaAbertaNaFolha(true)}>
              <span className={estilos.texto}>
                <span className={estilos.nome}>Pausa de sempre</span>
                {/* Sem pausa em nenhum dia, o 12:00–13:00 do padrão daria
                    a entender que há uma. */}
                <span className={estilos.apoio}>
                  {algumaPausa ? `${pausaDeSempre.inicio}–${pausaDeSempre.fim}` : "Nenhum dia tem pausa"}
                </span>
              </span>
              <IconeSeta className={estilos.seta} width={18} height={18} aria-hidden="true" />
            </button>
          </div>
        </Grupo>
      ) : null}

      {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}

      {aberto ? (
        <FolhaDoDia
          membroId={membroId}
          dia={aberto}
          horario={horarioDo(aberto.diaSemana)}
          pausaDeSempre={pausaDeSempre}
          aoUsar={usarDia}
          aoFechar={() => setDiaAberto(null)}
        />
      ) : null}

      {pausaAbertaNaFolha ? (
        <FolhaDaPausa
          pausa={pausaDeSempre}
          aoAplicar={aplicarPausa}
          aoFechar={() => setPausaAbertaNaFolha(false)}
        />
      ) : null}

      {/* Um Salvar só, na barra do pé: o que mudou, Descartar e o erro
          (da validação ou da API) junto do botão. */}
      <BarraDeMudancas
        mudancas={gravada && mudou ? oQueMudou(gravada, semana) : []}
        aviso={erro}
        salvando={salvando}
        aoSalvar={() => void salvar()}
        aoDescartar={descartar}
      />
    </div>
  );
}

// A folha de um dia: o modo nos rádios e, logo abaixo, as horas do
// próprio e a pausa. O rascunho é da folha: só o "Usar esta" leva pra
// semana, e fechar pelo X ou pelo fundo desiste. As horas e a pausa só
// são limpas ao usar, pra ir e voltar entre os modos sem perder o que
// foi digitado.
function FolhaDoDia({
  membroId,
  dia,
  horario,
  pausaDeSempre,
  aoUsar,
  aoFechar,
}: {
  membroId: string;
  dia: DiaDaJornada;
  horario: HorarioSerializado | undefined;
  pausaDeSempre: { inicio: string; fim: string };
  aoUsar: (dia: DiaDaJornada) => void;
  aoFechar: () => void;
}) {
  const id = useId();
  const { nome, em } = DIAS[dia.diaSemana];
  const titulo = `Jornada ${em} ${nome}`;
  const [modo, setModo] = useState<ModoJornada>(dia.modo);
  const [horaInicio, setHoraInicio] = useState(dia.horaInicio ?? "");
  const [horaFim, setHoraFim] = useState(dia.horaFim ?? "");
  const [comPausa, setComPausa] = useState(pausaAberta(dia));
  const [pausaInicio, setPausaInicio] = useState(dia.pausaInicio ?? "");
  const [pausaFim, setPausaFim] = useState(dia.pausaFim ?? "");
  const [erro, setErro] = useState<string | undefined>();
  const horasDela = horasDaBarbearia(horario);

  // O dia como fica: a partir do original (mesmas chaves, na mesma
  // ordem), pra que abrir e usar sem mexer não conte como mudança.
  function montar(): DiaDaJornada {
    const proprio = modo === "proprio";
    const pausa = modo !== "folga" && comPausa;
    return {
      ...dia,
      modo,
      horaInicio: proprio ? horaInicio || null : null,
      horaFim: proprio ? horaFim || null : null,
      pausaInicio: pausa ? pausaInicio || null : null,
      pausaFim: pausa ? pausaFim || null : null,
    };
  }

  return (
    <Folha titulo={titulo} aoFechar={aoFechar} focoInicial="input[type=radio]:checked">
      {(fechar) => (
        <>
          <fieldset className={estilosDaFolha.opcoes}>
            <legend className={estilosDaFolha.legenda}>{titulo}</legend>
            {MODOS.map((opcao) => (
              <label key={opcao.valor} className={estilosDaFolha.opcao}>
                <input
                  type="radio"
                  name={`jornada-${membroId}-${dia.diaSemana}`}
                  value={opcao.valor}
                  checked={opcao.valor === modo}
                  onChange={() => {
                    setModo(opcao.valor);
                    setErro(undefined);
                  }}
                  className={estilosDaFolha.radio}
                  aria-describedby={opcao.valor === "barbearia" && horasDela ? `${id}-horas` : undefined}
                />
                <span className={estilosDaFolha.marca} aria-hidden="true" />
                <span className={estilosDaFolha.rotulo}>
                  {opcao.rotulo}
                  {/* Fora do nome do rádio (aria-hidden), mas lido como
                      descrição dele. */}
                  {opcao.valor === "barbearia" && horasDela ? (
                    <span id={`${id}-horas`} className={estilos.horasDaOpcao} aria-hidden="true">
                      {horasDela}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>

          {modo === "proprio" ? (
            <div className={estilos.faixa}>
              <Campo
                rotulo="Entrada"
                type="time"
                aria-label={`Entrada ${em} ${nome}`}
                valor={horaInicio}
                onChange={(valor) => {
                  setHoraInicio(valor);
                  setErro(undefined);
                }}
              />
              <Campo
                rotulo="Saída"
                type="time"
                aria-label={`Saída ${em} ${nome}`}
                valor={horaFim}
                onChange={(valor) => {
                  setHoraFim(valor);
                  setErro(undefined);
                }}
              />
            </div>
          ) : null}

          {modo === "folga" ? null : comPausa ? (
            <div className={estilos.faixa}>
              <Campo
                rotulo="Pausa"
                type="time"
                aria-label={`Início da pausa ${em} ${nome}`}
                valor={pausaInicio}
                onChange={(valor) => {
                  setPausaInicio(valor);
                  setErro(undefined);
                }}
              />
              <Campo
                rotulo="até"
                type="time"
                aria-label={`Fim da pausa ${em} ${nome}`}
                valor={pausaFim}
                onChange={(valor) => {
                  setPausaFim(valor);
                  setErro(undefined);
                }}
              />
              <Botao
                variante="fantasma"
                aria-label={`Tirar pausa ${em} ${nome}`}
                onClick={() => {
                  setComPausa(false);
                  setErro(undefined);
                }}
              >
                Tirar pausa
              </Botao>
            </div>
          ) : (
            <div className={estilos.adicionar}>
              <Botao
                variante="fantasma"
                aria-label={`Adicionar pausa ${em} ${nome}`}
                onClick={() => {
                  setComPausa(true);
                  setPausaInicio(pausaInicio || pausaDeSempre.inicio);
                  setPausaFim(pausaFim || pausaDeSempre.fim);
                }}
              >
                + Pausa
              </Botao>
            </div>
          )}

          {erro ? <Aviso>{erro}</Aviso> : null}

          <div className={estilosDaFolha.usar}>
            <Botao
              type="button"
              onClick={() => {
                const novo = montar();
                const problema = erroDoDia(novo);
                if (problema) {
                  setErro(problema);
                  return;
                }
                aoUsar(novo);
                fechar();
              }}
            >
              Usar esta
            </Botao>
          </div>
        </>
      )}
    </Folha>
  );
}

// A folha da pausa de sempre: as duas horas e o "Aplicar", que põe a
// pausa em todo dia de trabalho (a folga fica sem).
function FolhaDaPausa({
  pausa,
  aoAplicar,
  aoFechar,
}: {
  pausa: { inicio: string; fim: string };
  aoAplicar: (pausa: { inicio: string; fim: string }) => void;
  aoFechar: () => void;
}) {
  const [inicio, setInicio] = useState(pausa.inicio);
  const [fim, setFim] = useState(pausa.fim);
  const [erro, setErro] = useState<string | undefined>();

  return (
    <Folha
      titulo="Pausa de sempre"
      apoio="Vai pra todo dia de trabalho; a folga fica sem. Depois, cada dia ainda muda a dele."
      aoFechar={aoFechar}
      focoInicial="input"
    >
      {(fechar) => (
        <>
          <div className={estilos.faixa}>
            <Campo
              rotulo="Começa"
              type="time"
              aria-label="Pausa de sempre: início"
              valor={inicio}
              onChange={(valor) => {
                setInicio(valor);
                setErro(undefined);
              }}
            />
            <Campo
              rotulo="Termina"
              type="time"
              aria-label="Pausa de sempre: fim"
              valor={fim}
              onChange={(valor) => {
                setFim(valor);
                setErro(undefined);
              }}
            />
          </div>
          {erro ? <Aviso>{erro}</Aviso> : null}
          <div className={estilosDaFolha.usar}>
            <Botao
              type="button"
              onClick={() => {
                if (!inicio || !fim || inicio >= fim) {
                  setErro("A pausa de sempre precisa começar antes de terminar.");
                  return;
                }
                aoAplicar({ inicio, fim });
                fechar();
              }}
            >
              Aplicar aos dias de trabalho
            </Botao>
          </div>
        </>
      )}
    </Folha>
  );
}
