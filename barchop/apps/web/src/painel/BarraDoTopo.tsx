"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Chip } from "../componentes/Chip";
import {
  ItemDoMenu,
  LINHA_DO_MENU,
  MenuSuspenso,
  REGUA_DO_MENU,
} from "../componentes/MenuSuspenso";
import { SeletorEmPilulas } from "../componentes/SeletorEmPilulas";
import { iniciais } from "../formato/iniciais";
import {
  IconeAjuda,
  IconeBrilho,
  IconeCartao,
  IconeCliente,
  IconeCoroa,
  IconeDescer,
  IconeGlobo,
  IconeMaisOpcoes,
  IconePresente,
  IconeSair,
} from "./icones";
import { JanelaDeNovidades } from "./JanelaDeNovidades";
import {
  contarNovas,
  lerNovidadesVistas,
  marcarNovidadesVistas,
  NOVIDADES,
} from "./novidades";
import { useAssinatura } from "./ProvedorDaAssinatura";
import { useApiDoPainel } from "./ProvedorDoPainel";
import { usePainel } from "./SessaoDoPainel";
import { SinoDeNotificacoes } from "./SinoDeNotificacoes";
import { irParaAStripe } from "./stripe";
import {
  aplicarTema,
  gravarTema,
  lerTema,
  resolverTema,
  temaDoSistema,
  type EscolhaDeTema,
} from "./tema";
import estilos from "./BarraDoTopo.module.css";

const OPCOES_DE_TEMA: { valor: EscolhaDeTema; rotulo: string }[] = [
  { valor: "claro", rotulo: "Claro" },
  { valor: "escuro", rotulo: "Escuro" },
  { valor: "sistema", rotulo: "Sistema" },
];

type Menu = "sino" | "opcoes" | "conta";

