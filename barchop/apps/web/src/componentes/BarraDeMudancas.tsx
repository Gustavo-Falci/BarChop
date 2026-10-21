"use client";

import { AnimatePresence, m } from "motion/react";
import { CURVA, DESLIZE, DURACAO } from "../movimento/tokens";
import { Botao } from "./Botao";
import estilos from "./BarraDeMudancas.module.css";

// Sobe 8px do pé quando aparece e desce ao sumir (salvou ou descartou).
const FORA = { opacity: 0, y: DESLIZE.normal };
const ENTRAR = { opacity: 1, y: 0, transition: { duration: DURACAO.media, ease: CURVA.entrada } };
const SAIR = { ...FORA, transition: { duration: DURACAO.curta, ease: CURVA.saida } };

// Um Salvar só por tela (análise de 17/10): a barra sobe do pé da tela
// quando algo muda e diz o que mudou ("Intervalo entre horários: 15 min →
// 30 min"). Várias telas tinham um Salvar por seção, e quem mexia em duas
// salvava uma e perdia a outra.
//
// `pendente` é o caso da área que ainda não foi decidida: sem mudança
// nenhuma, salvar é como o dono diz "pode ficar assim" — e é isso que
// tira o "Faltando" da área.
export function BarraDeMudancas({
  mudancas,
  pendente = false,
  aviso,
  salvando = false,
  aoSalvar,
  aoDescartar,
}: {
  mudancas: string[];
  pendente?: boolean;
  // O erro do salvar mora aqui, junto do botão: a barra fica presa no pé,
  // e um aviso no topo da página ficaria fora da vista.
  aviso?: string;
  salvando?: boolean;
  aoSalvar: () => void;
  aoDescartar: () => void;
}) {
  const visivel = mudancas.length > 0 || pendente || Boolean(aviso);
  const resumo =
    mudancas.length === 0
      ? "Ainda não decidido: salve pra manter assim."
      : `${mudancas.length} ${mudancas.length === 1 ? "mudança" : "mudanças"} · ${mudancas.join(" · ")}`;

  // `initial={false}`: a barra que já nasce na tela (área pendente) não
  // anima no carregamento, e o HTML do servidor sai no lugar final.
  return (
    <AnimatePresence initial={false}>
      {visivel ? (
        <m.section
          key="barra"
          className={estilos.barra}
          aria-label="Mudanças"
          initial={FORA}
          animate={ENTRAR}
          exit={SAIR}
        >
          <p className={estilos.resumo} aria-live="polite">
            {resumo}
          </p>
          {aviso ? (
            <p className={estilos.aviso} role="alert">
              {aviso}
            </p>
          ) : null}
          <div className={estilos.botoes}>
            {mudancas.length > 0 ? (
              <Botao variante="fantasma" onClick={aoDescartar} disabled={salvando}>
                Descartar
              </Botao>
            ) : null}
            <Botao onClick={aoSalvar} carregando={salvando}>
              Salvar
            </Botao>
          </div>
        </m.section>
      ) : null}
    </AnimatePresence>
  );
}
