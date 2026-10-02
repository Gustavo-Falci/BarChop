import estilos from "./Estatistica.module.css";

export function Estatistica({
  numero,
  legenda,
}: {
  numero: string;
  legenda: string;
}) {
  return (
    <div className={estilos.bloco}>
      <span className={estilos.numero}>{numero}</span>
      <span className={estilos.legenda}>{legenda}</span>
    </div>
  );
}