// A barra no topo do conteúdo do painel: o sino de notificações, o menu
// "…" (novidades, ajuda, aparência, idioma) e o menu do usuário (conta e
// sair). Um aberto por vez.
export function BarraDoTopo() {
  const { perfil, slug, nomeDaBarbearia, sair } = usePainel();
  const api = useApiDoPainel();
  const { resumo } = useAssinatura();
  const dono = perfil.papel === "dono";
  const [abrindoFaturas, setAbrindoFaturas] = useState(false);
  const [aberto, setAberto] = useState<Menu | null>(null);
  const [tema, setTema] = useState<EscolhaDeTema>("sistema");
  const [novas, setNovas] = useState(0);
  const [vendoNovidades, setVendoNovidades] = useState(false);

  // O script do <head> já pintou; isto só põe o React em dia com a
  // escolha gravada, pra o rádio certo vir marcado.
  useEffect(() => setTema(lerTema() ?? "sistema"), []);
  useEffect(() => setNovas(contarNovas(NOVIDADES, lerNovidadesVistas())), []);

  // Com "Sistema", o painel acompanha o aparelho ao vivo (o modo escuro
  // automático do celular à noite) sem precisar recarregar.
  useEffect(() => {
    if (tema !== "sistema") return;
    const consulta = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!consulta) return;
    const acompanhar = () => aplicarTema(temaDoSistema());
    consulta.addEventListener("change", acompanhar);
    return () => consulta.removeEventListener("change", acompanhar);
  }, [tema]);

  const fechar = useCallback(() => setAberto(null), []);
  const alternar = (menu: Menu) => setAberto((atual) => (atual === menu ? null : menu));

  function escolherTema(escolha: EscolhaDeTema) {
    setTema(escolha);
    gravarTema(escolha);
    aplicarTema(resolverTema(escolha));
  }

  // As faturas moram no Portal da Stripe, que só existe depois do
  // primeiro Checkout.
  async function abrirFaturas() {
    setAbrindoFaturas(true);
    try {
      irParaAStripe((await api.barbeiro.portalDaAssinatura()).url);
    } catch {
      setAbrindoFaturas(false);
    }
  }

  function abrirNovidades() {
    marcarNovidadesVistas();
    setNovas(0);
    setVendoNovidades(true);
  }

  const avatar = (
    <span className={estilos.avatar} aria-hidden="true">
      {perfil.fotoUrl ? <img src={perfil.fotoUrl} alt="" /> : iniciais(perfil.nome)}
    </span>
  );

  return (
    <header className={estilos.barra}>
      <SinoDeNotificacoes
        aberto={aberto === "sino"}
        aoAlternar={() => alternar("sino")}
        aoFechar={fechar}
      />

      <MenuSuspenso
        rotulo="Mais opções"
        rotuloDoGatilho="Mais opções"
        gatilho={<IconeMaisOpcoes />}
        aberto={aberto === "opcoes"}
        aoAlternar={() => alternar("opcoes")}
        aoFechar={fechar}
        aviso={novas > 0}
      >
        <button type="button" className={LINHA_DO_MENU} data-fecha onClick={abrirNovidades}>
          <ItemDoMenu
            icone={<IconeBrilho />}
            fim={
              novas > 0 ? (
                <Chip tamanho="pequeno">{novas === 1 ? "1 nova" : `${novas} novas`}</Chip>
              ) : null
            }
          >
            Novidades
          </ItemDoMenu>
        </button>
        <Link href="/painel/ajuda" className={LINHA_DO_MENU}>
          <ItemDoMenu icone={<IconeAjuda />}>Central de ajuda</ItemDoMenu>
        </Link>
        <hr className={REGUA_DO_MENU} />
        <div className={estilos.aparencia}>
          <SeletorEmPilulas
            nome="tema-do-painel"
            legenda="Aparência"
            opcoes={OPCOES_DE_TEMA}
            valor={tema}
            aoTrocar={escolherTema}
          />
        </div>
        <hr className={REGUA_DO_MENU} />
        {/* Só português por ora: a linha diz o idioma, sem fingir uma
            escolha que não existe. */}
        <div className={LINHA_DO_MENU} data-estatica>
          <ItemDoMenu icone={<IconeGlobo />} fim="Português">
            Idioma
          </ItemDoMenu>
        </div>
      </MenuSuspenso>

      <span className={estilos.divisor} aria-hidden="true" />

      <MenuSuspenso
        rotulo="Sua conta"
        gatilho={
          <>
            {avatar}
            <span className={estilos.quem}>
              <span className={estilos.nome}>{perfil.nome}</span>
              <span className={estilos.barbearia}>{nomeDaBarbearia ?? slug}</span>
            </span>
            <IconeDescer className={estilos.descer} />
          </>
        }
        classeDoGatilho={estilos.gatilhoDaConta}
        aberto={aberto === "conta"}
        aoAlternar={() => alternar("conta")}
        aoFechar={fechar}
      >
        <div className={estilos.cartaoDaConta}>
          {avatar}
          <span className={estilos.quem}>
            <span className={estilos.nome}>{perfil.nome}</span>
            {perfil.email ? <span className={estilos.email}>{perfil.email}</span> : null}
          </span>
        </div>
        <hr className={REGUA_DO_MENU} />
        <Link href="/painel/configuracoes/perfil" className={LINHA_DO_MENU}>
          <ItemDoMenu icone={<IconeCliente />}>Minha conta</ItemDoMenu>
        </Link>
        {/* A assinatura é só do dono. As faturas moram no Portal da
            Stripe, que nasce no primeiro Checkout: antes dele, o item
            fica à vista e desligado, com o selo dizendo por quê. */}
        {dono ? (
          <>
            <Link href="/painel/assinatura" className={LINHA_DO_MENU}>
              <ItemDoMenu icone={<IconeCoroa />}>Plano</ItemDoMenu>
            </Link>
            <button
              type="button"
              className={LINHA_DO_MENU}
              disabled={!resumo?.temPortal || abrindoFaturas}
              aria-busy={abrindoFaturas || undefined}
              onClick={abrirFaturas}
            >
              <ItemDoMenu
                icone={<IconeCartao />}
                fim={resumo?.temPortal ? null : <Chip tamanho="pequeno" tom="neutro">Depois de assinar</Chip>}
              >
                Faturas
              </ItemDoMenu>
            </button>
          </>
        ) : null}
        {/* A indicação ainda não existe. */}
        <button type="button" className={LINHA_DO_MENU} disabled>
          <ItemDoMenu
            icone={<IconePresente />}
            fim={<Chip tamanho="pequeno" tom="neutro">Em breve</Chip>}
          >
            Indique e ganhe
          </ItemDoMenu>
        </button>
        <hr className={REGUA_DO_MENU} />
        <button type="button" className={LINHA_DO_MENU} data-perigo data-fecha onClick={sair}>
          <ItemDoMenu icone={<IconeSair />}>Sair</ItemDoMenu>
        </button>
      </MenuSuspenso>

      {vendoNovidades ? <JanelaDeNovidades aoFechar={() => setVendoNovidades(false)} /> : null}
    </header>
  );
}
