import Link from "next/link";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./CabecalhoDoSite.module.css";

// Links do painel relativos: no www o proxy os manda com 308 pro host
// `painel.` (src/tenant/rota.ts); em desenvolvimento abrem aqui mesmo.
export function CabecalhoDoSite() {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.conteudo}>
        <Link href="/" className={estilos.marca}>
          BarChop
        </Link>
        <nav aria-label="Conta" className={estilos.nav}>
          <Link href="/painel/entrar" className={estilos.entrar}>
            Entrar
          </Link>
          <LinkDeAcao href="/painel/cadastro">Criar barbearia</LinkDeAcao>
        </nav>
      </div>
    </header>
  );
}
