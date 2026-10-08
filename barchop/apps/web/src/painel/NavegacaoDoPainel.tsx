"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Botao } from "../componentes/Botao";
import { LogoDaBarbearia } from "../componentes/LogoDaBarbearia";
import { aplicarBarra, gravarBarra, lerBarra } from "./barra";
import {
  IconeBloqueio,
  IconeCalendario,
  IconeCasa,
  IconeCliente,
  IconeEngrenagem,
  IconeEquipe,
  IconeLua,
  IconeRecolher,
  IconeSair,
  IconeSol,
  IconeTesoura,
} from "./icones";
import { aplicarTema, gravarTema, lerTema, temaDoSistema, type Tema } from "./tema";
import { usePainel } from "./SessaoDoPainel";
import estilos from "./NavegacaoDoPainel.module.css";

// `soDoDono` some da barra pra quem não é dono. Serviços fica pra todos
// (a recepção consulta preço) e Configurações também — o "Seu perfil"
// de cada um mora lá. A tela de cada link decide o resto.
const LINKS = [
  { href: "/painel", rotulo: "Hoje", Icone: IconeCasa },
  { href: "/painel/agenda", rotulo: "Agenda", Icone: IconeCalendario },
  // Pra todos: o profissional bloqueia a própria agenda.
  { href: "/painel/bloqueios", rotulo: "Folgas", Icone: IconeBloqueio },
  { href: "/painel/clientes", rotulo: "Clientes", Icone: IconeCliente },
  { href: "/painel/servicos", rotulo: "Serviços", Icone: IconeTesoura },
  { href: "/painel/equipe", rotulo: "Equipe", Icone: IconeEquipe, soDoDono: true },
  { href: "/painel/configuracoes", rotulo: "Configurações", Icone: IconeEngrenagem },
];

// O <nav> precisa de id para o aria-controls do botão que o recolhe.
const ID_DAS_SECOES = "secoes-do-painel";

export function NavegacaoDoPainel() {
  const { slug, sair, perfil, marca } = usePainel();
  const links = LINKS.filter((link) => !link.soDoDono || perfil.papel === "dono");
  const caminho = usePathname();
  const [tema, setTema] = useState<Tema>("claro");
  const [recolhida, setRecolhida] = useState(false);

  // O script do <head> já pintou; isto só põe o React em dia com o que
  // está no <html>, pra os botões mostrarem o rótulo certo.
  useEffect(() => setTema(lerTema() ?? temaDoSistema()), []);
  useEffect(() => setRecolhida(lerBarra() === "recolhida"), []);

  function trocarTema() {
    const proximo: Tema = tema === "claro" ? "escuro" : "claro";
    setTema(proximo);
    gravarTema(proximo);
    aplicarTema(proximo);
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
        ) : null}
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
        {links.map(({ href, rotulo, Icone }) => (
          <Link
            key={href}
            href={href}
            // O "Hoje" é /painel exato: com startsWith, ele ficaria
            // ativo em todas as rotas do painel ao mesmo tempo.
            aria-current={
              (href === "/painel" ? caminho === href : caminho.startsWith(href))
                ? "page"
                : undefined
            }
            // Só recolhida: expandida, o title repetiria em tooltip o
            // texto que já está ao lado do ícone.
            title={recolhida ? rotulo : undefined}
          >
            <Icone />
            <span className={estilos.rotulo}>{rotulo}</span>
          </Link>
        ))}
      </nav>

      <div className={estilos.rodape}>
        {/* Eram dois <button> crus, os únicos do painel fora do
            componente — daí saírem com o cinza e a fonte do sistema
            enquanto todo o resto era neobrutalista. */}
        <Botao variante="contorno" type="button" onClick={trocarTema}>
          {tema === "claro" ? <IconeLua /> : <IconeSol />}
          <span className={estilos.rotulo}>
            {tema === "claro" ? "Modo escuro" : "Modo claro"}
          </span>
        </Botao>
        <Botao variante="contorno" type="button" onClick={sair}>
          <IconeSair />
          <span className={estilos.rotulo}>Sair</span>
        </Botao>
      </div>
    </aside>
  );
}
