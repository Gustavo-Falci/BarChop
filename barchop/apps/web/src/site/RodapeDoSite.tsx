import Link from "next/link";
import estilos from "./RodapeDoSite.module.css";

export function RodapeDoSite() {
  return (
    <footer className={estilos.rodape}>
      <div className={estilos.conteudo}>
        <p className={estilos.marca}>BarChop</p>
        <p className={estilos.linha}>Agenda online para barbearias.</p>
        <nav aria-label="Documentos" className={estilos.documentos}>
          <Link href="/termos" className={estilos.link}>
            Termos de uso
          </Link>
          <Link href="/privacidade" className={estilos.link}>
            Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  );
}
