"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AgendamentoComCliente } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { GradeDeTempo } from "../../componentes/GradeDeTempo";
import { GradeDoMes } from "../../componentes/GradeDoMes";
import { PilulasDeFiltro } from "../../componentes/PilulasDeFiltro";
import { SeletorDeVista, type Vista } from "../../componentes/SeletorDeVista";
import { useRequisicao } from "../../api/useRequisicao";
import { ehPassado, formatarDataLonga, hojeIso, horaJaPassou } from "../../formato/datas";
import type { DestinoDoArrasto } from "../../painel/arrasto";
import { diasDaSemana, gradeDeTempo, gradeDoMes } from "../../painel/grade";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { useAgora } from "../../painel/useAgora";
import { CONSULTA_DO_CELULAR, useTelaDeCelular } from "../../painel/useTelaDeCelular";
import { BarraDaAgendaNoCelular } from "./agenda/BarraDaAgendaNoCelular";
import { JanelaDaData } from "./agenda/JanelaDaData";
import { JanelaDeBloqueio } from "./agenda/JanelaDeBloqueio";
import { JanelaDeMover } from "./agenda/JanelaDeMover";
import { ListaDaAgenda } from "./agenda/ListaDaAgenda";
import { MenuDaAgenda } from "./agenda/MenuDaAgenda";
import { ResumoDoPeriodo } from "./agenda/ResumoDoPeriodo";
import estilos from "./Agenda.module.css";
import { Carregando } from "../../componentes/Carregando";

const VISTAS: Vista[] = ["lista", "dia", "3dias", "semana", "mes"];

// O valor da pílula "Todos": não é id de ninguém, e some da URL.
const TODOS = "todos";

// Quantos dias a lista mostra de cada vez (agenda no celular, PR 2).
export const DIAS_DA_LISTA = 14;

// A última vista escolhida, neste aparelho: vale quando a URL não diz.
const CHAVE_DA_VISTA = "barchop.agenda.vista";

function ehVista(bruta: string | null): bruta is Vista {
  return VISTAS.includes(bruta as Vista);
}

// Sem `vista` na URL: a última escolhida aqui; senão, a lista no celular
// e a semana no desktop. O `?.` do matchMedia deixa o jsdom no desktop.
// O armazenamento pode faltar ou recusar (aba anônima): cai no padrão.
function vistaPadrao(): Vista {
  if (typeof window === "undefined") return "semana";
  try {
    const guardada = window.localStorage.getItem(CHAVE_DA_VISTA);
    if (ehVista(guardada)) return guardada;
  } catch {
    // sem armazenamento: segue pro padrão da tela
  }
  return window.matchMedia?.(CONSULTA_DO_CELULAR).matches ? "lista" : "semana";
}

function guardarVista(vista: Vista) {
  try {
    window.localStorage.setItem(CHAVE_DA_VISTA, vista);
  } catch {
    // sem armazenamento: a escolha vale só nesta visita
  }
}

function lerVista(bruta: string | null, padrao: Vista): Vista {
  // Vista desconhecida cai no padrão em silêncio, como a leitura do tema
  // faz: a URL é digitável, e um valor estranho não pode quebrar a tela.
  return ehVista(bruta) ? bruta : padrao;
}

// Quanto as setas andam em cada vista (o mês anda por mês).
const PASSO_EM_DIAS: Record<Exclude<Vista, "mes">, number> = {
  lista: DIAS_DA_LISTA,
  dia: 1,
  "3dias": 3,
  semana: 7,
};

function nomeDoMes(data: string): string {
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
    new Date(`${data}T12:00:00Z`)
  );
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function diaCurto(data: string): string {
  const mes = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(new Date(`${data}T12:00:00Z`))
    .replace(".", "");
  return `${Number(data.slice(8))} ${mes}`;
}

