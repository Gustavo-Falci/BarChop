"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Estatistica } from "../../componentes/Estatistica";
import { Vazio } from "../../componentes/Vazio";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataLonga, hojeIso } from "../../formato/datas";
import { linkDaBarbearia } from "../../painel/compartilhar";
import { ocupacao, previstoDoDia } from "../../painel/metricas";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./DashboardDoDia.module.css";
import { CartaoDoLink } from "./hoje/CartaoDoLink";
import { JanelaDeCompartilhar } from "./hoje/JanelaDeCompartilhar";
import { TrilhaDoOnboarding } from "./TrilhaDoOnboarding";

// `agora` por parâmetro, como toda tela que olhe relógio: fake timers
// não entram nesta suíte, e teste que compara data fixa com o relógio
// real falha sozinho depois.
export function DashboardDoDia({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();
  const hoje = hojeIso(agora);

  const agendamentos = useRequisicao(() => api.barbeiro.agendamentosDoDia(hoje), [hoje]);
  const horarios = useRequisicao(() => api.barbeiro.horarios(), []);
  // O nome da casa vai na mensagem do WhatsApp. Sem ele o cartão do link
  // não aparece — o resto do dia não depende disso.
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
  if (!agendamentos.dados || !horarios.dados) return <p>Carregando…</p>;

  const doDia = agendamentos.dados;
  const horarioDeHoje = horarios.dados.find(
    (h) => h.diaSemana === new Date(`${hoje}T12:00:00`).getDay()
  );
  const percentual = ocupacao(doDia, horarioDeHoje);
  // Com mais de um profissional no dia, cada linha diz com quem; com um
  // só, o nome repetido em toda linha seria ruído.
  const comEquipe = new Set(doDia.map((agendamento) => agendamento.barbeiro.id)).size > 1;
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

      {link && barbearia.dados ? <CartaoDoLink link={link} aoCompartilhar={() => setCompartilhando(true)} /> : null}
      {compartilhando && link && barbearia.dados ? (
        <JanelaDeCompartilhar
          link={link}
          nome={barbearia.dados.nome}
          slug={slug}
          aoCompartilhar={marcarLinkCompartilhado}
          aoFechar={() => setCompartilhando(false)}
        />
      ) : null}

      <div className={estilos.numeros}>
        <Estatistica numero={String(doDia.length)} legenda="agendamentos hoje" />
        <Estatistica
          numero={percentual === null ? "—" : `${percentual}%`}
          legenda="ocupação"
        />
        <Estatistica
          numero={formatarPreco(previstoDoDia(doDia))}
          legenda="previsto hoje"
        />
      </div>

      {doDia.length === 0 ? (
        <Vazio
          mensagem="Nenhum agendamento hoje."
          dica="Quando alguém marcar pelo seu link, o horário aparece aqui."
        />
      ) : (
        <ul className={estilos.lista}>
          {doDia.map((agendamento) => (
            <li key={agendamento.id}>
              <button
                type="button"
                onClick={() => router.push(`/painel/agendamentos/${agendamento.id}`)}
              >
                {agendamento.horaInicio} {agendamento.cliente.nome} ·{" "}
                {agendamento.servicos.map((s) => s.nome).join(" + ")}
                {comEquipe ? ` · com ${agendamento.barbeiro.nome}` : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
