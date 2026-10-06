import { useId, type ReactNode } from "react";
import estilos from "./SecaoNumerada.module.css";

// Um trecho de uma tela longa ("1 · A agenda que o cliente vê"), com a
// régua do título até a borda. Sem moldura de propósito: é divisão
// DENTRO de uma tela, não um cartão — e cartão dentro de cartão é o
// que a `Secao` viraria se fosse usada aqui.
export function SecaoNumerada({
  numero,
  titulo,
  apoio,
  lado,
  children,
}: {
  // A ordem é informação ("faça o 1 antes do 2"), por isso o número
  // entra no texto do título e não num pseudo-elemento do CSS.
  numero?: number;
  titulo: string;
  apoio?: ReactNode;
  // Um resumo curto na ponta da régua ("1 de 3 no ar", "13 mensagens").
  lado?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  const texto = numero === undefined ? titulo : `${numero} · ${titulo}`;

  return (
    <section className={estilos.secao} aria-labelledby={id}>
      <div className={estilos.topo}>
        <h2 id={id} className={estilos.titulo}>
          {texto}
        </h2>
        <span className={estilos.regua} aria-hidden="true" />
        {lado ? <span className={estilos.lado}>{lado}</span> : null}
      </div>
      {apoio ? <p className={estilos.apoio}>{apoio}</p> : null}
      <div className={estilos.corpo}>{children}</div>
    </section>
  );
}
