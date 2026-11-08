"use client";

import { useId, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { DiaDaJornada, FaixaDePausa, HorarioSerializado, ModoJornada } from "@barchop/types";
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
import estilosDoCampo from "../../componentes/Campo.module.css";
import estilosDaFolha from "../../componentes/FolhaDeEscolha.module.css";
import { pausasDe, temPausa, textoDasPausas } from "./pausa";
import { Carregando } from "../../componentes/Carregando";

// A pausa que o "+ Pausa" e as "Pausas de sempre" usam quando a pessoa
// ainda não tem nenhuma: o almoço mais comum.
const PAUSA_PADRAO: FaixaDePausa = { inicio: "12:00", fim: "13:00" };

// O dia como a tela guarda e manda: só as `pausas`, sem os campos da
// pausa única de antes. Com `pausaInicio`/`pausaFim` no corpo, a API
// trataria o PUT como da web antiga (routers/equipe.ts).
function paraTela(dia: DiaDaJornada): DiaDaJornada {
  return {
    diaSemana: dia.diaSemana,
    modo: dia.modo,
    horaInicio: dia.horaInicio,
    horaFim: dia.horaFim,
    pausas: pausasDe(dia).map((pausa) => ({ inicio: pausa.inicio, fim: pausa.fim })),
  };
}

// As pausas de sempre nascem das do primeiro dia salvo que tem pausa.
function pausasDaSemana(semana: DiaDaJornada[]): FaixaDePausa[] {
  const dia = semana.find(temPausa);
  return dia ? pausasDe(dia).map((pausa) => ({ ...pausa })) : [{ ...PAUSA_PADRAO }];
}

// "HH:mm" compara como texto na ordem do relógio.
function emOrdem(pausas: FaixaDePausa[]): FaixaDePausa[] {
  return [...pausas].sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
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

function barbeariaAberta(horario: HorarioSerializado | undefined): horario is HorarioSerializado & {
  horaAbertura: string;
  horaFechamento: string;
} {
  return !!horario && !horario.fechado && !!horario.horaAbertura && !!horario.horaFechamento;
}

// As horas da barbearia num dia: "09:00–18:00", ou que ela fecha.
function horasDaBarbearia(horario: HorarioSerializado | undefined): string | undefined {
  if (!horario) return undefined;
  if (!barbeariaAberta(horario)) return "barbearia fechada";
  return `${horario.horaAbertura}–${horario.horaFechamento}`;
}

// O resumo da linha do dia: "Horário próprio · 13:00–18:00 · pausas
// 12:00–13:00 e 16:00–16:15", "Folga". As horas da barbearia só quando
// já chegaram: a linha não espera por elas.
function resumoDoDia(dia: DiaDaJornada, horario: HorarioSerializado | undefined): string {
  const partes = [rotuloDoModo(dia.modo)];
  if (dia.modo === "barbearia") {
    const horas = horasDaBarbearia(horario);
    if (horas) partes.push(horas);
  }
  if (dia.modo === "proprio" && dia.horaInicio && dia.horaFim) {
    partes.push(`${dia.horaInicio}–${dia.horaFim}`);
  }
  const pausas = pausasDe(dia);
  if (pausas.length > 0) {
    partes.push(`${pausas.length > 1 ? "pausas" : "pausa"} ${textoDasPausas(pausas)}`);
  }
  return partes.join(" · ");
}

// As mesmas recusas da API, antes dela: as duas horas, o começo antes
// do fim e nenhuma cruzando a outra (encostar pode).
function erroDasPausas(nome: string, pausas: FaixaDePausa[]): string | undefined {
  if (pausas.some((pausa) => !pausa.inicio || !pausa.fim)) return `${nome}: informe o começo e o fim da pausa.`;
  if (pausas.some((pausa) => pausa.inicio >= pausa.fim)) return `${nome}: a pausa precisa começar antes de terminar.`;
  const ordenadas = emOrdem(pausas);
  for (let i = 1; i < ordenadas.length; i += 1) {
    const antes = ordenadas[i - 1]!;
    const depois = ordenadas[i]!;
    if (depois.inicio < antes.fim) {
      return `${nome}: as pausas ${antes.inicio}–${antes.fim} e ${depois.inicio}–${depois.fim} se cruzam.`;
    }
  }
  return undefined;
}

// A mesma regra da API pras horas: as duas, e a entrada antes da saída.
// Vale na folha do dia e de novo no Salvar.
function erroDoDia(dia: DiaDaJornada): string | undefined {
  const nome = capitalizar(DIAS[dia.diaSemana].nome);
  const daPausa = erroDasPausas(nome, pausasDe(dia));
  if (daPausa) return daPausa;
  if (dia.modo !== "proprio") return undefined;
  if (!dia.horaInicio || !dia.horaFim) return `${nome}: informe a entrada e a saída do horário próprio.`;
  if (dia.horaInicio >= dia.horaFim) return `${nome}: a entrada precisa ser antes da saída.`;
  return undefined;
}

// O que a barra de salvar diz: "Segunda: Horário da barbearia → Folga",
// ou só que o horário ou as pausas do dia mudaram.
function oQueMudou(gravada: DiaDaJornada[], semana: DiaDaJornada[]): string[] {
  return semana.flatMap((dia) => {
    const antes = gravada.find((outro) => outro.diaSemana === dia.diaSemana);
    if (!antes || JSON.stringify(antes) === JSON.stringify(dia)) return [];
    const nome = capitalizar(DIAS[dia.diaSemana].nome);
    return antes.modo !== dia.modo
      ? [`${nome}: ${rotuloDoModo(antes.modo)} → ${rotuloDoModo(dia.modo)}`]
      : [`${nome}: horário ou pausas`];
  });
}

// A janela em que o dia atende, pro aviso da pausa fora do horário: a
// da barbearia, ou a própria recortada nela, como a API faz
// (janelaEfetiva). Sem as horas da barbearia ainda, nenhum aviso.
function janelaDoDia(
  modo: ModoJornada,
  horaInicio: string,
  horaFim: string,
  horario: HorarioSerializado | undefined
): { abre: string; fecha: string } | null {
  if (modo === "folga" || !barbeariaAberta(horario)) return null;
  if (modo === "barbearia") return { abre: horario.horaAbertura, fecha: horario.horaFechamento };
  if (!horaInicio || !horaFim || horaInicio >= horaFim) return null;
  const abre = horaInicio > horario.horaAbertura ? horaInicio : horario.horaAbertura;
  const fecha = horaFim < horario.horaFechamento ? horaFim : horario.horaFechamento;
  return abre < fecha ? { abre, fecha } : null;
}

// Pausa fora do horário do dia é aceita (decisão do dono, 08/11): não
// tem efeito, ou só a parte de dentro tem. O aviso diz isso.
function avisoDaPausa(pausa: FaixaDePausa, janela: { abre: string; fecha: string } | null): string | undefined {
  if (!janela || !pausa.inicio || !pausa.fim || pausa.inicio >= pausa.fim) return undefined;
  const faixa = `${pausa.inicio}–${pausa.fim}`;
  const doDia = `${janela.abre}–${janela.fecha}`;
  if (pausa.fim <= janela.abre || pausa.inicio >= janela.fecha) {
    return `${faixa} fica fora do horário deste dia (${doDia}): não muda nada na agenda.`;
  }
  if (pausa.inicio < janela.abre || pausa.fim > janela.fecha) {
    return `${faixa} passa do horário deste dia (${doDia}): só vale a parte de dentro.`;
  }
  return undefined;
}

// A semana de trabalho do membro: em cada dia ele acompanha o horário
// da barbearia, tem o próprio, ou folga. O horário próprio é recortado
// no da barbearia pela API — não atende com a porta fechada. Cada dia de
// trabalho tem quantas pausas a pessoa precisar (painel v2, marco 3;
// várias desde 08/11).
//
// Um dia por linha, e tocar abre a folha do dia (redesenho dos
// detalhes, PR 6; decisão 4 do canvas): eram três pílulas por dia, que
// quebravam, e a semana passava de 1.300px no celular.
export function JornadaDoMembro({ membroId }: { membroId: string }) {
  const api = useApiDoPainel();
  const salva = useRequisicao(() => api.barbeiro.jornada(membroId), [membroId]);
  // As horas da barbearia, pro resumo de quem acompanha o horário dela e
  // pro aviso da pausa fora do horário. Sem elas (ainda carregando, ou
  // erro), a linha sai sem as horas e a folha, sem o aviso.
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  const [semana, setSemana] = useState<DiaDaJornada[]>([]);
  const [pausasDeSempre, setPausasDeSempre] = useState<FaixaDePausa[]>([{ ...PAUSA_PADRAO }]);
  const [erro, setErro] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);
  const [diaAberto, setDiaAberto] = useState<number | null>(null);
  const [pausasAbertas, setPausasAbertas] = useState(false);

  // Sincronizado durante a renderização, como em CadastroDeServico: um
  // efeito deixaria a semana vazia aparecer por um quadro. `vista` é a
  // última resposta do GET; `gravada`, o que está no banco, que o Salvar
  // também troca — com uma só, a tela voltava pra semana de antes logo
  // depois de salvar (ver ServicosDoMembro).
  const [vista, setVista] = useState<DiaDaJornada[] | null>(null);
  const [gravada, setGravada] = useState<DiaDaJornada[] | null>(null);
  if (salva.dados && salva.dados !== vista) {
    const naTela = salva.dados.map(paraTela);
    setVista(salva.dados);
    setGravada(naTela);
    setSemana(naTela);
    setPausasDeSempre(pausasDaSemana(naTela));
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

  // As pausas de sempre em todo dia de trabalho, no lugar das de cada
  // dia; a folga fica sem.
  function aplicarPausas(pausas: FaixaDePausa[]) {
    setErro(undefined);
    setConfirmacao(undefined);
    setPausasDeSempre(pausas);
    setSemana((atual) =>
      atual.map((dia) => (dia.modo === "folga" ? dia : { ...dia, pausas: pausas.map((pausa) => ({ ...pausa })) }))
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
      const resposta = (await api.barbeiro.salvarJornada(membroId, semana)).map(paraTela);
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
    setPausasDeSempre(pausasDaSemana(gravada));
  }

  const algumaPausa = semana.some(temPausa);
  const aberto = diaAberto === null ? undefined : semana.find((dia) => dia.diaSemana === diaAberto);

  // A barra fica fora das duas seções, filha do invólucro da aba: dentro
  // da Jornada ela deixaria de ficar presa ao rolar até as Pausas.
  return (
    <div className={estilos.jornada}>
      <Grupo
        titulo="Jornada"
        descricao="Em que dias e horários a pessoa atende. O horário próprio vale só dentro do horário da barbearia; nas pausas, ninguém marca com ela."
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

      {/* Um atalho pras pausas de todo dia, como a rotina em Horários: as
          pausas de cada dia continuam na folha do dia. */}
      {semana.length > 0 ? (
        <Grupo titulo="Pausas">
          <div className={estilos.cartao}>
            <button type="button" className={estilos.linha} onClick={() => setPausasAbertas(true)}>
              <span className={estilos.texto}>
                <span className={estilos.nome}>Pausas de sempre</span>
                {/* Sem pausa em nenhum dia, o 12:00–13:00 do padrão daria
                    a entender que há uma. */}
                <span className={estilos.apoio}>
                  {algumaPausa && pausasDeSempre.length > 0 ? textoDasPausas(pausasDeSempre) : "Nenhum dia tem pausa"}
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
          primeiraPausa={pausasDeSempre[0] ?? PAUSA_PADRAO}
          aoUsar={usarDia}
          aoFechar={() => setDiaAberto(null)}
        />
      ) : null}

      {pausasAbertas ? (
        <FolhaDasPausas pausas={pausasDeSempre} aoAplicar={aplicarPausas} aoFechar={() => setPausasAbertas(false)} />
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

// As pausas em edição, uma linha cada: começo, fim e "Tirar"; embaixo,
// o "+ Pausa" (ou "+ Outra pausa"), sem limite. `quando` entra no nome
// acessível de cada controle ("na sexta", "de sempre"). A primeira pausa
// nasce da `primeira`; as outras, vazias.
function LinhasDePausa({
  pausas,
  quando,
  janela,
  primeira,
  titulo,
  rotulo,
  aoMudar,
}: {
  pausas: FaixaDePausa[];
  quando: string;
  janela: { abre: string; fecha: string } | null;
  primeira: FaixaDePausa;
  titulo?: string;
  rotulo?: string;
  aoMudar: (pausas: FaixaDePausa[]) => void;
}) {
  const id = useId();

  function trocar(posicao: number, campo: keyof FaixaDePausa, valor: string) {
    aoMudar(pausas.map((pausa, i) => (i === posicao ? { ...pausa, [campo]: valor } : pausa)));
  }

  return (
    <div className={titulo ? `${estilos.pausas} ${estilos.pausasDoDia}` : estilos.pausas}>
      {titulo ? (
        <h3 id={`${id}-titulo`} className={estilos.tituloDasPausas}>
          {titulo}
        </h3>
      ) : null}
      {pausas.length > 0 ? (
        <ul
          className={estilos.listaDePausas}
          aria-labelledby={titulo ? `${id}-titulo` : undefined}
          aria-label={titulo ? undefined : rotulo}
        >
          {pausas.map((pausa, i) => {
            const aviso = avisoDaPausa(pausa, janela);
            return (
              <li key={i} className={estilos.pausa}>
                <div className={estilos.horasDaPausa}>
                  <input
                    type="time"
                    className={`${estilosDoCampo.entrada} ${estilos.hora}`}
                    aria-label={`Início da pausa ${i + 1} ${quando}`}
                    value={pausa.inicio}
                    onChange={(evento) => trocar(i, "inicio", evento.target.value)}
                  />
                  <span aria-hidden="true" className={estilos.ate}>
                    –
                  </span>
                  <input
                    type="time"
                    className={`${estilosDoCampo.entrada} ${estilos.hora}`}
                    aria-label={`Fim da pausa ${i + 1} ${quando}`}
                    value={pausa.fim}
                    onChange={(evento) => trocar(i, "fim", evento.target.value)}
                  />
                  <Botao
                    variante="fantasma"
                    aria-label={`Tirar a pausa ${i + 1} ${quando}`}
                    onClick={() => aoMudar(pausas.filter((_, j) => j !== i))}
                  >
                    Tirar
                  </Botao>
                </div>
                {aviso ? <Aviso tom="atencao">{aviso}</Aviso> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={estilos.adicionar}>
        <Botao
          variante="fantasma"
          aria-label={pausas.length === 0 ? `Adicionar pausa ${quando}` : `Adicionar outra pausa ${quando}`}
          onClick={() => aoMudar([...pausas, pausas.length === 0 ? { ...primeira } : { inicio: "", fim: "" }])}
        >
          {pausas.length === 0 ? "+ Pausa" : "+ Outra pausa"}
        </Botao>
      </div>
    </div>
  );
}

// A folha de um dia: o modo nos rádios e, logo abaixo, as horas do
// próprio e as pausas. O rascunho é da folha: só o "Usar esta" leva pra
// semana, e fechar pelo X ou pelo fundo desiste. As horas e as pausas só
// são limpas ao usar, pra ir e voltar entre os modos sem perder o que
// foi digitado.
function FolhaDoDia({
  membroId,
  dia,
  horario,
  primeiraPausa,
  aoUsar,
  aoFechar,
}: {
  membroId: string;
  dia: DiaDaJornada;
  horario: HorarioSerializado | undefined;
  primeiraPausa: FaixaDePausa;
  aoUsar: (dia: DiaDaJornada) => void;
  aoFechar: () => void;
}) {
  const id = useId();
  const { nome, em } = DIAS[dia.diaSemana];
  const titulo = `Jornada ${em} ${nome}`;
  const [modo, setModo] = useState<ModoJornada>(dia.modo);
  const [horaInicio, setHoraInicio] = useState(dia.horaInicio ?? "");
  const [horaFim, setHoraFim] = useState(dia.horaFim ?? "");
  const [pausas, setPausas] = useState<FaixaDePausa[]>(pausasDe(dia).map((pausa) => ({ ...pausa })));
  const [erro, setErro] = useState<string | undefined>();
  const horasDela = horasDaBarbearia(horario);

  // O dia como fica: a partir do original (mesmas chaves, na mesma
  // ordem), pra que abrir e usar sem mexer não conte como mudança. As
  // pausas em ordem de início, como a API devolve.
  function montar(): DiaDaJornada {
    const proprio = modo === "proprio";
    return {
      ...dia,
      modo,
      horaInicio: proprio ? horaInicio || null : null,
      horaFim: proprio ? horaFim || null : null,
      pausas: modo === "folga" ? [] : emOrdem(pausas),
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

          {modo === "folga" ? null : (
            <LinhasDePausa
              titulo="Pausas"
              pausas={pausas}
              quando={`${em} ${nome}`}
              janela={janelaDoDia(modo, horaInicio, horaFim, horario)}
              primeira={primeiraPausa}
              aoMudar={(novas) => {
                setPausas(novas);
                setErro(undefined);
              }}
            />
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

// A folha das pausas de sempre: a lista e o "Aplicar", que a põe em todo
// dia de trabalho no lugar das de cada dia (a folga fica sem).
function FolhaDasPausas({
  pausas: iniciais,
  aoAplicar,
  aoFechar,
}: {
  pausas: FaixaDePausa[];
  aoAplicar: (pausas: FaixaDePausa[]) => void;
  aoFechar: () => void;
}) {
  const [pausas, setPausas] = useState<FaixaDePausa[]>(iniciais.map((pausa) => ({ ...pausa })));
  const [erro, setErro] = useState<string | undefined>();

  return (
    <Folha
      titulo="Pausas de sempre"
      apoio="Vão pra todo dia de trabalho, no lugar das pausas de cada dia; a folga fica sem. Depois, cada dia ainda muda as dele."
      aoFechar={aoFechar}
      focoInicial="input, button"
    >
      {(fechar) => (
        <>
          <LinhasDePausa
            rotulo="Pausas de sempre"
            pausas={pausas}
            quando="de sempre"
            janela={null}
            primeira={PAUSA_PADRAO}
            aoMudar={(novas) => {
              setPausas(novas);
              setErro(undefined);
            }}
          />
          {erro ? <Aviso>{erro}</Aviso> : null}
          <div className={estilosDaFolha.usar}>
            <Botao
              type="button"
              onClick={() => {
                const problema = erroDasPausas("Pausas de sempre", pausas);
                if (problema) {
                  setErro(problema);
                  return;
                }
                aoAplicar(emOrdem(pausas));
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
