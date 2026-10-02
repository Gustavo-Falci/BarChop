"use client";

import { useRouter } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Estatistica } from "../../componentes/Estatistica";
import { Vazio } from "../../componentes/Vazio";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { ocupacao, previstoDoDia } from "../../painel/metricas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./DashboardDoDia.module.css";

// `agora` por parâmetro, como toda tela que olhe relógio: fake timers
// não entram nesta suíte, e teste que compara data fixa com o relógio
// real falha sozinho depois.
export function DashboardDoDia({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const hoje = hojeIso(agora);

  const agendamentos = useRequisicao(() => api.barbeiro.agendamentosDoDia(hoje), [hoje]);
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);

  if (agendamentos.erro) {
    return <Aviso>{agendamentos.erro.mensagem || "Não foi possível carregar o dia agora."}</Aviso>;
  }
  if (!agendamentos.dados || !horarios.dados) return <p>Carregando…</p>;

  const doDia = agendamentos.dados;
  const horarioDeHoje = horarios.dados.find(
    (h) => h.diaSemana === new Date(`${hoje}T12:00:00`).getDay()
  );
  const percentual = ocupacao(doDia, horarioDeHoje);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo={`Hoje, ${perfil.nome}`}
        apoio={formatarDataLonga(hoje)}
        acao={
          <Botao onClick={() => router.push("/painel/agendamentos/novo")}>
            Novo agendamento
          </Botao>
        }
      />

      <div className={estilos.numeros}>
        <Estatistica numero={String(doDia.length)} legenda="agendamentos hoje" />
        <Estatistica
          numero={percentual === null ? "—" : `${percentual}%`}
          legenda="ocupação"
        />
        <Estatistica
          numero={formatarPreco(previstoDoDia(doDia))}
          legenda="previsto hoje"
        />
      </div>

      {doDia.length === 0 ? (
        <Vazio
          mensagem="Nenhum agendamento hoje."
          dica="Quando alguém marcar pelo seu link, o horário aparece aqui."
        />
      ) : (
        <ul className={estilos.lista}>
          {doDia.map((agendamento) => (
            <li key={agendamento.id}>
              <button
                type="button"
                onClick={() => router.push(`/painel/agendamentos/${agendamento.id}`)}
              >
                {agendamento.horaInicio} {agendamento.cliente.nome} ·{" "}
                {agendamento.servicos.map((s) => s.nome).join(" + ")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
