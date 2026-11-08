"use client";

import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import estilos from "./EscolhaDaDuracao.module.css";

const DURACOES = [5, 10, 15, 20, 25];

// O passo Duração do Novo agendamento (canvas "Agenda: encaixe e horário
// quebrado", prancha Enc-NovoAgendamento-Encaixe): a do serviço, ou um
// encaixe menor pra caber num buraco. Só oferece as durações menores que
// os serviços; com 5 min de serviço não há encaixe.
export function EscolhaDaDuracao({
  soma,
  encaixe,
  preco,
  aoTrocar,
}: {
  soma: number;
  encaixe: number | undefined;
  preco: string;
  aoTrocar: (duracao: number | undefined) => void;
}) {
  const menores = DURACOES.filter((duracao) => duracao < soma);
  // Ao ligar o encaixe, 15 min — o buraco mais comum na agenda — ou o
  // maior que couber abaixo do serviço.
  const padrao = menores.includes(15) ? 15 : menores[menores.length - 1];

  return (
    <div className={estilos.duracao}>
      <SeletorEmPilulas<"servico" | "encaixe">
        nome="duracao"
        legenda="Duração"
        legendaOculta
        preencher
        opcoes={[
          { valor: "servico", rotulo: `Do serviço · ${soma} min` },
          ...(menores.length > 0 ? [{ valor: "encaixe" as const, rotulo: "Encaixe" }] : []),
        ]}
        valor={encaixe ? "encaixe" : "servico"}
        aoTrocar={(modo) => aoTrocar(modo === "encaixe" ? padrao : undefined)}
      />
      {encaixe ? (
        <SeletorEmPilulas
          nome="duracao-do-encaixe"
          legenda="Quanto tempo o encaixe leva"
          legendaOculta
          preencher
          opcoes={menores.map((duracao) => ({ valor: String(duracao), rotulo: `${duracao} min` }))}
          valor={String(encaixe)}
          aoTrocar={(valor) => aoTrocar(Number(valor))}
          efeito={`Pra caber num buraco da agenda. O preço continua o do serviço, ${preco}, e na agenda ele aparece como encaixe.`}
        />
      ) : null}
    </div>
  );
}
