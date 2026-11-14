import estilos from "./Abertura.module.css";

// A agenda do dia na abertura (home nova, marco 5; o grade.js do
// protótipo): dez horários, quatro profissionais e os agendamentos que a
// navalha acende quando passa. Só desenho: os nomes e serviços são de
// exemplo e o leitor de tela não ouve nada daqui.

const HORAS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

// [profissional (coluna 1..4), horário (0..9), duração em horas, serviço, cliente]
const AGENDAMENTOS: [number, number, number, string, string][] = [
  [4, 0, 1, "Corte", "Diego"],
  [2, 0, 2, "Corte e barba", "Bruno"],
  [1, 0, 1, "Corte", "Rafael"],
  [3, 1, 1, "Barba", "Caio"],
  [4, 2, 2, "Corte e barba", "Lucas"],
  [1, 2, 1, "Degradê", "Thiago"],
  [3, 3, 1, "Corte", "Pedro"],
  [2, 4, 1, "Barba", "Vitor"],
  [1, 4, 2, "Pigmentação", "André"],
  [4, 5, 1, "Sobrancelha", "Felipe"],
  [3, 5, 2, "Corte e barba", "Mateus"],
  [2, 6, 1, "Corte", "Igor"],
  [4, 7, 2, "Corte", "Léo"],
  [1, 7, 1, "Corte", "Gabriel"],
  [3, 8, 1, "Corte", "Rui"],
  [2, 8, 1, "Barba", "Davi"],
];

// A posição de cada peça é a do grade.js: a coluna 1..4 em larguras de
// --cw (a coluna 0 é a dos horários) e as linhas em 10% da altura.
function posicao(coluna: number, linha: number, duracao: number) {
  return {
    left: `calc(${coluna} * var(--cw) + 0.5%)`,
    width: "calc(var(--cw) - 1%)",
    top: `${linha * 10 + 0.5}%`,
    height: `${duracao * 10 - 1}%`,
  };
}

// `sopro`: a mesma agenda, cheia e sem texto, no fundo do topo de sempre
// (o protótipo deixa a grade da abertura como sopro nos cantos). Sem
// data-bloco: a abertura não acende estes.
export function GradeDaAgenda({ sopro = false }: { sopro?: boolean }) {
  return (
    <div
      className={sopro ? estilos.sopro : estilos.agenda}
      {...(sopro ? {} : { "data-agenda": "" })}
      aria-hidden="true"
    >
      {HORAS.map((hora, i) => (
        <span key={hora} className={estilos.hora} style={{ top: `${i * 10}%` }}>
          {hora}
        </span>
      ))}
      {AGENDAMENTOS.map(([coluna, linha, duracao, servico, cliente]) => (
        <span
          key={`${coluna}-${linha}`}
          className={estilos.bloco}
          data-col={coluna}
          {...(sopro ? {} : { "data-bloco": "" })}
          style={posicao(coluna, linha, duracao)}
        >
          <span className={estilos.servico}>{servico}</span>
          <span className={estilos.cliente}>{cliente}</span>
        </span>
      ))}
    </div>
  );
}
