"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import { CURVA, DURACAO, curvaCss } from "./tokens";

// O conteúdo que entra quando a tela muda: um fade curto no lugar da
// troca seca. Envolve o container do painel e a coluna do fluxo público.
//
// Sem `key={pathname}`: a chave remontaria a tela inteira a cada rota e
// levaria junto o estado (filtro, rascunho, rolagem). A animação roda
// por fora do React, no próprio elemento.
//
// Pela Web Animations API do navegador, e não pelo `useAnimate` da lib
// `motion`: ele puxava ~30KB pro JS inicial de toda tela do painel só
// pra este fade. Os componentes `m.*` trazem o motor da lib depois, pelo
// LazyMotion, quando precisarem.
//
// Só opacity, nenhum deslize. Telas como a escolha de serviços e o
// detalhe do agendamento têm barra `position: fixed`, e qualquer
// transform aqui faria do container a referência dela: a barra sairia
// do rodapé da janela e pularia pro meio da página durante a entrada.
// Fade também é o que sobra pra quem pediu menos movimento no sistema,
// então não há o que desligar.
//
// A primeira renderização não anima: o HTML do servidor chega visível
// e assim fica (sem flash na hidratação). Só a troca de rota anima.
export function EntradaDaTela({ className, children }: { className?: string; children: ReactNode }) {
  const caminho = usePathname();
  const elemento = useRef<HTMLDivElement>(null);
  const ultimoCaminho = useRef(caminho);

  useEffect(() => {
    if (ultimoCaminho.current === caminho) return;
    ultimoCaminho.current = caminho;
    // Navegador sem a API (e o jsdom): a tela só troca, como antes.
    if (typeof elemento.current?.animate !== "function") return;
    const animacao = elemento.current.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURACAO.media * 1000,
      easing: curvaCss(CURVA.entrada),
    });
    return () => animacao.cancel();
  }, [caminho]);

  return (
    <div ref={elemento} className={className}>
      {children}
    </div>
  );
}
