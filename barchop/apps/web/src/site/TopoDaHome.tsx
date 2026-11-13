import { DIAS_DE_TESTE } from "@barchop/formato";
import estilosDaAbertura from "./Abertura.module.css";
import { AberturaDaHome } from "./AberturaDaHome";
import { CadeiraViva } from "./CadeiraViva";
import { clashLeve } from "./fontesDaHome";
import { GradeDaAgenda } from "./GradeDaAgenda";
import { LinkDeAcao } from "./LinkDeAcao";
import { NavalhaDaAbertura } from "./NavalhaDaAbertura";
import estilos from "./TopoDaHome.module.css";

// O id que o CabecalhoDaHome observa pra saber se ainda está sobre o topo.
export const ID_DO_TOPO = "topo-da-home";

// Marcado como vindo da home (linha de base, marco 1).
const CADASTRO_PELA_HOME = "/painel/cadastro?origem=home";

// A cadeira parada: um quadro da cena 3D do protótipo (pnpm
// foto-da-cadeira). O computador recebe o quadro inteiro, com a poça de
// luz; o celular, o miolo. As larguras e alturas são as dos arquivos e
// reservam o lugar antes de a imagem chegar.
const CADEIRA = {
  celular: { srcs: [640, 960, 1280],largura: 1280, altura: 1129, tamanho: "52vh" },
  computador: { srcs: [1280, 2200], largura: 1280, altura: 677, tamanho: "124vh" },
};

function srcset(nome: string, larguras: number[], tipo: "avif" | "webp") {
  return larguras.map((l) => `/assets/home/${nome}-${l}.${tipo} ${l}w`).join(", ");
}

// O topo da home nova: fundo escuro com o feixe de luz e o sopro da grade
// da agenda, "Bar" fino atrás da cadeira e "Chop" pesado na frente, a
// promessa como título, o status de exemplo, o apoio e os convites.
// Componente de servidor: título, botões e a imagem parada da cadeira
// saem prontos no HTML (marco 2). Por cima, a CadeiraViva põe a cadeira
// 3D quando o aparelho aguenta e alonga o trilho, que prende o topo
// enquanto a rolagem gira, aproxima e dissolve a cadeira na névoa
// (marco 3); sem ela, o trilho tem a altura do topo e nada fica preso.
//
// Na primeira visita da sessão, o topo começa pela abertura da navalha
// (marco 5): as peças dela (o botão de pular, a agenda do dia, os fios, a
// navalha e os cantos) só aparecem com a classe que o script inline põe
// no <html>, e a AberturaDaHome toca e devolve o topo de sempre.
export function TopoDaHome() {
  return (
    <div className={estilos.trilho} data-trilho="">
      <section
        id={ID_DO_TOPO}
        data-topo=""
        aria-labelledby="promessa"
        className={`${estilos.topo} ${clashLeve.variable}`}
      >
        {/* A camada escura: some com a névoa e deixa o papel do site. */}
        <div className={estilos.fundo} aria-hidden="true" />
        {/* Primeiro no Tab durante a abertura; sem ela, não existe (display: none). */}
        <button type="button" className={estilosDaAbertura.pular} data-pular="">
          Pular abertura
        </button>
        <div className={estilos.grade} data-sopro="" aria-hidden="true" />
        <div className={estilos.foco} data-foco="" aria-hidden="true" />
        <GradeDaAgenda />

        {/* O nome é desenho: o leitor de tela lê a promessa, não "Bar Chop". */}
        <div className={estilos.nome} aria-hidden="true">
          <span className={`${estilos.metade} ${estilos.bar}`} data-metade="bar">
            Bar
          </span>
          <span className={`${estilos.metade} ${estilos.chop}`} data-metade="chop">
            Chop
          </span>
        </div>

        <picture className={estilos.cadeira}>
          <source
            media="(max-width: 760px)"
            type="image/avif"
            srcSet={srcset("cadeira-celular", CADEIRA.celular.srcs, "avif")}
            sizes={CADEIRA.celular.tamanho}
            width={CADEIRA.celular.largura}
            height={CADEIRA.celular.altura}
          />
          <source
            media="(max-width: 760px)"
            type="image/webp"
            srcSet={srcset("cadeira-celular", CADEIRA.celular.srcs, "webp")}
            sizes={CADEIRA.celular.tamanho}
            width={CADEIRA.celular.largura}
            height={CADEIRA.celular.altura}
          />
          <source
            type="image/avif"
            srcSet={srcset("cadeira", CADEIRA.computador.srcs, "avif")}
            sizes={CADEIRA.computador.tamanho}
          />
          <source
            type="image/webp"
            srcSet={srcset("cadeira", CADEIRA.computador.srcs, "webp")}
            sizes={CADEIRA.computador.tamanho}
          />
          {/* <img> puro: arquivos prontos em public/home, sem o otimizador do Next na VM. */}
          <img
            src="/assets/home/cadeira-1280.webp"
            alt=""
            width={CADEIRA.computador.largura}
            height={CADEIRA.computador.altura}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <CadeiraViva />

        <svg className={estilosDaAbertura.fios} data-fios="" aria-hidden="true" focusable="false" />
        <NavalhaDaAbertura />
        <div className={estilosDaAbertura.cantos} data-cantos="" aria-hidden="true">
          <p className={`${estilosDaAbertura.canto} ${estilosDaAbertura.marca}`}>BarChop · agenda online</p>
          <p className={`${estilosDaAbertura.canto} ${estilosDaAbertura.publico}`}>Para barbearias</p>
          <p className={`${estilosDaAbertura.canto} ${estilosDaAbertura.livres}`}>
            Livres hoje{" "}
            <b className={estilosDaAbertura.contador} data-contador="">
              8
            </b>
          </p>
        </div>
        <AberturaDaHome />

        <h1 id="promessa" className={estilos.promessa} data-peca="promessa">
          <span className={estilos.leve}>Sua barbearia</span>{" "}
          <span className={estilos.forte}>agenda sozinha.</span>
        </h1>

        <p className={`${estilos.rotulo} ${estilos.status}`} data-peca="status">
          <span className={estilos.ponto} aria-hidden="true" />
          Exemplo · próximo horário livre 14:40
        </p>

        <div className={estilos.base} data-peca="base">
          <p className={`${estilos.rotulo} ${estilos.chapeu}`}>Agenda online para barbearias</p>
          <p className={estilos.apoio}>
            O cliente marca pelo link da sua barbearia, escolhe o profissional e
            recebe lembrete.{" "}
            <strong>
              Você para de responder “tem horário?” no WhatsApp e perde menos
              horário pra falta.
            </strong>
          </p>
          <div className={estilos.botoes}>
            <LinkDeAcao href={CADASTRO_PELA_HOME} className={estilos.ouro}>
              Criar minha barbearia grátis
            </LinkDeAcao>
            <LinkDeAcao href="#como-funciona" variante="contorno" className={estilos.linha}>
              Ver como funciona
            </LinkDeAcao>
          </div>
          <p className={`${estilos.rotulo} ${estilos.nota}`}>
            {DIAS_DE_TESTE} dias com tudo liberado · sem cartão
          </p>
        </div>
      </section>
    </div>
  );
}
