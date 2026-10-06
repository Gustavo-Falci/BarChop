"use client";

import estilos from "./PilulasDeFiltro.module.css";

export interface OpcaoDeFiltro<V extends string> {
  valor: V;
  rotulo: string;
  // Quantos itens a lista teria com este filtro. Entra no nome do botão
  // ("Atrasados 3"): quem ouve sabe quantos há antes de escolher.
  contagem?: number;
  // A cor do significado ("Atrasados" em erro, "Pendentes" em atenção).
  // Só pinta quando há o que contar — um "Atrasados 0" vermelho grita
  // por nada.
  tom?: "ok" | "atencao" | "erro";
}

// Filtros de uma lista, um ativo por vez. Botões com `aria-pressed`, e
// não rádios: filtrar troca o que a tela mostra, não um valor de
// formulário — pra isso existe o `SeletorEmPilulas`.
export function PilulasDeFiltro<V extends string>({
  rotulo,
  opcoes,
  valor,
  aoTrocar,
}: {
  // Nome do grupo pro leitor de tela ("Filtrar clientes").
  rotulo: string;
  opcoes: OpcaoDeFiltro<V>[];
  valor: V;
  aoTrocar: (valor: V) => void;
}) {
  return (
    <div className={estilos.pilulas} role="group" aria-label={rotulo}>
      {opcoes.map((opcao) => {
        const comTom = opcao.tom && (opcao.contagem ?? 0) > 0 ? estilos[opcao.tom] : "";
        return (
          <button
            key={opcao.valor}
            type="button"
            className={[estilos.pilula, comTom].filter(Boolean).join(" ")}
            aria-pressed={opcao.valor === valor}
            onClick={() => aoTrocar(opcao.valor)}
          >
            {opcao.rotulo}
            {/* O espaço fica FORA do <span>: dentro, o nome acessível
                saía "Atrasados3" — o espaço inicial do filho é
                descartado ao montar o nome do botão. */}
            {opcao.contagem === undefined ? null : (
              <>
                {" "}
                <span className={estilos.contagem}>{opcao.contagem}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
