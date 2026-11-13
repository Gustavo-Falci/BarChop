import { laminaEm } from "./abertura/lamina";
import estilos from "./Abertura.module.css";

// A navalha da abertura (home nova, marco 5): o desenho do MarcaDoBarChop
// em peças, sem o quadro escuro. A lâmina gira no pino (69 52) e o aço se
// deforma da barra reta até as barrigas do B; o gume é o fio da barra e os
// detalhes (o contorno, o furo e o risco dourado) só aparecem no B. Sai no
// primeiro estado da abertura: aberta (180°), barra reta, invisível. Quem
// mexe é o tocar.ts.
export function NavalhaDaAbertura() {
  return (
    <svg
      className={estilos.navalha}
      data-navalha=""
      viewBox="0 0 200 200"
      width="300"
      height="300"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(-16 4)">
        <path d="M70 36Q70 22 86 22" fill="none" stroke="#ECE6DA" strokeWidth="7" strokeLinecap="round" />
        <g data-lamina="" transform="rotate(180 69 52)">
          <path data-aco="" d={laminaEm(0)} fill="none" stroke="#ECE6DA" strokeWidth="19" />
          <path data-gume="" d="M99.5 56V162" fill="none" stroke="#B8B0A2" strokeWidth="2" />
          <g data-detalhe="" style={{ opacity: 0 }}>
            <path
              d="M84 52H110A24 24 0 0 1 110 100M84 100H116A33 33 0 0 1 116 166"
              fill="none"
              stroke="#B8B0A2"
              strokeWidth="2"
            />
            {/* O furo na cor do fundo do topo (dark.paperFim). */}
            <path d="M128 112 160 92 164 98 132 118Z" fill="#151412" />
            <path d="M140 136 168 119" fill="none" stroke="#E8C547" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
        <rect x="55" y="36" width="28" height="134" rx="14" fill="#E8C547" />
        <circle cx="69" cy="52" r="6.5" fill="#151412" />
        <circle cx="69" cy="52" r="2.6" fill="#E8C547" />
        <rect x="60.5" y="72" width="2" height="84" rx="1" fill="#151412" />
      </g>
    </svg>
  );
}
