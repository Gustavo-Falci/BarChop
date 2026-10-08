"use client";

import { useEffect, useId, useRef } from "react";
import { Botao } from "../../../componentes/Botao";
import { useRequisicao } from "../../../api/useRequisicao";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import { FormularioDeBloqueio, useFormularioDeBloqueio } from "../FormularioDeBloqueio";
import estilos from "./JanelaDeBloqueio.module.css";

// "Bloquear" sem sair da agenda (painel v2, marco 6): o formulário de
// Folgas numa <dialog>, já com a data à vista. Bloqueou, avisa a agenda
// (que recarrega a grade) e fecha.
export function JanelaDeBloqueio({
  data,
  aoBloquear,
  aoFechar,
}: {
  data: string;
  aoBloquear: () => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const { perfil } = usePainel();
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const idDoForm = useId();
  const soOProprio = perfil.papel === "profissional";

  const equipe = useRequisicao(
    () => (soOProprio ? Promise.resolve([]) : api.barbeiro.equipe()),
    [soOProprio]
  );
  const formulario = useFormularioDeBloqueio({
    membroInicial: perfil.id,
    dataInicial: data,
    soOProprio,
    aoBloquear: () => {
      aoBloquear();
      janela.current?.close();
    },
  });

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  return (
    <dialog ref={janela} className={estilos.janela} aria-labelledby={titulo} onClose={aoFechar}>
      <h2 id={titulo} className={estilos.titulo}>
        Bloquear horário
      </h2>
      <FormularioDeBloqueio
        id={idDoForm}
        formulario={formulario}
        membros={(equipe.dados ?? []).filter((m) => m.ativo && m.atende)}
        soOProprio={soOProprio}
      />
      <div className={estilos.rodape}>
        <Botao type="button" variante="contorno" onClick={() => janela.current?.close()}>
          Cancelar
        </Botao>
        <Botao type="submit" form={idDoForm} carregando={formulario.salvando}>
          Bloquear
        </Botao>
      </div>
    </dialog>
  );
}
