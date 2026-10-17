"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoDaBarbearia } from "../componentes/LogoDaBarbearia";
import { aplicarBarra, gravarBarra, lerBarra } from "./barra";
import {
  IconeBloqueio,
  IconeCalendario,
  IconeCasa,
  IconeCedula,
  IconeCliente,
  IconeEngrenagem,
  IconeEquipe,
  IconeGrade,
  IconeMais,
  IconeRecolher,
  IconeTesoura,
} from "./icones";
import { usePainel } from "./SessaoDoPainel";
import estilos from "./NavegacaoDoPainel.module.css";

// `soDoDono` some da barra pra quem não é dono. Serviços fica pra todos
// (a recepção consulta preço) e Configurações também — o "Seu perfil"
// de cada um mora lá. A tela de cada link decide o resto.
//
// As três primeiras são as da barra inferior do celular, onde o polegar
// alcança; as outras moram atrás do "Mais" lá. No desktop, a lista é uma
// só e na mesma ordem.
const PRINCIPAIS = [
  { href: "/painel", rotulo: "Hoje", Icone: IconeCasa },
  { href: "/painel/agenda", rotulo: "Agenda", Icone: IconeCalendario },
  // Pra todos: o profissional vê o próprio acerto; no Grátis, o convite.
  { href: "/painel/caixa", rotulo: "Caixa", Icone: IconeCedula },
];

const SECUNDARIAS = [
  // Pra todos: o profissional bloqueia a própria agenda.
  { href: "/painel/bloqueios", rotulo: "Folgas", Icone: IconeBloqueio },
  { href: "/painel/clientes", rotulo: "Clientes", Icone: IconeCliente },
  { href: "/painel/servicos", rotulo: "Serviços", Icone: IconeTesoura },
  { href: "/painel/equipe", rotulo: "Equipe", Icone: IconeEquipe, soDoDono: true },
  { href: "/painel/configuracoes", rotulo: "Configurações", Icone: IconeEngrenagem },
];

// O <nav> precisa de id para o aria-controls do botão que o recolhe.
const ID_DAS_SECOES = "secoes-do-painel";
const ID_DO_MAIS = "secoes-do-mais";

// O "Hoje" é /painel exato: com startsWith, ele ficaria ativo em todas
// as rotas do painel ao mesmo tempo.
function ehAtual(href: string, caminho: string): boolean {
  return href === "/painel" ? caminho === href : caminho.startsWith(href);
}

