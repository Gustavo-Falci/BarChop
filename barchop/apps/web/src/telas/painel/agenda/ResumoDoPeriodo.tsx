import type { AgendamentoComCliente, OcupacaoDoDia } from "@barchop/types";
import { formatarPreco } from "../../../componentes/ItemDeServico";
import { CONTAM, percentual, previstoDoDia, proximos } from "../../../painel/metricas";
import estilos from "./ResumoDoPeriodo.module.css";

// A faixa de resumo da agenda (painel v2, marco 6): o que o dono quer
// saber antes de ler a grade. As contas são as do Hoje (metricas.ts) —
// mesma regra, mesmos números nas duas telas.
export function ResumoDoPeriodo({
  periodo,
  agendamentos,
  agora,
  ehHoje,
  ocupacao,
  soDoProfissional,
}: {
  periodo: "dia" | "semana";
  // Só os do período à vista.
  agendamentos: AgendamentoComCliente[];
  agora: Date;
  // "Ainda hoje" só faz sentido no dia de hoje.
  ehHoje: boolean;
  // Só no dia; ausente enquanto carrega ou se falhou — a faixa fica sem
  // o item, em vez de inventar um número.
  ocupacao?: OcupacaoDoDia | null;
  soDoProfissional: boolean;
}) {
  const valem = agendamentos.filter((a) => (CONTAM as readonly string[]).includes(a.status));
  const quantos = valem.length;
  const aindaVem = ehHoje ? proximos(agendamentos, agora).length : 0;
  const ocupado = ocupacao ? percentual(ocupacao.casa) : undefined;

  return (
    <ul className={estilos.faixa} aria-label={periodo === "dia" ? "Resumo do dia" : "Resumo da semana"}>
      <li>
        {quantos === 0 ? "Nenhum agendamento" : `${quantos} ${quantos === 1 ? "agendamento" : "agendamentos"}`}
      </li>
      {ehHoje && quantos > 0 ? <li>{aindaVem} ainda hoje</li> : null}
      <li>Previsto {formatarPreco(previstoDoDia(agendamentos))}</li>
      {periodo === "dia" && ocupado !== undefined ? (
        // Sem trabalho no dia é "Fechado", não 0%: zero diria "aberto e
        // vazio" (a mesma regra da barra do Hoje).
        <li>{ocupado === null ? "Fechado" : `${soDoProfissional ? "Sua ocupação" : "Ocupação"} ${ocupado}%`}</li>
      ) : null}
    </ul>
  );
}
