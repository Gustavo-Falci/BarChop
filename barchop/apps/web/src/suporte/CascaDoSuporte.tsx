"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarraDaEntrada } from "../componentes/TelaDeEntrada";
import estilos from "./CascaDoSuporte.module.css";

const ABAS = [
  { href: "/painel/suporte", rotulo: "Pedidos" },
  { href: "/painel/suporte/avisos", rotulo: "Avisos" },
] as const;

// A casca das telas do suporte (onda C): a barra "BarChop · Suporte" com
// Sair e as abas Pedidos / Avisos, no lugar do botão "Avisos" da fila e do
// voltar dos avisos. Fora do shell do painel: a sessão aqui é a do
// suporte, que não tem barbearia.
export function CascaDoSuporte({ aoSair, children }: { aoSair: () => void; children: ReactNode }) {
  const caminho = usePathname();

  return (
    <div className={estilos.casca}>
      <BarraDaEntrada
        area="Suporte"
        sempreVisivel
        acao={
          <button type="button" className={estilos.sair} onClick={aoSair}>
            Sair
          </button>
        }
      />
      <nav className={estilos.abas} aria-label="Áreas do suporte">
        {ABAS.map(({ href, rotulo }) => (
          <Link
            key={href}
            href={href}
            className={estilos.aba}
            aria-current={caminho === href ? "page" : undefined}
          >
            {rotulo}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
