"use client";

import { useEffect, useId, useRef, useState } from "react";
import { depoisDaSaida } from "../movimento/depoisDaSaida";
import { Botao } from "./Botao";
import estilos from "./FolhaDeEscolha.module.css";

// Uma escolha entre opções curtas numa folha que sobe de baixo
// (redesenho das Configurações, PR 4: Regras de agendamento). No
// computador, a mesma folha fica no meio da tela.
//
// A escolha só vale no "Usar esta": fechar pelo X, pelo fundo ou pelo Esc
// deixa tudo como estava. Quem abriu desmonta a folha no `aoFechar`.
export function FolhaDeEscolha<V extends string>({
  titulo,
  nome,
  opcoes,
  valor,
  efeito,
  aoUsar,
  aoFechar,
}: {
  titulo: string;
  // O `name` dos rádios.
  nome: string;
  opcoes: { valor: V; rotulo: string }[];
  valor: V;
  // O que a opção marcada faz, numa frase ("O cliente vê horários de 30
  // em 30 minutos.").
  efeito?: (valor: V) => string;
  aoUsar: (valor: V) => void;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const idDoTitulo = useId();
  const [marcada, setMarcada] = useState<V>(valor);
  // O "Usar esta" fecha a folha e só depois, no `close`, avisa quem
  // abriu: pelo X e pelo fundo o aviso é o mesmo, e só muda se usou.
  const usou = useRef(false);

  useEffect(() => {
    janela.current?.showModal();
    // O showModal leva o foco pro primeiro rádio, que parece escolhido sem
    // estar (ver PreviaDaPagina): a folha abre no rádio da escolha de agora.
    janela.current?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
  }, []);

  function fechar() {
    janela.current?.close();
  }

  return (
    <dialog
      ref={janela}
      className={estilos.folha}
      aria-labelledby={idDoTitulo}
      onClose={(evento) =>
        depoisDaSaida(evento.currentTarget, () => {
          if (usou.current) aoUsar(marcada);
          aoFechar();
        })
      }
      onClick={(evento) => {
        // Só o fundo: o espaço de dentro fica no .corpo, e não na <dialog>.
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <div className={estilos.corpo}>
        <span className={estilos.alca} aria-hidden="true" />
        <div className={estilos.topo}>
          <h2 id={idDoTitulo} className={estilos.titulo}>
            {titulo}
          </h2>
          <button type="button" className={estilos.fechar} aria-label="Fechar" onClick={fechar}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <fieldset className={estilos.opcoes}>
          <legend className={estilos.legenda}>{titulo}</legend>
          {opcoes.map((opcao) => (
            <label key={opcao.valor} className={estilos.opcao}>
              <input
                type="radio"
                name={nome}
                value={opcao.valor}
                checked={opcao.valor === marcada}
                onChange={() => setMarcada(opcao.valor)}
                className={estilos.radio}
              />
              <span className={estilos.marca} aria-hidden="true" />
              <span className={estilos.rotulo}>{opcao.rotulo}</span>
            </label>
          ))}
        </fieldset>

        {efeito ? (
          <p className={estilos.efeito} aria-live="polite">
            {efeito(marcada)}
          </p>
        ) : null}

        {/* Num invólucro: o Botao espalha as props depois da própria
            classe, e um `className` aqui apagaria a dele. */}
        <div className={estilos.usar}>
          <Botao
            type="button"
            onClick={() => {
              usou.current = true;
              fechar();
            }}
          >
            Usar esta
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
