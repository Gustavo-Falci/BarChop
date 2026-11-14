"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarraDaEntrada } from "../componentes/TelaDeEntrada";
import estilos from "./CascaDoSuporte.module.css";

const ABAS = [
  { href: "/painel/suporte", rotulo: "Pedidos" },
  { href: "/painel/suporte/avisos", rotulo: "Avisos" },
  // A linha de base da home nova (marco 1): visitas e cadastros.
  { href: "/painel/suporte/numeros", rotulo: "Números" },
] as const;

// A casca das telas do suporte (onda C): a barra "BarChop · Suporte" com
// Sair e as abas Pedidos / Avisos / Números, no lugar do botão "Avisos" da fila e do
// voltar dos avisos. Fora do shell do painel: a sessão aqui é a do
// suporte, que não tem barbearia.
//
// `abertos` (só a fila sabe): os pedidos esperando decisão, Pix e troca
// de link, no selo da aba Pedidos. O leitor de tela ouve "2 abertos".
export function CascaDoSuporte({
  aoSair,
  abertos,
  children,
}: {
  aoSair: () => void;
  abertos?: number;
  children: ReactNode;
}) {
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
            {href === "/painel/suporte" && abertos ? (
              <>
                {" "}
                <span className={estilos.contador}>
                  {abertos}{" "}
                  <span className={estilos.somenteLeitor}>{abertos === 1 ? "aberto" : "abertos"}</span>
                </span>
              </>
            ) : null}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
