"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { LadoALado } from "../../componentes/Colunas";
import { Estatistica } from "../../componentes/Estatistica";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { linkDaBarbearia } from "../../painel/compartilhar";
import { previstoDoDia, proximos } from "../../painel/metricas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./DashboardDoDia.module.css";
import { BarraDeOcupacao } from "./hoje/BarraDeOcupacao";
import { CartaoDoLink } from "./hoje/CartaoDoLink";
import { JanelaDeCompartilhar } from "./hoje/JanelaDeCompartilhar";
import { ProximosAtendimentos } from "./hoje/ProximosAtendimentos";
import { TrilhaDoOnboarding } from "./TrilhaDoOnboarding";

// O Hoje (painel v2, marco 4). No desktop, os próximos atendimentos à
// esquerda e o link e a ocupação à direita; no celular, uma coluna.
//
// `agora` por parâmetro, como toda tela que olhe relógio: fake timers
// não entram nesta suíte, e teste que compara data fixa com o relógio
// real falha sozinho depois.
export function DashboardDoDia({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();
  const hoje = hojeIso(agora);

  const agendamentos = useRequisicao(() => api.barbeiro.agendamentosDoDia(hoje), [hoje]);
  // A ocupação e o nome da casa são complementos: se falharem, o cartão
  // deles some e o resto do dia segue.
  const ocupacao = useRequisicao(() => api.barbeiro.ocupacaoDoDia(hoje), [hoje]);
  // O nome da casa vai na mensagem do WhatsApp.
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);
  const [compartilhando, setCompartilhando] = useState(false);
  const [linkCompartilhado, setLinkCompartilhado] = useState(false);

  // O passo "Seu link" da trilha: marcar é ajuda, não o que o dono veio
  // fazer — se a API falhar, o link já foi compartilhado e a janela
  // segue; só a trilha não fica sabendo.
  async function marcarLinkCompartilhado() {
    setLinkCompartilhado(true);
    try {
      await api.barbeiro.marcarLinkCopiado();
    } catch {
      // Ver acima: sem aviso de propósito.
    }
  }

  if (agendamentos.erro) {
    return <Aviso>{agendamentos.erro.mensagem || "Não foi possível carregar o dia agora."}</Aviso>;
  }
  if (!agendamentos.dados) return <p>Carregando…</p>;

  const doDia = agendamentos.dados;
  // O endereço inteiro, que abre fora do painel (WhatsApp, QR).
  const link = slug ? linkDaBarbearia(slug, process.env.NEXT_PUBLIC_URL_DO_SITE, window.location.origin) : null;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo={`Hoje, ${perfil.nome}`}
        apoio={formatarDataLonga(hoje)}
        acao={
          <Botao onClick={() => router.push("/painel/agendamentos/novo")}>
            Novo agendamento
          </Botao>
        }
      />

      {/* Só pro dono: a rota da trilha é dele, e os passos apontam pra
          telas que só ele abre. */}
      {perfil.papel === "dono" ? (
        <TrilhaDoOnboarding
          linkCompartilhado={linkCompartilhado}
          aoCompartilharLink={() => setCompartilhando(true)}
        />
      ) : null}

      <div className={estilos.numeros}>
        <Estatistica numero={String(doDia.length)} legenda="agendamentos hoje" />
        <Estatistica numero={String(proximos(doDia, agora).length)} legenda="ainda hoje" />
        <Estatistica numero={formatarPreco(previstoDoDia(doDia))} legenda="previsto hoje" />
      </div>

      <LadoALado>
        <ProximosAtendimentos
          doDia={doDia}
          agora={agora}
          aoAbrir={(id) => router.push(`/painel/agendamentos/${id}`)}
        />
        <div className={estilos.lateral}>
          {link && barbearia.dados ? (
            <CartaoDoLink link={link} aoCompartilhar={() => setCompartilhando(true)} />
          ) : null}
          {ocupacao.dados ? (
            <BarraDeOcupacao ocupacao={ocupacao.dados} soDoProfissional={perfil.papel === "profissional"} />
          ) : null}
        </div>
      </LadoALado>

      {compartilhando && link && barbearia.dados ? (
        <JanelaDeCompartilhar
          link={link}
          nome={barbearia.dados.nome}
          slug={slug}
          aoCompartilhar={marcarLinkCompartilhado}
          aoFechar={() => setCompartilhando(false)}
        />
      ) : null}
    </div>
  );
}
