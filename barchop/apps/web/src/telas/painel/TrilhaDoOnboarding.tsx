"use client";

import { useId, useState } from "react";
import Link from "next/link";
import type { EstadoDoOnboarding, PassoDoOnboarding } from "@barchop/types";
import { useRequisicao } from "../../api/useRequisicao";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { enderecoDaBarbearia } from "../../tenant/endereco";
import estilos from "./TrilhaDoOnboarding.module.css";

// O que cada passo pede, em frase de dono, e onde se resolve. A ordem é
// a da API (routers/onboarding.ts): é a ordem em que a barbearia fica
// pronta pra receber cliente.
const TEXTOS: Record<PassoDoOnboarding, { titulo: string; dica: string; destino?: string; acao?: string }> = {
  horarios: {
    titulo: "Horário de funcionamento",
    dica: "Os dias e horas em que a barbearia abre.",
    destino: "/painel/configuracoes/horarios",
    acao: "Definir horário",
  },
  servicos: {
    titulo: "Primeiro serviço",
    dica: "O que você faz, quanto tempo leva e quanto custa.",
    destino: "/painel/servicos/novo",
    acao: "Cadastrar serviço",
  },
  equipe: {
    titulo: "Equipe",
    dica: "Convide quem atende com você — cada um com a própria agenda.",
    destino: "/painel/equipe/novo",
  },
  link: {
    titulo: "Seu link",
    dica: "Mande pros clientes no WhatsApp e ponha na bio do Instagram.",
  },
  primeira_reserva: {
    titulo: "Primeira reserva pelo link",
    dica: "Quando um cliente marcar sozinho, este passo se marca.",
  },
};

// A trilha de primeiros passos do dono (Onda 1, F2), no topo do painel
// do dia. Some quando os cinco estão feitos — e some calada se não
// carregar: o painel do dia é o que importa, e a trilha é ajuda.
//
// Quem decide se ela aparece é quem a monta (só pro dono): esta tela
// pede o estado à API, e a rota é só do dono.
export function TrilhaDoOnboarding() {
  const api = useApiDoPainel();
  const { slug } = usePainel();
  const titulo = useId();
  const carregado = useRequisicao(() => api.barbeiro.onboarding(), []);
  // A resposta das ações (o PATCH devolve o estado novo) ganha da carga.
  const [atualizado, setAtualizado] = useState<EstadoDoOnboarding | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [semCopiar, setSemCopiar] = useState<string | null>(null);

  const estado = atualizado ?? carregado.dados;
  if (!estado || estado.completo) return null;

  const feitos = estado.passos.filter((passo) => passo.feito).length;

  async function trabalhoSozinho() {
    setAtualizado(await api.barbeiro.marcarTrabalhoSozinho(true));
  }

  async function copiarLink() {
    // Em desenvolvimento, sem o site configurado, o endereço é um
    // caminho: o link copiado precisa do host pra abrir no WhatsApp.
    const endereco = enderecoDaBarbearia(slug, process.env.NEXT_PUBLIC_URL_DO_SITE);
    const completo = endereco.startsWith("/") ? `${window.location.origin}${endereco}` : endereco;
    try {
      await navigator.clipboard.writeText(completo);
    } catch {
      // Sem permissão de área de transferência (navegador antigo, http
      // fora do localhost): mostra o link pra copiar à mão, e não marca —
      // o passo é "compartilhou", e nada foi copiado.
      setSemCopiar(completo);
      return;
    }
    setCopiado(true);
    setSemCopiar(null);
    await api.barbeiro.marcarLinkCopiado();
    setAtualizado({
      passos: estado!.passos.map((passo) => (passo.id === "link" ? { ...passo, feito: true } : passo)),
      completo: estado!.passos.every((passo) => passo.feito || passo.id === "link"),
    });
  }

  return (
    <section className={estilos.trilha} aria-labelledby={titulo}>
      <div className={estilos.topo}>
        <h2 id={titulo} className={estilos.titulo}>
          Primeiros passos
        </h2>
        <span className={estilos.progresso}>
          {feitos} de {estado.passos.length}
        </span>
      </div>
      <ol className={estilos.passos}>
        {estado.passos.map((passo) => (
          <Passo
            key={passo.id}
            id={passo.id}
            feito={passo.feito}
            acao={
              passo.feito ? null : passo.id === "equipe" ? (
                <>
                  <Link className={estilos.acao} href={TEXTOS.equipe.destino!}>
                    Convidar
                  </Link>
                  <button type="button" className={estilos.secundaria} onClick={() => void trabalhoSozinho()}>
                    Trabalho sozinho
                  </button>
                </>
              ) : passo.id === "link" ? (
                <button type="button" className={estilos.acao} onClick={() => void copiarLink()}>
                  Copiar link
                </button>
              ) : TEXTOS[passo.id].destino ? (
                <Link className={estilos.acao} href={TEXTOS[passo.id].destino!}>
                  {TEXTOS[passo.id].acao}
                </Link>
              ) : null
            }
            extra={
              passo.id === "link" && copiado ? (
                <span role="status">Link copiado. Agora é mandar pros clientes.</span>
              ) : passo.id === "link" && semCopiar ? (
                <span role="status">
                  Não deu pra copiar daqui. Seu link: <strong>{semCopiar}</strong>
                </span>
              ) : null
            }
          />
        ))}
      </ol>
    </section>
  );
}

function Passo({
  id,
  feito,
  acao,
  extra,
}: {
  id: PassoDoOnboarding;
  feito: boolean;
  acao: React.ReactNode;
  extra: React.ReactNode;
}) {
  const titulo = useId();
  const texto = TEXTOS[id];
  return (
    <li className={estilos.passo} data-feito={feito} aria-labelledby={titulo}>
      <span className={estilos.marca} aria-hidden="true">
        {feito ? "✓" : ""}
      </span>
      <div className={estilos.corpo}>
        <span id={titulo} className={estilos.nome}>
          {texto.titulo}
        </span>
        {feito ? <span className={estilos.feito}>Feito</span> : <span className={estilos.dica}>{texto.dica}</span>}
        {extra ? <span className={estilos.dica}>{extra}</span> : null}
      </div>
      {acao ? <div className={estilos.acoes}>{acao}</div> : null}
    </li>
  );
}
