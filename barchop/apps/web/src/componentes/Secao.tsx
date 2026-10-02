import type { ReactNode } from "react";
import estilos from "./Secao.module.css";

// Um bloco de configuração: título, o que ele faz, os campos e a ação
// que salva só aquilo. Existe porque a tela de Configurações são três
// formulários independentes — barbearia, horários e perfil, cada um
// com o seu botão — e sem moldura nem rodapé os três liam como uma
// lista contínua em que não dava pra saber qual botão salvava o quê.
export function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao?: ReactNode;
  // A ação vai pro rodapé, depois da régua. Opcional porque nem todo
  // bloco salva algo — um que só mostre informação não precisa.
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={estilos.secao}>
      <div className={estilos.topo}>
        <h2 className={estilos.titulo}>{titulo}</h2>
        {descricao ? <p className={estilos.descricao}>{descricao}</p> : null}
      </div>
      <div className={estilos.corpo}>{children}</div>
      {acao ? <div className={estilos.rodape}>{acao}</div> : null}
    </section>
  );
}
