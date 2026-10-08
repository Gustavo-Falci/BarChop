"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { LogoDaBarbearia } from "../componentes/LogoDaBarbearia";
import { useNoHost } from "../tenant/ProvedorDoHost";
import { LinkDaConta } from "./LinkDaConta";
import estilos from "./BarraDaBarbearia.module.css";

// De quem é esta página. O fluxo do cliente chega por um link de
// WhatsApp, e fora da página inicial da barbearia o nome dela não
// aparecia em lugar nenhum: quem abria /<slug>/entrar ou um passo do
// agendamento via "Minha conta" e "Escolha um horário" sem nada dizendo
// de qual barbearia se trata.
//
// Não é o CabecalhoDaPagina de `componentes/`: aquele é título e ação
// DE UMA tela, e vive no painel. Esta é identidade, e vive no layout —
// aparece igual em todas as telas do fluxo, e não remonta a cada
// navegação porque o layout do App Router persiste.
export function BarraDaBarbearia() {
  const { slug } = useParams<{ slug: string }>();
  const pathname = usePathname();
  const noHost = useNoHost();

  // Na página da própria barbearia o nome já é o <h1>. Repetir aqui
  // seria o mesmo texto duas vezes, um colado no outro — que se lê como
  // defeito, não como marca. No host da barbearia a página dela é "/":
  // sob a reescrita do proxy, o usePathname devolve o caminho do
  // navegador, não o de /[slug].
  if (pathname === `/${slug}` || pathname === noHost(`/${slug}`)) return null;

  return (
    <header className={estilos.barra}>
      <div className={estilos.interno}>
        <Marca slug={slug} />
      </div>
    </header>
  );
}

// Separado porque é ele que busca: deixar o useRequisicao no componente
// de cima faria a chamada acontecer também na página inicial, onde a
// barra nem é desenhada — e lá a tela já busca o mesmo perfil.
function Marca({ slug }: { slug: string }) {
  const api = useApi();
  const noHost = useNoHost();
  const { dados } = useRequisicao(
    () => api.publico.perfilDaBarbearia(slug),
    [slug]
  );

  // Carregando ou erro (slug que não existe, API fora): a barra fica,
  // vazia. A altura dela é reservada no CSS justamente pra isso — sem
  // reserva, o nome chegaria depois e empurraria a tela inteira pra
  // baixo, bem quando a pessoa já começou a ler ou a tocar.
  //
  // E não se inventa nome: quem abriu um link errado precisa da tela de
  // baixo explicando, não de um cabeçalho escrito "undefined".
  if (!dados) return null;

  // Link pra página da barbearia: é o "voltar pro começo" que o fluxo
  // não tinha. Um <a> de verdade, e não um onClick, porque abrir em
  // outra aba é coisa que se faz com o link do lugar onde se vai cortar
  // o cabelo.
  //
  // O acesso à conta mora junto do nome, e só depois de ele chegar: num
  // slug que não existe, "Entrar" levaria ao login de barbearia nenhuma.
  return (
    <>
      <Link href={noHost(`/${slug}`)} className={estilos.marca}>
        {/* A logo antes do nome, decorativa: o nome escrito já é o que o
            link diz. */}
        {dados.logoUrl && dados.logoFormato ? (
          <LogoDaBarbearia
            url={dados.logoUrl}
            formato={dados.logoFormato}
            nome={dados.nome}
            tamanho="p"
            decorativa
          />
        ) : null}
        {dados.nome}
      </Link>
      <LinkDaConta slug={slug} />
    </>
  );
}
