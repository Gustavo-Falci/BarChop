"use client";

import { useState, type ReactNode } from "react";
import type { AgendamentoComCliente, BloqueioSerializado, HorarioSerializado } from "@barchop/types";
import { situacaoDoAgendamento } from "../../../componentes/GradeDeTempo";
import { ehPassado, formatarDataComSemana, formatarDataLonga, hojeIso, horaJaPassou } from "../../../formato/datas";
import { diaAberto } from "../../../painel/grade";
import estilos from "./ListaDaAgenda.module.css";

export interface ProfissionalDaLista {
  id: string;
  nome: string;
  // O mesmo tom dos blocos da grade (data-tom 0–5).
  tom: number;
}

type Item =
  | { tipo: "agendamento"; inicio: string; fim: string; agendamento: AgendamentoComCliente }
  | { tipo: "bloqueio"; inicio: string; fim: string; bloqueio: BloqueioSerializado };

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

function somarUmDia(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "13 – 19 set", ou "27 set – 3 out" quando a semana vira o mês.
function rotuloDaSemana(domingo: string): string {
  const sabado = somarUmDia(domingo, 6);
  const [m1, m2] = [domingo, sabado].map((d) => MES_CURTO[Number(d.slice(5, 7)) - 1]);
  const [d1, d2] = [domingo, sabado].map((d) => Number(d.slice(8)));
  return m1 === m2 ? `${d1} – ${d2} ${m1}` : `${d1} ${m1} – ${d2} ${m2}`;
}

// Os itens de um dia, em ordem de horário: os agendamentos (cancelado
// some, como na grade) e os bloqueios que tocam o dia. Bloqueio do dia
// inteiro vai na frente.
function itensDoDia(
  dia: string,
  agendamentos: AgendamentoComCliente[],
  bloqueios: BloqueioSerializado[]
): Item[] {
  const itens: Item[] = [
    ...agendamentos
      .filter((a) => a.data === dia && a.status !== "cancelado")
      .map((a): Item => ({ tipo: "agendamento", inicio: a.horaInicio, fim: a.horaFim, agendamento: a })),
    ...bloqueios
      .filter((b) => b.dataInicio <= dia && dia <= b.dataFim)
      .map(
        (b): Item => ({ tipo: "bloqueio", inicio: b.horaInicio ?? "00:00", fim: b.horaFim ?? "23:59", bloqueio: b })
      ),
  ];
  return itens.sort((a, b) => a.inicio.localeCompare(b.inicio));
}

// A vista "Lista" da agenda (agenda no celular, PR 4), no jeito do
// Google Agenda: um bloco por dia, os cartões em ordem de horário, os
// bloqueios listrados entre eles e a régua do agora no dia de hoje. O
// que já acabou hoje fica recolhido em "Mais cedo".
export function ListaDaAgenda({
  dias,
  agendamentos,
  bloqueios,
  horarios,
  agora,
  profissionais,
  aoAbrir,
  aoMarcar,
  aoMostrarMais,
}: {
  dias: string[];
  // Já com o filtro de profissionais aplicado.
  agendamentos: AgendamentoComCliente[];
  bloqueios: BloqueioSerializado[];
  horarios: HorarioSerializado[];
  agora: Date;
  // Com dois ou mais, cada cartão diz com quem; um só, não repete.
  profissionais?: ProfissionalDaLista[];
  aoAbrir: (id: string) => void;
  // Dia aberto e vazio: tocar leva pro novo agendamento naquela data.
  aoMarcar: (data: string) => void;
  aoMostrarMais: () => void;
}) {
  const [verMaisCedo, setVerMaisCedo] = useState(false);
  const hoje = hojeIso(agora);
  // O relógio do aparelho, como o `horaJaPassou`.
  const horaDeAgora = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  const comEtiqueta = (profissionais?.length ?? 0) > 1;
  const daPessoa = (id: string) => profissionais?.find((p) => p.id === id);

  function cartao(item: Item, dia: string) {
    if (item.tipo === "bloqueio") {
      const { bloqueio } = item;
      const quem = daPessoa(bloqueio.barbeiroId);
      const motivo = bloqueio.motivo ?? "Bloqueado";
      const quando = bloqueio.horaInicio && bloqueio.horaFim ? `${bloqueio.horaInicio} – ${bloqueio.horaFim}` : "Dia inteiro";
      return (
        <li key={`b-${bloqueio.id}`} className={estilos.bloqueio} data-tom={quem?.tom}>
          {/* "Almoço · Ana", e não "do/da Ana": o nome não diz o gênero. */}
          {quando} · {motivo}
          {comEtiqueta && quem ? ` · ${quem.nome}` : ""}
        </li>
      );
    }
    const { agendamento } = item;
    const situacao = situacaoDoAgendamento(agendamento, dia === hoje ? agora : undefined);
    const quem = daPessoa(agendamento.barbeiro.id);
    return (
      <li key={agendamento.id}>
        <button
          type="button"
          className={estilos.cartao}
          data-tom={quem?.tom ?? 0}
          data-status={agendamento.status}
          data-agora={situacao === "em atendimento" ? "true" : undefined}
          onClick={() => aoAbrir(agendamento.id)}
        >
          <span className={estilos.texto}>
            <span className={estilos.quem}>
              {agendamento.cliente.nome} · {agendamento.servicos.map((s) => s.nome).join(" + ")}
              {agendamento.presencaConfirmadaEm ? (
                <>
                  <span aria-hidden="true"> ✓</span>
                  <span className={estilos.somenteLeitor}>, confirmou presença</span>
                </>
              ) : null}
            </span>
            <span className={estilos.quando}>
              {agendamento.horaInicio} – {agendamento.horaFim}
              {situacao ? ` · ${situacao}` : ""}
            </span>
          </span>
          {comEtiqueta && quem ? <span className={estilos.etiqueta}>{quem.nome}</span> : null}
        </button>
      </li>
    );
  }

  return (
    <div className={estilos.lista} data-testid="lista-da-agenda">
      {dias.map((dia, indice) => {
        const itens = itensDoDia(dia, agendamentos, bloqueios);
        const ehHoje = dia === hoje;
        // Hoje, o que já acabou sai da frente; o que está acontecendo fica.
        const acabados = ehHoje ? itens.filter((item) => horaJaPassou(dia, item.fim, agora)) : [];
        const seguintes = itens.filter((item) => !acabados.includes(item));
        const atendidos = acabados.filter((item) => item.tipo === "agendamento").length;
        // A régua vai antes do primeiro que ainda não começou.
        const posicaoDaRegua = ehHoje
          ? (() => {
              const i = seguintes.findIndex((item) => item.inicio > horaDeAgora);
              return i === -1 ? seguintes.length : i;
            })()
          : -1;
        const novaSemana = indice > 0 && diaDaSemana(dia) === 0;

        return (
          <div key={dia} className={estilos.bloco}>
            {novaSemana ? (
              <p className={estilos.semana} role="separator" aria-label={`Semana de ${rotuloDaSemana(dia)}`}>
                {rotuloDaSemana(dia)}
              </p>
            ) : null}
            <section className={estilos.dia} aria-label={formatarDataLonga(dia)} data-hoje={ehHoje || undefined}>
              <h2 className={estilos.data}>
                <span className={estilos.diaDaSemana} aria-hidden="true">
                  {DIA_CURTO[diaDaSemana(dia)]}
                </span>
                <span className={estilos.numero} aria-hidden="true">
                  {Number(dia.slice(8))}
                </span>
                <span className={estilos.somenteLeitor}>{formatarDataComSemana(dia)}</span>
              </h2>

              <div className={estilos.itens}>
                {itens.length === 0 ? (
                  !diaAberto(dia, horarios) ? (
                    <p className={estilos.vazio}>Fechado</p>
                  ) : ehPassado(dia, agora) ? (
                    <p className={estilos.vazio}>Nenhum agendamento.</p>
                  ) : (
                    <button type="button" className={estilos.marcar} onClick={() => aoMarcar(dia)}>
                      Nenhum horário. Toque para marcar.
                    </button>
                  )
                ) : (
                  <>
                    {acabados.length > 0 ? (
                      <>
                        <button
                          type="button"
                          className={estilos.maisCedo}
                          aria-expanded={verMaisCedo}
                          onClick={() => setVerMaisCedo((aberto) => !aberto)}
                        >
                          Mais cedo
                          {atendidos > 0 ? ` · ${atendidos} ${atendidos === 1 ? "atendido" : "atendidos"}` : ""}
                        </button>
                        {verMaisCedo ? (
                          <ul className={estilos.cartoes} aria-label="Mais cedo">
                            {acabados.map((item) => cartao(item, dia))}
                          </ul>
                        ) : null}
                      </>
                    ) : null}
                    <ul className={estilos.cartoes}>
                      {seguintes.map((item, i) => (
                        <ItemComRegua
                          key={item.tipo === "agendamento" ? item.agendamento.id : `b-${item.bloqueio.id}`}
                          regua={i === posicaoDaRegua ? horaDeAgora : undefined}
                        >
                          {cartao(item, dia)}
                        </ItemComRegua>
                      ))}
                      {posicaoDaRegua === seguintes.length ? <Regua hora={horaDeAgora} /> : null}
                    </ul>
                  </>
                )}
              </div>
            </section>
          </div>
        );
      })}

      <button type="button" className={estilos.mostrarMais} onClick={aoMostrarMais}>
        Mostrar mais 14 dias
      </button>
    </div>
  );
}

function ItemComRegua({ regua, children }: { regua?: string; children: ReactNode }) {
  return (
    <>
      {regua ? <Regua hora={regua} /> : null}
      {children}
    </>
  );
}

// A régua do agora entre os cartões de hoje, como a linha vermelha da
// grade. `li` porque mora dentro da lista de cartões.
function Regua({ hora }: { hora: string }) {
  return (
    <li className={estilos.regua} role="separator" aria-label={`Agora, ${hora}`} data-testid="regua-da-lista" />
  );
}
