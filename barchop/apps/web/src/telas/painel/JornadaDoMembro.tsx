"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { DiaDaJornada, ModoJornada } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Campo } from "../../componentes/Campo";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./JornadaDoMembro.module.css";

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
// no da barbearia pela API — não atende com a porta fechada.
export function JornadaDoMembro({ membroId }: { membroId: string }) {
  const api = useApiDoPainel();
  const salva = useRequisicao(() => api.barbeiro.jornada(membroId), [membroId]);

  const [semana, setSemana] = useState<DiaDaJornada[]>([]);
  const [erro, setErro] = useState<string | undefined>();
  const [confirmacao, setConfirmacao] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  // Sincronizado durante a renderização, como em CadastroDeServico: um
  // efeito deixaria a semana vazia aparecer por um quadro.
  const [sincronizada, setSincronizada] = useState<DiaDaJornada[] | null>(null);
  if (salva.dados && salva.dados !== sincronizada) {
    setSincronizada(salva.dados);
    setSemana(salva.dados);
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
    trocarDia(
      dia.diaSemana,
      modo === "proprio"
        ? { modo, horaInicio: dia.horaInicio, horaFim: dia.horaFim }
        : { modo, horaInicio: null, horaFim: null }
    );
  }

  async function salvar() {
    setErro(undefined);
    setConfirmacao(undefined);

    // A mesma regra da API, antes da ida: as duas horas, e a entrada
    // antes da saída. "HH:mm" compara como texto na ordem do relógio.
    for (const dia of semana) {
      if (dia.modo !== "proprio") continue;
      const nome = capitalizar(DIAS[dia.diaSemana].nome);
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
      const gravada = await api.barbeiro.salvarJornada(membroId, semana);
      setSincronizada(gravada);
      setSemana(gravada);
      setConfirmacao("Jornada salva.");
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível salvar a jornada agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Secao
      titulo="Jornada"
      descricao="Em que dias e horários a pessoa atende. O horário próprio vale só dentro do horário da barbearia."
      acao={
        <Botao onClick={salvar} carregando={salvando} disabled={!salva.dados}>
          Salvar jornada
        </Botao>
      }
    >
      {!salva.dados ? <p>Carregando…</p> : null}
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
                mesmo número de colunas com ou sem as horas. */}
            <div className={estilos.horas}>
              {dia.modo === "proprio" ? (
                <>
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
                </>
              ) : null}
            </div>
          </div>
        );
      })}
      {erro ? <Aviso>{erro}</Aviso> : null}
      {confirmacao ? <Aviso tom="sucesso">{confirmacao}</Aviso> : null}
    </Secao>
  );
}
