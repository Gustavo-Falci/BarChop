// Ícones desenhados à mão em vez de uma biblioteca: são poucos, e uma
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

// O calendário da Agenda com um traço cortando: dia fora da agenda.
export function IconeBloqueio(props: Props) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="m9.5 13 5 5M14.5 13l-5 5" />
    </Base>
  );
}

// Duas pessoas: o IconeCliente com um colega atrás. Mesma cabeça e
// mesmos ombros, pra família ler como parente do de Clientes.
export function IconeEquipe(props: Props) {
  return (
    <Base {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 20a7 7 0 0 1 14 0" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
      <path d="M18 14.2a7 7 0 0 1 4 5.8" />
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

// Os três da página pública (contatos e endereço). Genéricos de
// propósito — balão, câmera, alfinete — e não as marcas: logo de
// terceiro tem regra de uso, e o texto ao lado já diz qual é.
export function IconeConversa(props: Props) {
  return (
    <Base {...props}>
      <path d="M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 21l1.9-5.4A8.5 8.5 0 1 1 21 11.5Z" />
    </Base>
  );
}

export function IconeCamera(props: Props) {
  return (
    <Base {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M17.5 6.5h.01" />
    </Base>
  );
}

export function IconeMapa(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Base>
  );
}

// Os da escolha de serviços: o ícone de cada categoria, o relógio da
// duração e a marca do cartão escolhido.
export function IconeNavalha(props: Props) {
  return (
    <Base {...props}>
      <path d="M3 21 13.5 10.5" />
      <path d="M13.5 10.5 19 5a2.1 2.1 0 0 1 3 3l-5.5 5.5-3-3Z" />
    </Base>
  );
}

export function IconeGota(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" />
    </Base>
  );
}

export function IconeCoroa(props: Props) {
  return (
    <Base {...props}>
      <path d="m3 7 4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7Z" />
    </Base>
  );
}

export function IconeBrilho(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" />
      <path d="m7.5 7.5 1.5 1.5M15 15l1.5 1.5M16.5 7.5 15 9M9 15l-1.5 1.5" />
    </Base>
  );
}

export function IconeRelogio(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Base>
  );
}

export function IconeCheck(props: Props) {
  return (
    <Base {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Base>
  );
}

// Os das comodidades e das formas de pagamento (Configurações → Dados do
// negócio → Comodidades). Um por item, menos o cartão, que serve ao
// débito e ao crédito — quem os separa é o nome.
export function IconeWifi(props: Props) {
  return (
    <Base {...props}>
      <path d="M2.5 9a14 14 0 0 1 19 0" />
      <path d="M5.5 12.5a9.5 9.5 0 0 1 13 0" />
      <path d="M8.5 16a5 5 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </Base>
  );
}

export function IconeFloco(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7" />
      <path d="m9.5 3.5 2.5 2 2.5-2M9.5 20.5l2.5-2 2.5 2" />
    </Base>
  );
}

export function IconeCarro(props: Props) {
  return (
    <Base {...props}>
      <path d="M5 16H3.5v-4l2-5h13l2 5v4H19" />
      <path d="M3.5 12h17" />
      <path d="M9 16h6" />
      <circle cx="7" cy="16.5" r="2" />
      <circle cx="17" cy="16.5" r="2" />
    </Base>
  );
}

export function IconeAcessivel(props: Props) {
  return (
    <Base {...props}>
      <circle cx="12" cy="4.5" r="1.5" />
      <path d="M5 8.5h14M12 8.5v5M12 13.5 8.5 21M12 13.5l3.5 7.5" />
    </Base>
  );
}

export function IconeXicara(props: Props) {
  return (
    <Base {...props}>
      <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z" />
      <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5v2.5M12 3.5v2.5" />
    </Base>
  );
}

export function IconeCopo(props: Props) {
  return (
    <Base {...props}>
      <path d="M6 3h12l-1.6 17.1a1 1 0 0 1-1 .9H8.6a1 1 0 0 1-1-.9L6 3Z" />
      <path d="M6.6 9h10.8" />
    </Base>
  );
}

export function IconeTv(props: Props) {
  return (
    <Base {...props}>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <path d="m8 2.5 4 3.5 4-3.5" />
    </Base>
  );
}

export function IconeBalao(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 16c3.3 0 6-3.1 6-6.8A6 6 0 0 0 6 9.2C6 12.9 8.7 16 12 16Z" />
      <path d="M12 16v1.5c0 1.5-2 2-2 3.5" />
    </Base>
  );
}

export function IconePix(props: Props) {
  return (
    <Base {...props}>
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12 12 2.5Z" />
      <path d="M7.5 7 12 11.5 16.5 7M7.5 17 12 12.5l4.5 4.5" />
    </Base>
  );
}

export function IconeCedula(props: Props) {
  return (
    <Base {...props}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.01M18 14.5v.01" />
    </Base>
  );
}

export function IconeCartao(props: Props) {
  return (
    <Base {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6.5 15h4" />
    </Base>
  );
}
