"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { GradeDeTempo } from "../../componentes/GradeDeTempo";
import { GradeDoMes } from "../../componentes/GradeDoMes";
import { SeletorDeVista, type Vista } from "../../componentes/SeletorDeVista";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { diasDaSemana, gradeDeTempo, gradeDoMes } from "../../painel/grade";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { useAgora } from "../../painel/useAgora";
import estilos from "./Agenda.module.css";

const VISTAS: Vista[] = ["dia", "semana", "mes"];

function lerVista(bruta: string | null): Vista {
  // Vista desconhecida cai no padrão em silêncio, como a leitura do tema
  // faz: a URL é digitável, e um valor estranho não pode quebrar a tela.
  return VISTAS.includes(bruta as Vista) ? (bruta as Vista) : "semana";
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

  const vista = lerVista(query.get("vista"));
  const data = query.get("data") ?? hojeIso(agora);

  const semana = diasDaSemana(data);
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
      : vista === "semana"
        ? [semana[0], semana[6]]
        : [bordasDoMes[0].data, bordasDoMes[bordasDoMes.length - 1].data];

  const agendamentos = useRequisicao(
    () => api.barbeiro.agendamentosDoIntervalo(de, ate),
    [de, ate]
  );
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  function irPara(proxima: Vista, proximaData: string) {
    router.push(`/painel/agenda?vista=${proxima}&data=${proximaData}`);
  }

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
  if (!agendamentos.dados || !horarios.dados) return <p>Carregando…</p>;

  const titulo =
    vista === "mes"
      ? formatarDataLonga(`${mes}-01`).replace(/^\d+ de /, "")
      : formatarDataLonga(data);

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
      <SeletorDeVista
        vista={vista}
        titulo={titulo}
        aoTrocarVista={(proxima) => irPara(proxima, data)}
        aoAndar={(passos) =>
          irPara(
            vista,
            vista === "dia"
              ? somarDias(data, passos)
              : vista === "semana"
                ? somarDias(data, passos * 7)
                : somarMeses(data, passos)
          )
        }
        aoVoltarAHoje={() => irPara(vista, hojeIso(agora))}
      />

      {vista === "mes" ? (
        <GradeDoMes
          celulas={gradeDoMes({
            mes,
            horarios: horarios.dados,
            agendamentos: agendamentos.dados,
          })}
          hoje={hojeIso(agora)}
          aoAbrirDia={(dia) => irPara("dia", dia)}
        />
      ) : (
        <GradeDeTempo
          grade={gradeDeTempo({
            dias: vista === "dia" ? [data] : semana,
            horarios: horarios.dados,
            agendamentos: agendamentos.dados,
            agora,
          })}
          aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
          aoCriar={(dia, hora) =>
            router.push(
              `/painel/agendamentos/novo?data=${dia}&hora=${encodeURIComponent(hora)}`
            )
          }
          // Só na semana: na vista de dia, um botão para abrir o dia que
          // já está aberto seria ruído.
          aoAbrirDia={
            vista === "semana" ? (dia) => irPara("dia", dia) : undefined
          }
        />
      )}
    </div>
  );
}
