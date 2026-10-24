"use client";

import { useId } from "react";
import { Indicador } from "../movimento/Indicador";
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
  marcados,
  aoTrocar,
}: {
  // Nome do grupo pro leitor de tela ("Filtrar clientes").
  rotulo: string;
  opcoes: OpcaoDeFiltro<V>[];
  valor?: V;
  // Vários ativos de uma vez (o filtro de profissionais da agenda): quem
  // decide o que um clique liga ou desliga é a tela, pelo `aoTrocar`.
  marcados?: V[];
  aoTrocar: (valor: V) => void;
}) {
  const grupo = useId();
  const ativo = (opcao: V) => (marcados ? marcados.includes(opcao) : opcao === valor);
  return (
    <div className={estilos.pilulas} role="group" aria-label={rotulo}>
      {opcoes.map((opcao) => {
        const comTom = opcao.tom && (opcao.contagem ?? 0) > 0 ? estilos[opcao.tom] : "";
        return (
          <button
            key={opcao.valor}
            type="button"
            className={[estilos.pilula, comTom].filter(Boolean).join(" ")}
            aria-pressed={ativo(opcao.valor)}
            onClick={() => aoTrocar(opcao.valor)}
          >
            {/* Com vários ativos, cada um com o seu indicador: um só
                deslizando entre eles não teria pra onde ir. */}
            {ativo(opcao.valor) ? (
              <Indicador grupo={marcados ? `${grupo}-${opcao.valor}` : grupo} className={estilos.indicador} />
            ) : null}
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
