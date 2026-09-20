"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { formatarTelefoneParcial } from "@gr-barber/formato";
import estilos from "./Campo.module.css";

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  rotulo: string;
  // Dica que FICA — regra de formato, limite, o que o campo aceita. O
  // placeholder some na primeira tecla, que é justamente quando a
  // pessoa quer conferir o que está digitando contra o exemplo.
  apoio?: string;
  erro?: string;
  formato?: "telefone";
  valor?: string;
  onChange?: (valor: string) => void;
}

export function Campo({
  rotulo,
  apoio,
  erro,
  formato,
  valor,
  onChange,
  ...resto
}: Props) {
  const id = useId();
  const [interno, setInterno] = useState("");
  // Controlado quando o pai manda `valor`; senão o campo cuida de si.
  // Sem isso não haveria como preencher nome e telefone a partir da
  // sessão do cliente.
  const atual = valor ?? interno;

  return (
    <div className={estilos.campo}>
      <label className={estilos.rotulo} htmlFor={id}>
        {rotulo}
      </label>
      {apoio ? (
        <span className={estilos.apoio} id={`${id}-apoio`}>
          {apoio}
        </span>
      ) : null}
      <input
        id={id}
        className={estilos.entrada}
        aria-invalid={erro ? "true" : undefined}
        // Os dois, quando os dois existem: com só o erro, quem usa
        // leitor de tela perde a regra de formato no momento em que
        // mais precisa dela — o de tê-la quebrado.
        aria-describedby={
          [apoio ? `${id}-apoio` : null, erro ? `${id}-erro` : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        value={atual}
        onChange={(evento) => {
          // A API guarda um formato só e recusa os outros com 400.
          // Formatar aqui é o que evita o erro no envio; a validação
          // que lança continua sendo o normalizarTelefone.
          const proximo =
            formato === "telefone"
              ? formatarTelefoneParcial(evento.target.value)
              : evento.target.value;
          setInterno(proximo);
          onChange?.(proximo);
        }}
        {...resto}
      />
      {erro ? (
        <span className={estilos.erro} id={`${id}-erro`}>
          {erro}
        </span>
      ) : null}
    </div>
  );
}
