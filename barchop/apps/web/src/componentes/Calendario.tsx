"use client";

import { diasDoMes, ehPassado, formatarDataLonga } from "../formato/datas";
import estilos from "./Calendario.module.css";

const NOMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// `dias` é o mapa que /disponibilidade/mes devolve: data -> tem vaga.
// O passado não vem de lá — a rota não sabe que dia é hoje, e é esta
// tela que decide.
export function Calendario({
  mes,
  dias,
  agora,
  selecionada,
  aoEscolher,
  aoTrocarMes,
}: {
  mes: string;
  dias: Record<string, boolean>;
  agora: Date;
  // Opcional: o painel chega com a data na URL e precisa mostrar qual
  // dia está valendo. O fluxo público navega ao escolher, então não tem
  // o que marcar.
  selecionada?: string;
  aoEscolher: (data: string) => void;
  aoTrocarMes: (mes: string) => void;
}) {
  return (
    <div className={estilos.calendario}>
      <div className={estilos.cabecalho}>
        <button
          type="button"
          className={estilos.navegar}
          onClick={() => aoTrocarMes(mesVizinho(mes, -1))}
          aria-label="Mês anterior"
        >
          ‹
        </button>
        <span className={estilos.mes}>{nomeDoMes(mes)}</span>
        <button
          type="button"
          className={estilos.navegar}
          onClick={() => aoTrocarMes(mesVizinho(mes, 1))}
          aria-label="Próximo mês"
        >
          ›
        </button>
      </div>

      <div className={estilos.grade}>
        {/* O recuo da primeira linha já existia — diasDoMes preenche o
            começo com nulos conforme o dia da semana. O que faltava era
            o cabeçalho que torna esse recuo legível. */}
        {NOMES.map((nome) => (
          <span key={nome} className={estilos.diaDaSemana}>
            {nome}
          </span>
        ))}

        {diasDoMes(mes).map((data, indice) =>
          data === null ? (
            <span key={`vazio-${indice}`} className={estilos.vazio} />
          ) : (
            <button
              key={data}
              type="button"
              className={estilos.dia}
              // O número sozinho não nomeia nada: "9" se repete em todo
              // mês e não diz de qual mês é esta grade.
              aria-label={formatarDataLonga(data)}
              aria-current={data === selecionada ? "date" : undefined}
              disabled={ehPassado(data, agora) || !dias[data]}
              onClick={() => aoEscolher(data)}
            >
              {Number(data.slice(-2))}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function mesVizinho(mes: string, passo: number): string {
  const [ano, numero] = mes.split("-").map(Number);
  const referencia = new Date(Date.UTC(ano, numero - 1 + passo, 1));
  return `${referencia.getUTCFullYear()}-${String(
    referencia.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function nomeDoMes(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mes}-01T00:00:00Z`));
}
