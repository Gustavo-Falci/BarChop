"use client";

import Link from "next/link";
import type { ServicoSerializado } from "@barchop/types";
import { rotuloDoDia } from "../formato/datas";
import { IconeCheck, IconeRelogio } from "../painel/icones";
import { formatarPreco } from "./ItemDeServico";
import { MiniaturaDoServico } from "./MiniaturaDoServico";
import estilos from "./CartaoDeServico.module.css";

export interface HorarioProximo {
  data: string;
  horaInicio: string;
  // Para onde o atalho leva: a confirmação só com este serviço.
  href: string;
}

// Agrupa os próximos horários por dia, na ordem em que vieram (a API já
// manda em ordem): "amanhã 09:00 09:30 10:00" lê melhor que três
// "amanhã" repetidos.
function porDia(horarios: HorarioProximo[]): [string, HorarioProximo[]][] {
  const dias = new Map<string, HorarioProximo[]>();
  for (const horario of horarios) {
    if (!dias.has(horario.data)) dias.set(horario.data, []);
    dias.get(horario.data)!.push(horario);
  }
  return [...dias.entries()];
}

// O cartão de um serviço na escolha de serviços do cliente. Por cima, um
// <label> com um checkbox de verdade: é o que dá teclado, leitor de tela
// e o papel "checkbox". O quadrado com o check é só o desenho dele. Os
// próximos horários ficam FORA do label: um link dentro de um label
// disputaria o clique com o checkbox.
export function CartaoDeServico({
  servico,
  marcado,
  aoAlternar,
  proximos,
  agora,
}: {
  servico: ServicoSerializado;
  marcado: boolean;
  aoAlternar: (id: string) => void;
  proximos: HorarioProximo[];
  agora: Date;
}) {
  return (
    <li className={`${estilos.cartao} ${marcado ? estilos.marcado : ""}`}>
      <label className={estilos.escolha}>
        <input
          className={estilos.caixa}
          type="checkbox"
          checked={marcado}
          onChange={() => aoAlternar(servico.id)}
        />
        <span className={estilos.foto}>
          <MiniaturaDoServico nome={servico.nome} fotoUrl={servico.fotoUrl} tamanho="grande" />
        </span>
        <span className={estilos.texto}>
          <span className={estilos.nome}>{servico.nome}</span>
          {servico.descricao ? (
            <span className={estilos.descricao}>{servico.descricao}</span>
          ) : null}
        </span>
        <span className={estilos.valores}>
          <span className={estilos.preco}>{formatarPreco(servico.preco)}</span>
          <span className={estilos.duracao}>
            <IconeRelogio width={14} height={14} />
            {servico.duracaoMinutos} min
          </span>
        </span>
        <span className={estilos.marca} aria-hidden="true">
          <IconeCheck width={18} height={18} strokeWidth={3} />
        </span>
      </label>

      {proximos.length > 0 ? (
        <ul className={estilos.proximos} aria-label={`Próximos horários de ${servico.nome}`}>
          {porDia(proximos).map(([data, horarios]) => {
            const dia = rotuloDoDia(data, agora);
            return (
              <li key={data} className={estilos.dia}>
                <span className={estilos.rotuloDoDia}>{dia}</span>
                {horarios.map((horario) => (
                  <Link
                    key={horario.horaInicio}
                    className={estilos.horario}
                    href={horario.href}
                    aria-label={`Agendar só ${servico.nome}, ${dia} às ${horario.horaInicio}`}
                  >
                    {horario.horaInicio}
                  </Link>
                ))}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}
