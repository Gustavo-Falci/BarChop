import estilos from "./IndicadorDePasso.module.css";

const TOTAL = 4;

// Onde o cliente está no fluxo de agendar (análise de 17/10): quatro
// segmentos, os feitos e o atual pintados, e o "Passo 3 de 4" em texto —
// é ele que o leitor de tela lê; os segmentos são só desenho.
export function IndicadorDePasso({ atual }: { atual: 1 | 2 | 3 | 4 }) {
  return (
    <div className={estilos.indicador}>
      <span className={estilos.texto}>
        Passo {atual} de {TOTAL}
      </span>
      <span className={estilos.segmentos} aria-hidden="true">
        {Array.from({ length: TOTAL }, (_, indice) => (
          <span
            key={indice}
            className={estilos.segmento}
            data-feito={indice < atual || undefined}
            data-atual={indice === atual - 1 || undefined}
          />
        ))}
      </span>
    </div>
  );
}
