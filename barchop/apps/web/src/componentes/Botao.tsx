"use client";

import type { ButtonHTMLAttributes } from "react";
import estilos from "./Botao.module.css";

type Variante = "primario" | "fantasma" | "contorno";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  carregando?: boolean;
}

export function Botao({
  variante = "primario",
  carregando = false,
  disabled,
  children,
  ...resto
}: Props) {
  return (
    <button
      // `disabled` e não só um estilo: a tela de confirmação cria
      // agendamento, e o segundo clique voltaria horario_ocupado por
      // culpa do primeiro.
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={`${estilos.botao} ${estilos[variante]}`}
      {...resto}
    >
      {children}
    </button>
  );
}
