import Link from "next/link";
import { BotaoLink } from "../componentes/Botao";
import { MarcaDoBarChop } from "../componentes/MarcaDoBarChop";
import { BarraDaEntrada } from "../componentes/TelaDeEntrada";
import { CabecalhoDoSite } from "../site/CabecalhoDoSite";
import { LinkDeAcao } from "../site/LinkDeAcao";
import { baseDoSite } from "../site/rastreadores";
import { RodapeDoSite } from "../site/RodapeDoSite";
import type { VersaoDoNaoEncontrado } from "../tenant/naoEncontrado";
import estilos from "./NaoEncontrado.module.css";

// O 404 (canvas "Página não encontrada", aprovado 15/11), em três versões:
// - site: o cabeçalho e o rodapé de sempre, o site segue claro;
// - barbearia: o link de uma barbearia que não existe, no tema do aparelho,
//   com o BarChop no pé;
// - painel: sem os links do site, com o caminho de volta ao painel.
// O tema de cada uma vem do script do layout raiz, pelo endereço.
export function NaoEncontrado({
  versao,
  urlDoSite,
}: {
  versao: VersaoDoNaoEncontrado;
  urlDoSite: string | undefined;
}) {
  if (versao === "barbearia") return <DaBarbearia urlDoSite={urlDoSite} />;
  if (versao === "painel") return <DoPainel />;
  return <DoSite />;
}

function Rotulo() {
  return <p className={estilos.rotulo}>Erro 404</p>;
}

function DoSite() {
  return (
    <div className={estilos.telaInteira}>
      <CabecalhoDoSite />
      <main className={estilos.site}>
        <div className={estilos.texto}>
          <Rotulo />
          <h1 className={estilos.tituloDoSite}>Não encontramos esta página</h1>
          <p className={estilos.apoio}>O endereço pode ter mudado ou estar escrito errado.</p>
          <p className={estilos.apoio}>
            Procurando uma barbearia? Peça o link dela, que é algo como{" "}
            <strong className={estilos.endereco}>suabarbearia.barchop.com.br</strong>.
          </p>
          <div className={estilos.acoes}>
            <LinkDeAcao href="/">Ir para o início</LinkDeAcao>
            <Link href="/precos" className={estilos.linkDeTexto}>
              Ver os preços
            </Link>
          </div>
        </div>
      </main>
      <RodapeDoSite />
    </div>
  );
}

function DaBarbearia({ urlDoSite }: { urlDoSite: string | undefined }) {
  // O pé leva ao site do BarChop, que mora em outro host: endereço inteiro.
  const site = baseDoSite(urlDoSite)?.toString() ?? "/";
  return (
    <div className={estilos.telaInteira}>
      <main className={estilos.barbearia}>
        <Rotulo />
        <h1 className={estilos.titulo}>Não encontramos essa barbearia</h1>
        <p className={estilos.apoio}>
          O link pode ter mudado ou estar escrito errado. Peça o endereço certo pra barbearia, pelo
          WhatsApp ou no balcão.
        </p>
      </main>
      <footer className={estilos.pe}>
        <p className={estilos.feitaCom}>
          <MarcaDoBarChop tamanho={22} />
          Agenda feita com BarChop
        </p>
        <a href={site} className={estilos.conheca}>
          É dono de barbearia? Conheça o BarChop
        </a>
      </footer>
    </div>
  );
}

function DoPainel() {
  return (
    <div className={estilos.telaInteira}>
      <BarraDaEntrada sempreVisivel />
      <main className={estilos.painel}>
        <Rotulo />
        <h1 className={estilos.titulo}>Não encontramos esta página</h1>
        <p className={estilos.apoio}>
          O endereço pode ter mudado ou estar escrito errado. Sua agenda e seus dados estão como
          sempre.
        </p>
        <div className={estilos.voltar}>
          <BotaoLink href="/painel">Voltar ao painel</BotaoLink>
        </div>
      </main>
    </div>
  );
}
