"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { MembroDaEquipe } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import { formatarDataLonga, formatarPeriodo } from "../../formato/datas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./FormularioDeBloqueio.module.css";

const MOTIVO_MAX = 120;

// Os porquês de quase todo bloqueio: um toque preenche o motivo (dá pra
// escrever outro).
const MOTIVOS_COMUNS = ["Folga", "Férias", "Almoço", "Médico"];

const OPCOES_DE_DURACAO: { valor: "dia" | "horas"; rotulo: string }[] = [
  { valor: "dia", rotulo: "Dia inteiro" },
  { valor: "horas", rotulo: "Só algumas horas" },
];

// "Ana fica fora da agenda de 12 a 16 de janeiro, o dia inteiro." Só
// quando dá pra dizer: período inteiro e na ordem (e as horas, se for
// por horas). O resto é com a validação, no Bloquear.
function fraseDoBloqueio(
  quem: string,
  campos: {
    dataInicio: string;
    dataFim: string;
    diaInteiro: boolean;
    horaInicio: string;
    horaFim: string;
  }
): string | null {
  const { dataInicio, dataFim, diaInteiro, horaInicio, horaFim } = campos;
  if (!dataInicio || !dataFim || dataFim < dataInicio) return null;
  if (!diaInteiro && (!horaInicio || !horaFim || horaInicio >= horaFim)) return null;
  const quando =
    dataInicio === dataFim
      ? `em ${formatarDataLonga(dataInicio)}`
      : `de ${formatarPeriodo(dataInicio, dataFim)}`;
  const horas = diaInteiro ? "o dia inteiro" : `das ${horaInicio} às ${horaFim}`;
  return `${quem} fica fora da agenda ${quando}, ${horas}.`;
}

// O estado e a validação do bloqueio, separados dos campos: Folgas põe
// o botão de enviar no cabeçalho da seção, e a janela da agenda no
// rodapé dela — os dois precisam do `salvando` do lado de fora do form.
export function useFormularioDeBloqueio({
  membroInicial,
  dataInicial = "",
  soOProprio,
  aoBloquear,
}: {
  membroInicial: string;
  // A agenda abre já com a data à vista; Folgas, em branco.
  dataInicial?: string;
  // O profissional só bloqueia a própria agenda: o membro é sempre ele.
  soOProprio: boolean;
  aoBloquear: () => void;
}) {
  const api = useApiDoPainel();
  const [barbeiroId, setBarbeiroId] = useState(membroInicial);
  const [dataInicio, setDataInicio] = useState(dataInicial);
  const [dataFim, setDataFim] = useState(dataInicial);
  const [diaInteiro, setDiaInteiro] = useState(true);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [salvando, setSalvando] = useState(false);

  async function bloquear() {
    setErro(undefined);
    if (!dataInicio || !dataFim) {
      setErro("Informe o primeiro e o último dia.");
      return;
    }
    // "YYYY-MM-DD" compara como texto na ordem do calendário.
    if (dataFim < dataInicio) {
      setErro("O período termina antes de começar.");
      return;
    }
    if (!diaInteiro) {
      if (!horaInicio || !horaFim) {
        setErro("Informe o começo e o fim do horário bloqueado.");
        return;
      }
      if (horaInicio >= horaFim) {
        setErro("O horário bloqueado termina antes de começar.");
        return;
      }
    }

    setSalvando(true);
    try {
      await api.barbeiro.criarBloqueio({
        barbeiroId: soOProprio ? membroInicial : barbeiroId,
        dataInicio,
        dataFim,
        horaInicio: diaInteiro ? null : horaInicio,
        horaFim: diaInteiro ? null : horaFim,
        motivo: motivo.trim() || null,
      });
      setDataInicio(dataInicial);
      setDataFim(dataInicial);
      setMotivo("");
      aoBloquear();
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível bloquear agora.");
    } finally {
      setSalvando(false);
    }
  }

  // O Até acompanha o De: folga de um dia é o caso comum, e um Até que
  // ficou pra trás viraria "termina antes de começar" no Bloquear. Um
  // Até já depois do novo De fica como está.
  function escolherInicio(data: string) {
    setDataInicio(data);
    setDataFim((atual) => (!atual || atual < data ? data : atual));
  }

  return {
    campos: {
      barbeiroId, setBarbeiroId,
      dataInicio, setDataInicio: escolherInicio,
      dataFim, setDataFim,
      diaInteiro, setDiaInteiro,
      horaInicio, setHoraInicio,
      horaFim, setHoraFim,
      motivo, setMotivo,
      erro,
    },
    salvando,
    bloquear,
    // Pra quem mostra o erro fora do formulário (Folgas, ao remover).
    setErro,
  };
}

