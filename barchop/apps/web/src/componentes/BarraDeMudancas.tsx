"use client";

import { Botao } from "./Botao";
import estilos from "./BarraDeMudancas.module.css";

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
  salvando = false,
  aoSalvar,
  aoDescartar,
}: {
  mudancas: string[];
  pendente?: boolean;
  salvando?: boolean;
  aoSalvar: () => void;
  aoDescartar: () => void;
}) {
  if (mudancas.length === 0 && !pendente) return null;

  const resumo =
    mudancas.length === 0
      ? "Ainda não decidido: salve pra manter assim."
      : `${mudancas.length} ${mudancas.length === 1 ? "mudança" : "mudanças"} · ${mudancas.join(" · ")}`;

  return (
    <section className={estilos.barra} aria-label="Mudanças">
      <p className={estilos.resumo} aria-live="polite">
        {resumo}
      </p>
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
    </section>
  );
}
