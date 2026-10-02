// Ícones desenhados à mão em vez de uma biblioteca: são oito, e uma
// dependência de ícones traria centenas de SVGs e um peso que nenhuma
// outra tela pede.
//
// Todos partilham o mesmo esqueleto — 24x24, só traço, `currentColor` e
// espessura 2, que é a `--borda-padrao` da casa. É o que faz o conjunto
// parecer uma família e não oito desenhos avulsos, e o que deixa o
// ícone herdar a cor do link ativo sem regra extra.
//
// `aria-hidden` em todos: quem nomeia o link é o texto ao lado, que
// continua no DOM mesmo quando a barra está recolhida e o CSS o esconde.
// Sem isso, cada item seria anunciado duas vezes.

import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement>;

function Base({ children, ...resto }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {children}
    </svg>
  );
}

export function IconeCasa(props: Props) {
  return (
    <Base {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20h13V9.5" />
      <path d="M9.8 20v-5.2h4.4V20" />
    </Base>
  );
}

export function IconeCalendario(props: Props) {
  return (
    <Base {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Base>
  );
}

export function IconeCliente(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Base>
  );
}

export function IconeTesoura(props: Props) {
  return (
    <Base {...props}>
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="6.5" cy="6" r="2.5" />
      <path d="M8.7 7.3 20 19M8.7 16.7 20 5" />
    </Base>
  );
}

export function IconeEngrenagem(props: Props) {
  // Os seis dentes vêm de geometria calculada, não de pontos escritos a
  // olho: a primeira versão saiu com dentes de tamanhos diferentes e um
  // canto achatado. Seis e não oito porque a 20px, com traço de 2, os
  // vales de oito dentes fecham e a engrenagem vira um borrão.
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M10.17 2.58L13.83 2.58L13.98 5.91A6.4 6.4 0 0 1 16.28 7.24L19.25 5.70L21.08 8.87L18.26 10.67A6.4 6.4 0 0 1 18.26 13.33L21.08 15.13L19.25 18.30L16.28 16.76A6.4 6.4 0 0 1 13.98 18.09L13.83 21.42L10.17 21.42L10.02 18.09A6.4 6.4 0 0 1 7.72 16.76L4.75 18.30L2.92 15.13L5.74 13.33A6.4 6.4 0 0 1 5.74 10.67L2.92 8.87L4.75 5.70L7.72 7.24A6.4 6.4 0 0 1 10.02 5.91Z" />
    </Base>
  );
}

export function IconeSol(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </Base>
  );
}

export function IconeLua(props: Props) {
  return (
    <Base {...props}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5" />
    </Base>
  );
}

export function IconeSair(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="m15 16 4-4-4-4M19 12H9" />
    </Base>
  );
}

// Uma seta só, girada pelo CSS quando a barra está recolhida — desenhar
// as duas direções seria o mesmo caminho espelhado duas vezes.
export function IconeRecolher(props: Props) {
  return (
    <Base {...props}>
      <path d="m14 6-6 6 6 6" />
    </Base>
  );
}
