import { DIAS_DE_TESTE } from "@barchop/formato";
import { clashLeve } from "./fontesDaHome";
import { LinkDeAcao } from "./LinkDeAcao";
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
  celular: { srcs: [640, 1280], largura: 1280, altura: 1129, tamanho: "52vh" },
  computador: { srcs: [1280, 2200], largura: 1280, altura: 677, tamanho: "124vh" },
};

function srcset(nome: string, larguras: number[], tipo: "avif" | "webp") {
  return larguras.map((l) => `/home/${nome}-${l}.${tipo} ${l}w`).join(", ");
}

// O topo da home nova (marco 2), parado: fundo escuro com o feixe de luz
// e o sopro da grade da agenda, "Bar" fino atrás da cadeira e "Chop"
// pesado na frente, a promessa como título, o status de exemplo, o apoio
// e os convites. Componente de servidor: título, botões e imagem saem
// prontos no HTML. O movimento (cadeira 3D, rolagem, névoa) é o marco 3.
export function TopoDaHome() {
  return (
    <section
      id={ID_DO_TOPO}
      aria-labelledby="promessa"
      className={`${estilos.topo} ${clashLeve.variable}`}
    >
      <div className={estilos.grade} aria-hidden="true" />
      <div className={estilos.foco} aria-hidden="true" />

      {/* O nome é desenho: o leitor de tela lê a promessa, não "Bar Chop". */}
      <div className={estilos.nome} aria-hidden="true">
        <span className={`${estilos.metade} ${estilos.bar}`}>Bar</span>
        <span className={`${estilos.metade} ${estilos.chop}`}>Chop</span>
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
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivos prontos em public/home, sem o otimizador do Next na VM */}
        <img
          src="/home/cadeira-1280.webp"
          alt=""
          width={CADEIRA.computador.largura}
          height={CADEIRA.computador.altura}
          fetchPriority="high"
          decoding="async"
        />
      </picture>

      <h1 id="promessa" className={estilos.promessa}>
        <span className={estilos.leve}>Sua barbearia</span>{" "}
        <span className={estilos.forte}>agenda sozinha.</span>
      </h1>

      <p className={`${estilos.rotulo} ${estilos.status}`}>
        <span className={estilos.ponto} aria-hidden="true" />
        Exemplo · próximo horário livre 14:40
      </p>

      <div className={estilos.base}>
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
          <LinkDeAcao href={CADASTRO_PELA_HOME} grande className={estilos.ouro}>
            Criar minha barbearia grátis
          </LinkDeAcao>
          <LinkDeAcao href="#como-funciona" variante="contorno" grande className={estilos.linha}>
            Ver como funciona
          </LinkDeAcao>
        </div>
        <p className={`${estilos.rotulo} ${estilos.nota}`}>
          {DIAS_DE_TESTE} dias com tudo liberado · sem cartão
        </p>
      </div>
    </section>
  );
}
