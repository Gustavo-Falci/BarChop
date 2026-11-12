// A marca do BarChop, "Navalha em B", no quadro escuro do ícone do app: o
// cabo dourado é a haste do B e a lâmina de aço, aberta 11° no pino, faz as
// duas barrigas. O desenho é o de scripts/marca/gerar.mts (que gera o
// favicon e os ícones); aqui os furos são pintados na cor do quadro em vez
// de vazados por máscara, porque o quadro sempre está atrás.
//
// Decorativa: quem usa põe o nome "BarChop" em texto ao lado.
export function MarcaDoBarChop({ tamanho = 32, className }: { tamanho?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 200 200"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="196" height="196" rx="46" fill="#1A1A1A" />
      <rect x="3.5" y="3.5" width="193" height="193" rx="44.5" fill="none" stroke="#3A3631" strokeWidth="3" />
      <g transform="translate(-16 4)">
        <path d="M70 36Q70 22 86 22" fill="none" stroke="#ECE6DA" strokeWidth="7" strokeLinecap="round" />
        <g transform="rotate(-11 69 52)">
          <path
            d="M80 52H110A24 24 0 0 1 110 100H80M80 100H116A33 33 0 0 1 116 166H80"
            fill="none"
            stroke="#ECE6DA"
            strokeWidth="19"
          />
          <path
            d="M84 52H110A24 24 0 0 1 110 100M84 100H116A33 33 0 0 1 116 166"
            fill="none"
            stroke="#B8B0A2"
            strokeWidth="2"
          />
          <path d="M128 112 160 92 164 98 132 118Z" fill="#1A1A1A" />
          <path d="M140 136 168 119" fill="none" stroke="#E8C547" strokeWidth="3" strokeLinecap="round" />
        </g>
        <rect x="55" y="36" width="28" height="134" rx="14" fill="#E8C547" />
        <circle cx="69" cy="52" r="6.5" fill="#1A1A1A" />
        <circle cx="69" cy="52" r="2.6" fill="#E8C547" />
        <rect x="60.5" y="72" width="2" height="84" rx="1" fill="#1A1A1A" />
      </g>
    </svg>
  );
}
