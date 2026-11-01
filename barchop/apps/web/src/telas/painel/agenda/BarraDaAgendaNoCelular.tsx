"use client";

import { IconeBloqueio, IconeDescer } from "../../../painel/icones";
import estilos from "./BarraDaAgendaNoCelular.module.css";

// A barra da agenda no celular (agenda no celular, PR 3), no jeito do
// Google Agenda: ☰ · título ▾ · ‹ › · Hoje · Bloquear. As vistas moram
// no menu (☰), e o título abre o calendário pra pular de data. Os nomes
// das setas são os da barra do desktop: quem usa leitor de tela acha o
// mesmo botão nas duas.
export function BarraDaAgendaNoCelular({
  titulo,
  tituloCurto,
  diaDeHoje,
  aoAbrirMenu,
  aoAbrirCalendario,
  aoAndar,
  aoVoltarAHoje,
  aoBloquear,
}: {
  titulo: string;
  // O mês abreviado ("Set"), pra tela estreita: a 360px e a 390px os
  // meses longos cortavam com "…" (pendente do redesenho, 01/11). Ausente (no dia,
  // que já é curto), o título vale em toda largura.
  tituloCurto?: string;
  // O número de hoje, desenhado no botão "Hoje" como no Google Agenda.
  diaDeHoje: number;
  aoAbrirMenu: () => void;
  aoAbrirCalendario: () => void;
  aoAndar: (passos: number) => void;
  aoVoltarAHoje: () => void;
  // Ausente (no mês), o cadeado não aparece.
  aoBloquear?: () => void;
}) {
  return (
    <div className={estilos.barra}>
      <button
        type="button"
        className={estilos.icone}
        aria-label="Menu da agenda"
        aria-haspopup="dialog"
        onClick={aoAbrirMenu}
      >
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      <button
        type="button"
        className={estilos.titulo}
        aria-label={`${titulo}, escolher data`}
        aria-haspopup="dialog"
        onClick={aoAbrirCalendario}
      >
        {/* Os dois vão no HTML e o CSS escolhe qual se vê: o curto só
            abaixo de 400px. O nome do botão é o `aria-label`, inteiro. */}
        <span className={estilos.textoDoTitulo}>
          <span className={tituloCurto ? estilos.longo : undefined}>{titulo}</span>
          {tituloCurto ? <span className={estilos.curto}>{tituloCurto}</span> : null}
        </span>
        <IconeDescer width="16" height="16" />
      </button>

      <div className={estilos.acoes}>
        <button type="button" className={estilos.icone} aria-label="Período anterior" onClick={() => aoAndar(-1)}>
          ‹
        </button>
        <button type="button" className={estilos.icone} aria-label="Próximo período" onClick={() => aoAndar(1)}>
          ›
        </button>
        {/* Rótulo à vista embaixo do ícone, como na barra de baixo: o
            número num quadrado e o calendário com X não diziam o que
            faziam (redesenho do celular, PR 3). O nome do Hoje vem do
            rótulo; o do cadeado segue "Bloquear horário", que contém o
            texto visível (WCAG 2.5.3). */}
        <button type="button" className={`${estilos.icone} ${estilos.comRotulo}`} onClick={aoVoltarAHoje}>
          <span className={estilos.hoje} aria-hidden="true">
            {diaDeHoje}
          </span>
          <span className={estilos.rotulo}>Hoje</span>
        </button>
        {aoBloquear ? (
          <button
            type="button"
            className={`${estilos.icone} ${estilos.comRotulo}`}
            aria-label="Bloquear horário"
            onClick={aoBloquear}
          >
            <IconeBloqueio />
            <span className={estilos.rotulo}>Bloquear</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
