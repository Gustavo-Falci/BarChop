import Link from "next/link";
import { MarcaDoBarChop } from "../componentes/MarcaDoBarChop";
import { LinkDeAcao } from "./LinkDeAcao";
import { LinkDoSite } from "./LinkDoSite";
import estilos from "./CabecalhoDoSite.module.css";

// Links do painel relativos e em <a> comum (LinkDoSite): no www o proxy
// os manda com 308 pro host `painel.` (src/tenant/rota.ts); em
// desenvolvimento abrem aqui mesmo.
export function CabecalhoDoSite() {
  return (
    <header className={estilos.cabecalho}>
      <div className={estilos.conteudo}>
        <Link href="/" className={estilos.marca}>
          <MarcaDoBarChop tamanho={30} />
          BarChop
        </Link>
        <nav aria-label="Conta" className={estilos.nav}>
          <Link href="/precos" className={`${estilos.entrar} ${estilos.precos}`}>
            Preços
          </Link>
          <LinkDoSite href="/painel/entrar" className={estilos.entrar}>
            Entrar
          </LinkDoSite>
          <LinkDeAcao href="/painel/cadastro">Criar barbearia</LinkDeAcao>
        </nav>
      </div>
    </header>
  );
}
