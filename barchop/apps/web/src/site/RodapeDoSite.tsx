import estilos from "./RodapeDoSite.module.css";

export function RodapeDoSite() {
  return (
    <footer className={estilos.rodape}>
      <div className={estilos.conteudo}>
        <p className={estilos.marca}>BarChop</p>
        <p className={estilos.linha}>Agenda online para barbearias.</p>
      </div>
    </footer>
  );
}
