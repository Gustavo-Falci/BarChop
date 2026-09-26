"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { formatarTelefoneParcial } from "@gr-barber/formato";
import estilos from "./Campo.module.css";

// Os dois únicos ícones fora de `painel/icones.tsx`, e de propósito: o
// Campo é compartilhado com as telas públicas do cliente, e importar de
// `painel/` aqui inverteria a direção da dependência — um componente
// comum passaria a depender de uma pasta de tela. O esqueleto é o mesmo
// da família de lá: 24x24, só traço, `currentColor`, espessura 2, que é
// a --borda-padrao da casa.
//
// `aria-hidden` porque quem nomeia o botão é o `aria-label` dele, que
// muda com o estado. Sem isso o leitor de tela anunciaria duas vezes.
function Olho() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function OlhoRiscado() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 3 21 21" />
      <path d="M10.6 6.1A10 10 0 0 1 12 6c6.2 0 10 6 10 6a17 17 0 0 1-3.1 3.8" />
      <path d="M6.6 6.8A16.8 16.8 0 0 0 2 12s3.8 6 10 6a9.7 9.7 0 0 0 3.9-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

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
  // Fora do `...resto` porque o botão de revelar troca este valor: o
  // `type` que chega é a intenção de quem chamou, e o que vai pro input
  // é o efetivo, que depende do estado.
  type,
  ...resto
}: Props) {
  const id = useId();
  const [interno, setInterno] = useState("");
  const [senhaRevelada, setSenhaRevelada] = useState(false);
  // Controlado quando o pai manda `valor`; senão o campo cuida de si.
  // Sem isso não haveria como preencher nome e telefone a partir da
  // sessão do cliente.
  const atual = valor ?? interno;

  // Automático, e não uma prop que cada tela liga: um campo de senha sem
  // como conferir o que foi digitado é sempre pior, e deixar isso opcional
  // garantiria que a próxima tela esquecesse. Hoje o gatilho atinge
  // exatamente as duas telas de login, que são os únicos `type="password"`
  // do app.
  const ehSenha = type === "password";
  const tipoEfetivo = ehSenha && senhaRevelada ? "text" : type;

  const entrada = (
    <input
      id={id}
      className={estilos.entrada}
      type={tipoEfetivo}
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
  );

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

      {/* O invólucro só existe no campo de senha. Envolver sempre
          mudaria o DOM das dez telas que usam Campo pra resolver um
          problema que só uma tem. */}
      {ehSenha ? (
        <div className={estilos.caixaDeSenha}>
          {entrada}
          {/* Nome acessível pelo `aria-label`, que MUDA com o estado, em
              vez de um `aria-pressed` num botão sem texto: "Mostrar
              senha" / "Ocultar senha" diz o que vai acontecer, enquanto
              "pressionado" obrigaria a deduzir. Um dos dois, nunca os
              dois — juntos, o leitor anuncia estado duas vezes.

              `type="button"` porque o campo vive dentro de um <form>, e
              um <button> sem type é submit: revelar a senha enviaria o
              formulário. */}
          <button
            type="button"
            className={estilos.revelar}
            onClick={() => setSenhaRevelada((anterior) => !anterior)}
            aria-label={senhaRevelada ? "Ocultar senha" : "Mostrar senha"}
            aria-controls={id}
          >
            {senhaRevelada ? <OlhoRiscado /> : <Olho />}
          </button>
        </div>
      ) : (
        entrada
      )}

      {/* `role="alert"` porque o erro aparece DEPOIS de uma ação da
          pessoa — quem não está olhando pro campo (leitor de tela, ou
          quem apertou Enter esperando entrar) não fica sabendo que
          apareceu. O `aria-describedby` acima resolve outra coisa: faz
          o erro ser lido quando o foco CHEGA no campo, não quando ele
          surge. Mesmo motivo do `role` no componente Aviso. */}
      {erro ? (
        <span className={estilos.erro} id={`${id}-erro`} role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  );
}
