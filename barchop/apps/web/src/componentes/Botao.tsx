"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
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

// Um link com a cara do Botao: ações que levam a outro lugar (agendar pra
// este cliente, abrir o WhatsApp) são <a>, não <button> — abrem em outra
// aba, o leitor de tela anuncia como link, e o endereço aparece no hover.
// `externo` sai do app: abre em outra aba, sem passar o referrer.
export function BotaoLink({
  href,
  variante = "primario",
  externo = false,
  children,
}: {
  href: string;
  variante?: Variante;
  externo?: boolean;
  children: ReactNode;
}) {
  const classes = `${estilos.botao} ${estilos[variante]}`;
  if (externo) {
    return (
      <a className={classes} href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link className={classes} href={href}>
      {children}
    </Link>
  );
}
