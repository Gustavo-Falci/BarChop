import type { ReactNode } from "react";
import estilos from "./Aviso.module.css";

type Tom = "erro" | "sucesso";

// `role="alert"` porque a mensagem aparece depois de uma ação da
// pessoa: sem ele, quem usa leitor de tela não fica sabendo.
//
// O tom é "erro" por padrão porque era o único que existia — assim
// nenhuma das telas que já usam o componente muda de aparência. O
// "sucesso" entrou pra confirmar o cadastro: navegar pra outra tela é
// feedback implícito, e quem chega lá não distingue "acabei de criar"
// de "abri um cadastro antigo".
export function Aviso({
  children,
  tom = "erro",
}: {
  children: ReactNode;
  tom?: Tom;
}) {
  return (
    <p className={`${estilos.aviso} ${estilos[tom]}`} role="alert">
      {children}
    </p>
  );
}
