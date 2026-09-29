"use client";

import estilos from "./ListaDeHorarios.module.css";

// Onde cada período começa. Comparação de string funciona porque toda
// hora trafega como "HH:mm" com zero à esquerda (ver formato/datas.ts).
const PERIODOS = [
  { nome: "Manhã", ate: "12:00" },
  { nome: "Tarde", ate: "18:00" },
  { nome: "Noite", ate: "24:00" },
];

export function ListaDeHorarios({
  horarios,
  selecionada,
  aoEscolher,
}: {
  horarios: string[];
  // Opcional: a tela de novo agendamento do painel chega com a hora já
  // preenchida pela URL que a agenda montou, e precisa marcar qual
  // botão é o atual. As telas que não passam nada continuam sem marca
  // nenhuma, como antes.
  selecionada?: string;
  aoEscolher: (hora: string) => void;
}) {
  // Visto no app rodando: um dia inteiro de 15 em 15 minutos são mais
  // de trinta botões, e numa parede só achar "fim da tarde" era contar
  // botão por botão. Período vazio some, como as seções da home.
  let inicio = "00:00";
  const grupos = PERIODOS.map(({ nome, ate }) => {
    const doPeriodo = horarios.filter((hora) => hora >= inicio && hora < ate);
    inicio = ate;
    return { nome, horarios: doPeriodo };
  }).filter((grupo) => grupo.horarios.length > 0);

  const botoes = (lista: string[]) => (
    <div className={estilos.grade}>
      {lista.map((hora) => (
        <button
          key={hora}
          type="button"
          className={estilos.horario}
          aria-current={hora === selecionada ? "true" : undefined}
          onClick={() => aoEscolher(hora)}
        >
          {hora}
        </button>
      ))}
    </div>
  );

  // Um período só dispensa cabeçalho: "Tarde" em cima de três horários
  // da tarde é rótulo que não separa nada.
  if (grupos.length <= 1) return botoes(horarios);

  return (
    <div className={estilos.periodos}>
      {grupos.map((grupo) => (
        <div
          key={grupo.nome}
          role="group"
          aria-labelledby={`periodo-${grupo.nome}`}
          className={estilos.periodo}
        >
          <p id={`periodo-${grupo.nome}`} className={estilos.nomeDoPeriodo}>
            {grupo.nome}
          </p>
          {botoes(grupo.horarios)}
        </div>
      ))}
    </div>
  );
}
