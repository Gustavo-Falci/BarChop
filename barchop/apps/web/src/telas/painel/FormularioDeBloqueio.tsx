"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { MembroDaEquipe } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Campo } from "../../componentes/Campo";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./FormularioDeBloqueio.module.css";

const MOTIVO_MAX = 120;

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

  return {
    campos: {
      barbeiroId, setBarbeiroId,
      dataInicio, setDataInicio,
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
// ou faixa de horas, motivo. Quem envia é o botão de fora, por `form`.
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
      {/* `htmlFor`, e não o <label> embrulhando o <select>: embrulhado,
          o texto das opções entraria no nome do campo. */}
      {soOProprio ? null : (
        <div className={estilos.campoSelect}>
          <label htmlFor={`${id}-membro`}>Membro</label>
          <select
            id={`${id}-membro`}
            value={campos.barbeiroId}
            onChange={(evento) => campos.setBarbeiroId(evento.target.value)}
          >
            {membros.map((membro) => (
              <option key={membro.id} value={membro.id}>
                {membro.nome}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className={estilos.linha}>
        <Campo rotulo="De" type="date" valor={campos.dataInicio} onChange={campos.setDataInicio} />
        <Campo rotulo="Até" type="date" valor={campos.dataFim} onChange={campos.setDataFim} />
      </div>
      <label className={estilos.opcao}>
        <input
          type="checkbox"
          checked={campos.diaInteiro}
          onChange={(evento) => campos.setDiaInteiro(evento.target.checked)}
        />
        Dia inteiro
      </label>
      {campos.diaInteiro ? null : (
        <div className={estilos.linha}>
          <Campo rotulo="Das" type="time" valor={campos.horaInicio} onChange={campos.setHoraInicio} />
          <Campo rotulo="Às" type="time" valor={campos.horaFim} onChange={campos.setHoraFim} />
        </div>
      )}
      <Campo
        rotulo="Motivo (opcional)"
        maxLength={MOTIVO_MAX}
        placeholder="Férias, almoço, médico"
        valor={campos.motivo}
        onChange={campos.setMotivo}
      />
      {campos.erro ? <Aviso>{campos.erro}</Aviso> : null}
    </form>
  );
}