export function NavegacaoDoPainel() {
  const { slug, perfil, marca } = usePainel();
  const secundarias = SECUNDARIAS.filter((link) => !link.soDoDono || perfil.papel === "dono");
  const caminho = usePathname();
  const [recolhida, setRecolhida] = useState(false);
  const [maisAberto, setMaisAberto] = useState(false);
  const raizDoMais = useRef<HTMLDivElement>(null);

  useEffect(() => setRecolhida(lerBarra() === "recolhida"), []);

  // Escolheu uma seção, o "Mais" fecha: a folha cobriria a tela nova.
  useEffect(() => setMaisAberto(false), [caminho]);

  // Aberto, fecha com Esc e com toque fora — o mesmo de qualquer menu.
  useEffect(() => {
    if (!maisAberto) return;
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") setMaisAberto(false);
    }
    function aoTocar(evento: PointerEvent) {
      if (raizDoMais.current && !raizDoMais.current.contains(evento.target as Node)) setMaisAberto(false);
    }
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoTocar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoTocar);
    };
  }, [maisAberto]);

  const maisEhAtual = secundarias.some((link) => ehAtual(link.href, caminho));

  function link({ href, rotulo, Icone }: (typeof SECUNDARIAS)[number]) {
    return (
      <Link
        key={href}
        href={href}
        aria-current={ehAtual(href, caminho) ? "page" : undefined}
        // Só recolhida: expandida, o title repetiria em tooltip o
        // texto que já está ao lado do ícone.
        title={recolhida ? rotulo : undefined}
      >
        <Icone />
        <span className={estilos.rotulo}>{rotulo}</span>
      </Link>
    );
  }

  // Quem manda no visual é o atributo no <html>, não este estado: é o
  // mesmo que o script do <head> escreve antes da primeira pintura, e
  // ter uma fonte só evita a barra discordar de si mesma no primeiro
  // quadro. O estado aqui serve pro rótulo e pro aria-expanded.
  function alternarBarra() {
    const proximo = recolhida ? "expandida" : "recolhida";
    setRecolhida(!recolhida);
    gravarBarra(proximo);
    aplicarBarra(proximo);
  }

  return (
    // <aside> e não <header>: numa barra lateral de navegação o papel é
    // de conteúdo complementar, e o <nav> aqui dentro é quem carrega a
    // marcação que importa pra quem navega por landmark.
    <aside className={estilos.barra}>
      {/* A inicial fica num atributo, e não num segundo elemento, pro
          CSS poder trocar o slug por ela quando a barra encolhe sem que
          exista um nó a mais pro leitor de tela anunciar. */}
      {/* Com logo, ela vem antes do nome, na moldura que o dono escolheu;
          recolhida a barra, fica só ela (o nome some só da vista). */}
      <strong
        className={estilos.marca}
        data-inicial={slug.slice(0, 1).toUpperCase()}
        data-com-logo={marca ? "" : undefined}
      >
        {marca ? (
          <LogoDaBarbearia
            url={marca.logoUrl}
            formato={marca.logoFormato}
            nome={slug}
            tamanho="p"
            decorativa
          />
        ) : (
          // Sem logo, a inicial num quadrado da cor da casa faz as vezes
          // dela: o amarelo cabe num selo pequeno, não na marca inteira.
          <span className={estilos.monograma} aria-hidden="true">
            {slug.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className={estilos.nomeDaMarca}>{slug}</span>
      </strong>

      <button
        type="button"
        className={estilos.alternador}
        onClick={alternarBarra}
        aria-expanded={!recolhida}
        aria-controls={ID_DAS_SECOES}
      >
        <IconeRecolher className={estilos.seta} />
        {/* O rótulo é o nome acessível do botão e nunca sai do DOM — o
            CSS o esconde quando a barra está recolhida. */}
        <span className={estilos.rotulo}>
          {recolhida ? "Expandir barra" : "Recolher barra"}
        </span>
      </button>

      <nav id={ID_DAS_SECOES} className={estilos.links} aria-label="Seções do painel">
        {link(PRINCIPAIS[0]!)}
        {link(PRINCIPAIS[1]!)}
        {/* Só no celular, no centro da barra: a ação do dia a um toque.
            No desktop o "Novo agendamento" mora no cabeçalho de cada
            tela e este some (display: none tira também do leitor). */}
        <Link href="/painel/agendamentos/novo" className={estilos.novo}>
          <IconeMais />
          <span className={estilos.rotulo}>Novo</span>
        </Link>
        {link(PRINCIPAIS[2]!)}

        {/* No desktop o grupo não existe pra layout (display: contents)
            e as seções seguem na lista. No celular vira a folha que o
            "Mais" abre por cima da barra. */}
        <div ref={raizDoMais} className={estilos.grupoDoMais}>
          <div id={ID_DO_MAIS} className={estilos.secundarias} data-aberto={maisAberto ? "" : undefined}>
            {secundarias.map(link)}
          </div>
          <button
            type="button"
            className={estilos.mais}
            aria-expanded={maisAberto}
            aria-controls={ID_DO_MAIS}
            data-atual={maisEhAtual ? "true" : undefined}
            onClick={() => setMaisAberto(!maisAberto)}
          >
            <IconeGrade />
            <span className={estilos.rotulo}>Mais</span>
          </button>
        </div>
      </nav>

      {/* Tema e Sair moravam aqui embaixo; foram pra barra de topo
          (BarraDoTopo), junto do resto da conta. */}
    </aside>
  );
}