export type FormularioDeBloqueioAberto = ReturnType<typeof useFormularioDeBloqueio>;

// Os campos: membro (pra quem bloqueia a equipe), período, dia inteiro
// ou faixa de horas, motivo, e a frase do que vai acontecer. Quem envia
// é o botão de fora, por `form`.
export function FormularioDeBloqueio({
  id,
  formulario,
  membros,
  soOProprio,
}: {
  id: string;
  formulario: FormularioDeBloqueioAberto;
  // Quem atende: a recepção sem agenda não tem o que bloquear.
  membros: MembroDaEquipe[];
  soOProprio: boolean;
}) {
  const { campos } = formulario;
  const quem = soOProprio
    ? "Você"
    : (membros.find((membro) => membro.id === campos.barbeiroId)?.nome ?? "Quem você escolheu");
  const frase = fraseDoBloqueio(quem, campos);
  return (
    <form
      id={id}
      className={estilos.formulario}
      noValidate
      onSubmit={(evento) => {
        evento.preventDefault();
        void formulario.bloquear();
      }}
    >
      {/* Pílulas, e não um <select>: a equipe de uma barbearia é curta,
          e quem fica fora se escolhe à vista. */}
      {soOProprio ? null : (
        <SeletorEmPilulas
          nome={`${id}-membro`}
          legenda="Membro"
          opcoes={membros.map((membro) => ({ valor: membro.id, rotulo: membro.nome }))}
          valor={campos.barbeiroId}
          aoTrocar={campos.setBarbeiroId}
        />
      )}
      <div className={estilos.linha}>
        <Campo rotulo="De" type="date" valor={campos.dataInicio} onChange={campos.setDataInicio} />
        <Campo rotulo="Até" type="date" valor={campos.dataFim} onChange={campos.setDataFim} />
      </div>
      {/* Duas opções nomeadas, e não um checkbox "Dia inteiro": desmarcado,
          ele não dizia o que acontecia. */}
      <SeletorEmPilulas
        nome={`${id}-duracao`}
        legenda="Quanto tempo"
        opcoes={OPCOES_DE_DURACAO}
        valor={campos.diaInteiro ? "dia" : "horas"}
        aoTrocar={(valor) => campos.setDiaInteiro(valor === "dia")}
      />
      {campos.diaInteiro ? null : (
        <div className={estilos.linha}>
          <Campo rotulo="Das" type="time" valor={campos.horaInicio} onChange={campos.setHoraInicio} />
          <Campo rotulo="Às" type="time" valor={campos.horaFim} onChange={campos.setHoraFim} />
        </div>
      )}
      <div className={estilos.motivo}>
        <Campo
          rotulo="Motivo (opcional)"
          maxLength={MOTIVO_MAX}
          placeholder="Férias, almoço, médico"
          valor={campos.motivo}
          onChange={campos.setMotivo}
        />
        <div className={estilos.atalhos}>
          {MOTIVOS_COMUNS.map((motivo) => (
            <button
              key={motivo}
              type="button"
              className={estilos.atalho}
              aria-pressed={campos.motivo === motivo}
              onClick={() => campos.setMotivo(motivo)}
            >
              {motivo}
            </button>
          ))}
        </div>
      </div>
      {/* O que o Bloquear vai fazer, dito antes: `aria-live` porque muda
          a cada escolha. */}
      <p className={estilos.frase} aria-live="polite">
        {frase ?? "Escolha o período pra ver como fica."}
      </p>
      {campos.erro ? <Aviso>{campos.erro}</Aviso> : null}
    </form>
  );
}