function diasSeguidos(data: string, quantos: number): string[] {
  return Array.from({ length: quantos }, (_, i) => somarDias(data, i));
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function somarMeses(data: string, meses: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  const diaOriginal = d.getUTCDate();
  // Prende ao dia 1 antes de andar: 31 de janeiro + 1 mês daria 3 de
  // março, porque fevereiro não tem 31.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(diaOriginal, ultimo));
  return d.toISOString().slice(0, 10);
}

// `agora` por parâmetro, como toda tela que olhe relógio: teste que
// compara data fixa com o relógio real falha sozinho depois. Sem ele, o
// instante vem do `useAgora`, que vira a cada minuto — a régua tem que
// andar com a aba aberta.
export function Agenda({ agora: agoraFixo }: { agora?: Date }) {
  const agora = useAgora(agoraFixo);
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();

  // Presa na montagem: o padrão não troca no meio da visita, e a vista
  // se resolve antes da primeira busca (nada de buscar a semana e depois
  // a lista).
  const [padrao] = useState(vistaPadrao);
  // No celular, a barra do Google Agenda (☰ · título ▾ · ‹ › · Hoje)
  // no lugar do seletor do desktop (agenda no celular, PR 3).
  const celular = useTelaDeCelular();
  const [comMenu, setComMenu] = useState(false);
  const [escolhendoData, setEscolhendoData] = useState(false);
  const vista = lerVista(query.get("vista"), padrao);
  const data = query.get("data") ?? hojeIso(agora);

  const semana = diasDaSemana(data);
  const tresDias = diasSeguidos(data, 3);
  // "Mostrar mais 14 dias" estica a lista; preso à data de onde ela
  // começa, andar com as setas volta aos 14 sem efeito nem busca a mais.
  const [maisDias, setMaisDias] = useState({ de: data, dias: 0 });
  const extras = maisDias.de === data ? maisDias.dias : 0;
  const diasDaLista = diasSeguidos(data, DIAS_DA_LISTA + extras);
  // Os dias da grade de tempo (a lista e o mês têm a sua).
  const diasDaGrade = vista === "dia" ? [data] : vista === "3dias" ? tresDias : semana;
  // Semana e 3 dias: vários dias lado a lado, com o mesmo filtro e o
  // expediente buscado dia a dia.
  const variosDias = vista === "semana" || vista === "3dias";
  const mes = data.slice(0, 7);

  // Um caminho de dados só, com os limites variando por vista. O mês pede
  // a grade INTEIRA, e não o mês civil: as células de borda mostram
  // agendamentos dos meses vizinhos, e buscar só o mês civil as deixaria
  // falsamente vazias.
  //
  // As listas vazias aqui são de propósito — os limites da grade do mês
  // dependem só do calendário, não dos dados, e esta chamada acontece
  // antes de a busca resolver.
  const bordasDoMes = gradeDoMes({ mes, horarios: [], agendamentos: [] });
  const [de, ate] =
    vista === "dia"
      ? [data, data]
      : vista === "3dias"
        ? [tresDias[0], tresDias[2]]
        : vista === "semana"
          ? [semana[0], semana[6]]
          : vista === "lista"
            ? [diasDaLista[0], diasDaLista[diasDaLista.length - 1]]
            : [bordasDoMes[0].data, bordasDoMes[bordasDoMes.length - 1].data];

  const agendamentos = useRequisicao(
    () => api.barbeiro.agendamentosDoIntervalo(de, ate),
    [de, ate]
  );
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  // A equipe, pra vista de dia: uma coluna por quem atende. O
  // profissional recebe da API só a própria agenda — pra ele não há o que
  // dividir. Os bloqueios entram como faixas na coluna de cada um.
  const { perfil, nomeDaBarbearia } = usePainel();
  const daEquipe = perfil.papel !== "profissional";
  // A equipe dá também o filtro por profissional, que vale em toda vista.
  const comEquipe = daEquipe;
  const equipe = useRequisicao(
    () => (comEquipe ? api.barbeiro.equipe() : Promise.resolve([])),
    [comEquipe]
  );
  // Na semana também: a folga de cada um o tira de quem pode atender. Na
  // lista, os bloqueios entram entre os cartões. Só o mês fica sem.
  const bloqueios = useRequisicao(
    () => (vista === "mes" ? Promise.resolve([]) : api.barbeiro.bloqueios(de, ate)),
    [vista, de, ate]
  );
  // O expediente de cada um (janela e pausa), pra sombrear o fechado e
  // não oferecer horário livre no almoço. Vem da ocupação, que já faz a
  // conta da API. Falhou, a grade segue só o horário da casa — a agenda
  // não cai por um dado de apoio.
  const ocupacao = useRequisicao(
    () => (vista === "dia" ? api.barbeiro.ocupacaoDoDia(data) : Promise.resolve(null)),
    [vista, data]
  );
  // Na semana e nos 3 dias, o mesmo expediente, dia a dia: uma consulta
  // da rota do dia por coluna, em vez de uma rota de período só pra isto.
  // Presa ao primeiro dia, e não à data: andar dentro da mesma semana não
  // refaz as sete.
  const ocupacaoDaSemana = useRequisicao(
    () =>
      variosDias
        ? Promise.all(diasDaGrade.map((dia) => api.barbeiro.ocupacaoDoDia(dia))).then((dias) =>
            Object.fromEntries(dias.map((dia) => [dia.data, dia.profissionais]))
          )
        : Promise.resolve(null),
    [vista, diasDaGrade[0]]
  );
  const atendentes = (equipe.dados ?? [])
    .filter((membro) => membro.ativo && membro.atende && !membro.convitePendente)
    .map((membro) => ({ id: membro.id, nome: membro.nome }));
  // O filtro por profissional (pedido do dono, 2026-10-11; vários de uma
  // vez desde a agenda no celular, PR 7): ids separados por vírgula em
  // `?profissionais=`; o `?profissional=a` de antes, de links guardados,
  // ainda vale como a lista de um. Só pra quem vê a equipe. Enquanto a
  // equipe não chega, vale o que veio na URL; id que não atende é
  // ignorado, e todos marcados é o mesmo que nenhum — sem filtro.
  const pedidos = (query.get("profissionais") ?? query.get("profissional") ?? "")
    .split(",")
    .filter(Boolean);
  const validos = daEquipe
    ? pedidos.filter((id) => !equipe.dados || atendentes.some((a) => a.id === id))
    : [];
  const filtro =
    validos.length > 0 && !(equipe.dados && validos.length >= atendentes.length)
      ? new Set(validos)
      : undefined;
  // As pílulas no desktop: em toda vista menos o dia, que já tem uma
  // coluna por pessoa (lá o filtro vem do menu do celular).
  const comPilulas = daEquipe && vista !== "dia" && atendentes.length > 1;

  // Com uma pessoa só, a coluna de dia de sempre: dividir por profissional
  // só ocuparia o cabeçalho com um nome que ninguém precisa ler. Com o
  // filtro, só as colunas de quem ficou.
  const profissionais =
    vista === "dia" && atendentes.length > 1
      ? atendentes.filter((a) => !filtro || filtro.has(a.id))
      : undefined;

  function irPara(proxima: Vista, proximaData: string, quem: string[] = filtro ? [...filtro] : []) {
    guardarVista(proxima);
    router.push(
      `/painel/agenda?vista=${proxima}&data=${proximaData}` +
        (quem.length > 0 ? `&profissionais=${quem.join(",")}` : "")
    );
  }

  // "Agora": a régua do agora no centro da grade. Fora de hoje, navega
  // primeiro e rola quando a grade de hoje aparecer.
  const hoje = hojeIso(agora);
  const [rolarQuandoCarregar, setRolarQuandoCarregar] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  // O agendamento solto na grade, esperando a confirmação (arrastar e
  // reordenar, PR 7).
  const [movendo, setMovendo] = useState<{ agendamento: AgendamentoComCliente; destino: DestinoDoArrasto } | null>(
    null
  );
  function rolarAteAgora(): boolean {
    const regua = document.querySelector('[data-testid="regua-do-agora"]');
    regua?.scrollIntoView({ block: "center", behavior: "smooth" });
    return regua !== null;
  }
  function irParaAgora() {
    if (data === hoje) {
      rolarAteAgora();
      return;
    }
    setRolarQuandoCarregar(true);
    irPara(vista, hoje);
  }
  useEffect(() => {
    if (rolarQuandoCarregar && data === hoje && rolarAteAgora()) setRolarQuandoCarregar(false);
  }, [rolarQuandoCarregar, data, hoje, agendamentos.dados]);

  if (agendamentos.erro) {
    return (
      <Aviso>
        {agendamentos.erro.mensagem || "Não foi possível carregar a agenda agora."}
      </Aviso>
    );
  }
  // Sem os horários não há janela de tempo, e a tela ficaria em
  // "Carregando…" para sempre esperando uma resposta que já chegou como
  // erro.
  if (horarios.erro) {
    return (
      <Aviso>
        {horarios.erro.mensagem || "Não foi possível carregar os horários agora."}
      </Aviso>
    );
  }
  if (!agendamentos.dados || !horarios.dados) return <Carregando />;

  // Com o filtro, só os agendamentos e o expediente de quem ficou. Com um
  // expediente só, a coluna da grade é dele — a pausa, as folgas e o
  // horário livre seguem os dele.
  const visiveis = filtro
    ? agendamentos.dados.filter((a) => filtro.has(a.barbeiro.id))
    : agendamentos.dados;
  const expedienteDaSemana =
    ocupacaoDaSemana.dados && filtro
      ? Object.fromEntries(
          Object.entries(ocupacaoDaSemana.dados).map(([dia, deles]) => [
            dia,
            deles.filter((p) => filtro.has(p.id)),
          ])
        )
      : (ocupacaoDaSemana.dados ?? undefined);
  // Quem o filtro deixou, sendo um só: o horário livre já o leva.
  const soUm = filtro?.size === 1 ? [...filtro][0] : undefined;
  // Um tom por profissional, igual na grade e no mês. Com um só, a cor
  // da casa.
  const tons =
    atendentes.length > 1
      ? Object.fromEntries(atendentes.map((pessoa, indice) => [pessoa.id, indice % 6]))
      : undefined;
  // Liga ou desliga uma pessoa no filtro; todos ligados volta a nenhum.
  function alternar(quem: string) {
    if (quem === TODOS) return irPara(vista, data, []);
    const atual = filtro ? [...filtro] : [];
    const proximo = atual.includes(quem) ? atual.filter((id) => id !== quem) : [...atual, quem];
    irPara(vista, data, proximo.length >= atendentes.length ? [] : proximo);
  }
  // As caixinhas do menu: desmarcar tira a pessoa, e todos marcados é
  // sem filtro. Partem de todo mundo, ao contrário das pílulas, que
  // partem de Todos.
  function alternarCaixa(quem: string) {
    const atual = filtro ? [...filtro] : atendentes.map((a) => a.id);
    const proximo = atual.includes(quem) ? atual.filter((id) => id !== quem) : [...atual, quem];
    if (proximo.length === 0) return;
    irPara(vista, data, proximo.length >= atendentes.length ? [] : proximo);
  }
  function andar(passos: number) {
    irPara(vista, vista === "mes" ? somarMeses(data, passos) : somarDias(data, passos * PASSO_EM_DIAS[vista]));
  }

  const titulo =
    vista === "mes"
      ? formatarDataLonga(`${mes}-01`).replace(/^\d+ de /, "")
      : formatarDataLonga(data);
  // No celular, curto como no Google Agenda: o mês ("Outubro"), ou o dia
  // ("24 out") na vista de dia.
  const tituloNoCelular = vista === "dia" ? diaCurto(data) : nomeDoMes(data);

  return (
    // `data-largura` é o que o container do painel lê para abrir mão da
    // medida de 1180px: a agenda é grade, não texto corrido, e naquele
    // limite as sete colunas ficam estreitas numa tela larga. As telas
    // de lista e formulário mantêm a medida.
    <div className={estilos.pagina} data-largura="cheia" data-testid="agenda">
      {/* Uma barra só: ações, período e vista. O contador de
          agendamentos saiu junto com o cabeçalho de página — a agenda
          mostra os agendamentos, e contar o que está à vista é
          informação repetida. */}
      {/* Barra e resumo num bloco só: a página é uma grade de duas
          linhas (topo e agenda), e a agenda tem que ficar com a linha que
          sobra — um terceiro filho roubaria dela. */}
      <div className={estilos.topo}>
        {celular ? (
          <BarraDaAgendaNoCelular
            titulo={tituloNoCelular}
            diaDeHoje={Number(hoje.slice(8))}
            aoAbrirMenu={() => setComMenu(true)}
            aoAbrirCalendario={() => setEscolhendoData(true)}
            aoAndar={andar}
            aoVoltarAHoje={() => irPara(vista, hoje)}
            aoBloquear={vista === "mes" ? undefined : () => setBloqueando(true)}
          />
        ) : (
          <SeletorDeVista
            vista={vista}
            titulo={titulo}
            aoTrocarVista={(proxima) => irPara(proxima, data)}
            aoAndar={andar}
            aoVoltarAHoje={() => irPara(vista, hojeIso(agora))}
            aoIrParaAgora={vista === "mes" || vista === "lista" ? undefined : irParaAgora}
            acao={
              vista === "mes" ? undefined : (
                // "Bloquear" na tela, "Bloquear horário" pro leitor: o
                // nome diz o quê sem ocupar a barra no celular.
                <button
                  type="button"
                  className={estilos.acao}
                  aria-label="Bloquear horário"
                  onClick={() => setBloqueando(true)}
                >
                  Bloquear
                </button>
              )
            }
          />
        )}

        {/* No celular, quem aparece se escolhe no menu (☰). */}
        {comPilulas && !celular ? (
          <PilulasDeFiltro
            rotulo="Filtrar por profissional"
            marcados={filtro ? [...filtro] : [TODOS]}
            aoTrocar={alternar}
            opcoes={[
              { valor: TODOS, rotulo: "Todos" },
              ...atendentes.map((a) => ({ valor: a.id, rotulo: a.nome })),
            ]}
          />
        ) : null}

        {/* No celular, a faixa de resumo empurraria a agenda pra baixo
            da dobra: sai, como no Google Agenda. */}
        {vista === "mes" || vista === "lista" || celular ? null : (
          <ResumoDoPeriodo
            periodo={vista === "dia" ? "dia" : vista === "3dias" ? "3dias" : "semana"}
            agendamentos={visiveis.filter((a) => diasDaGrade.includes(a.data))}
            agora={agora}
            ehHoje={vista === "dia" && data === hoje}
            ocupacao={vista === "dia" ? ocupacao.dados : undefined}
            soDoProfissional={!daEquipe}
          />
        )}
      </div>

      {movendo ? (
        <JanelaDeMover
          agendamento={movendo.agendamento}
          destino={movendo.destino}
          nomeDoProfissional={
            movendo.destino.barbeiroId
              ? atendentes.find((pessoa) => pessoa.id === movendo.destino.barbeiroId)?.nome
              : undefined
          }
          aoMover={() => {
            agendamentos.recarregar();
            ocupacao.recarregar();
          }}
          aoFechar={() => setMovendo(null)}
        />
      ) : null}

      {comMenu ? (
        <MenuDaAgenda
          nomeDaBarbearia={nomeDaBarbearia}
          vista={vista}
          hoje={hoje}
          profissionais={
            daEquipe ? atendentes.map((pessoa, indice) => ({ ...pessoa, tom: indice % 6 })) : undefined
          }
          marcados={filtro}
          aoTrocarVista={(proxima) => irPara(proxima, data)}
          aoAlternar={alternarCaixa}
          aoBloquear={vista === "mes" ? undefined : () => setBloqueando(true)}
          aoFechar={() => setComMenu(false)}
        />
      ) : null}

      {escolhendoData ? (
        <JanelaDaData
          data={data}
          agora={agora}
          aoEscolher={(escolhida) => irPara(vista, escolhida)}
          aoFechar={() => setEscolhendoData(false)}
        />
      ) : null}

      {bloqueando ? (
        <JanelaDeBloqueio
          data={data}
          aoBloquear={() => {
            bloqueios.recarregar();
            ocupacao.recarregar();
          }}
          aoFechar={() => setBloqueando(false)}
        />
      ) : null}

      {vista === "mes" ? (
        <GradeDoMes
          celulas={gradeDoMes({
            mes,
            horarios: horarios.dados,
            agendamentos: visiveis,
          })}
          hoje={hojeIso(agora)}
          tons={tons}
          aoAbrirDia={(dia) => irPara("dia", dia)}
        />
      ) : vista === "lista" ? (
        <ListaDaAgenda
          dias={diasDaLista}
          agendamentos={visiveis}
          bloqueios={(bloqueios.dados ?? []).filter((b) => !filtro || filtro.has(b.barbeiroId))}
          horarios={horarios.dados}
          agora={agora}
          profissionais={atendentes.map((pessoa, indice) => ({ ...pessoa, tom: indice % 6 }))}
          aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
          aoMarcar={(dia) =>
            router.push(`/painel/agendamentos/novo?data=${dia}` + (soUm ? `&profissional=${soUm}` : ""))
          }
          aoMostrarMais={() => setMaisDias({ de: data, dias: extras + DIAS_DA_LISTA })}
        />
      ) : (
        <GradeDeTempo
          grade={gradeDeTempo({
            dias: diasDaGrade,
            horarios: horarios.dados,
            agendamentos: visiveis,
            agora,
            profissionais,
            bloqueios: bloqueios.dados ?? [],
            expediente:
              vista === "dia"
                ? ocupacao.dados
                  ? { [data]: ocupacao.dados.profissionais.filter((p) => !filtro || filtro.has(p.id)) }
                  : undefined
                : expedienteDaSemana,
          })}
          aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
          // Arrastar pra remarcar: só o que ainda vai acontecer e ainda
          // muda (a API recusa o resto). Soltar abre a confirmação.
          agora={agora}
          podeMover={(agendamento) =>
            (agendamento.status === "pendente" || agendamento.status === "confirmado") &&
            !ehPassado(agendamento.data, agora) &&
            !horaJaPassou(agendamento.data, agendamento.horaInicio, agora)
          }
          aoSoltar={(agendamento, destino) => setMovendo({ agendamento, destino })}
          // Com mais de uma pessoa, cada uma ganha um matiz (mesmo croma),
          // na ordem da equipe; sozinho, a cor da casa.
          tons={tons}
          aoCriar={(dia, hora, barbeiroId, profissionais) => {
            // Na coluna que junta a equipe, só quem pode atender naquela
            // hora; sendo um só, ele já vem escolhido.
            const unico =
              barbeiroId ?? soUm ?? (profissionais?.length === 1 ? profissionais[0] : undefined);
            router.push(
              `/painel/agendamentos/novo?data=${dia}&hora=${encodeURIComponent(hora)}` +
                (unico ? `&profissional=${unico}` : "") +
                (profissionais ? `&profissionais=${profissionais.join(",")}` : "")
            );
          }}
          // Só com vários dias: na vista de dia, um botão para abrir o dia
          // que já está aberto seria ruído.
          aoAbrirDia={variosDias ? (dia) => irPara("dia", dia) : undefined}
        />
      )}
    </div>
  );
}
