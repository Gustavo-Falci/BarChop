"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaNaConta } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Chip } from "../componentes/Chip";
import {
  SEM_RENOVACAO,
  caminhoDosPlanos,
  comQuemVale,
  fraseDaFatura,
  parteQueSobra,
  quantoSobra,
  situacaoNaConta,
  voltaDoPagamento,
} from "../fluxo/planos";
import { PROVEDORES } from "../fluxo/provedores";
import { ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, precoDoCiclo } from "../painel/planos";
import { useNoHost } from "../tenant/ProvedorDoHost";
import estilos from "./MinhaConta.module.css";

// O plano do cliente na Minha conta (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura; redesenho de 26/10). As canceladas ficam fora: a
// lista é do que vale. Os usos só aparecem quando o plano cobre o
// atendimento (ativa ou em teste); na pendente, "2 de 2" diria que já dá
// pra usar.
//
// A online pendente ou em atraso tem o "Pagar": o mesmo POST do assinar
// devolve a fatura dela, e o link aparece pra um segundo toque (um
// `window.open` depois do pedido, o Safari do iPhone bloqueia).
//
// Na InfinitePay (PR 7b do plano pagamentos-online-infinitepay), que não
// renova sozinha, o "Pagar" é o link aberto do ciclo (`linkParaPagar`),
// direto: inclusive na ativa, quando o link do próximo ciclo já saiu. E
// a volta da página dela (`order_nsu`, `transaction_nsu` e `slug` na
// query) é conferida aqui uma vez; depois, a query sai da URL.
//
// Sem assinatura, e com a vitrine ligada, o convite pros planos: é daqui
// que o "Já assina? Veja em Minha conta" dos planos traz o cliente.

type Conferencia = "pago" | "nao_pago" | "de_outra_conta";

const FRASE_DA_CONFERENCIA: Record<Conferencia, string> = {
  pago: "Pagamento recebido. A assinatura está em dia.",
  nao_pago: "Ainda não confirmamos o pagamento: confira em alguns minutos.",
  de_outra_conta: "Este pagamento é de outra conta: entre com a conta que assinou para conferir.",
};

export function MinhasAssinaturas() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const api = useApi();
  const noHost = useNoHost();
  const assinaturas = useRequisicao(() => api.cliente.minhasAssinaturas(), []);
  const vitrine = useRequisicao(() => api.publico.planos(slug), [slug]);

  const volta = voltaDoPagamento(useSearchParams());
  const [conferencia, setConferencia] = useState<Conferencia | undefined>();
  // Uma conferência por volta: o efeito roda de novo a cada desenho.
  const conferiu = useRef(false);
  const { recarregar } = assinaturas;
  useEffect(() => {
    if (!volta || conferiu.current) return;
    conferiu.current = true;
    api.cliente
      .conferirPagamento(volta)
      .then(
        (resposta) => setConferencia(resposta.pago ? "pago" : "nao_pago"),
        (causa: ErroDaApi) => setConferencia(causa.status === 404 ? "de_outra_conta" : "nao_pago")
      )
      .finally(() => {
        recarregar();
        // Sem a query, recarregar a página não confere de novo.
        router.replace(noHost(`/${slug}/minha-conta`));
      });
  }, [volta, api, recarregar, router, noHost, slug]);

  // Falhou ou ainda não veio: a Minha conta segue com os agendamentos.
  if (!assinaturas.dados) return null;
  const vivas = assinaturas.dados.filter((a) => a.situacao !== "cancelada");
  const temVitrine = (vitrine.dados?.planos.length ?? 0) > 0;
  if (vivas.length === 0 && !temVitrine && !conferencia) return null;

  return (
    <section className={estilos.meuPlano} aria-labelledby="meu-plano">
      <h2 id="meu-plano" className={estilos.rotulo}>
        {vivas.length > 1 ? "Meus planos" : "Meu plano"}
      </h2>
      {conferencia ? (
        <p className={estilos.situacao} role="status">
          {FRASE_DA_CONFERENCIA[conferencia]}
        </p>
      ) : null}
      {vivas.map((assinatura) => (
        <Assinatura key={assinatura.id} assinatura={assinatura} aoCancelar={recarregar} />
      ))}
      {vivas.length === 0 && temVitrine ? (
        <div className={estilos.convite}>
          <h3 className={estilos.nomeDoPlano}>Você não assina um plano</h3>
          <p className={estilos.apoio}>
            Com um plano, você paga um valor fixo por ciclo e os serviços incluídos já estão pagos.
          </p>
          <BotaoLink href={noHost(caminhoDosPlanos(slug))} variante="contorno">
            Ver os planos
          </BotaoLink>
        </div>
      ) : vivas.length > 0 && temVitrine ? (
        <p className={estilos.apoio}>
          Quer outro? <Link href={noHost(caminhoDosPlanos(slug))}>Ver os planos da barbearia</Link>
        </p>
      ) : null}
    </section>
  );
}

function Assinatura({ assinatura, aoCancelar }: { assinatura: AssinaturaNaConta; aoCancelar: () => void }) {
  const api = useApi();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();
  const [fatura, setFatura] = useState<string | null | undefined>();

  const online = assinatura.forma === "online";
  const aPagar = online && (assinatura.situacao === "pendente" || assinatura.situacao === "em_atraso");
  const usaOPlano = assinatura.situacao === "ativa" || assinatura.situacao === "teste";
  // O que não renova sozinho (a InfinitePay): um link por ciclo.
  const textos = assinatura.provedor ? PROVEDORES[assinatura.provedor] : null;
  const porLink = textos !== null && !textos.renovaSozinho;

  async function pagar() {
    setAviso(undefined);
    setEnviando(true);
    try {
      setFatura((await api.cliente.assinarPlano(assinatura.plano.id)).linkDaFatura);
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível abrir a fatura agora.");
    }
    setEnviando(false);
  }

  async function cancelar() {
    setAviso(undefined);
    setEnviando(true);
    try {
      await api.cliente.cancelarAssinatura(assinatura.id);
      aoCancelar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível cancelar agora.");
      setEnviando(false);
    }
  }

  return (
    <article className={estilos.plano} data-situacao={assinatura.situacao}>
      <div className={estilos.quem}>
        <div className={estilos.topo}>
          <h3 className={estilos.nomeDoPlano}>{assinatura.plano.nome}</h3>
          <Chip tom={TOM_DA_SITUACAO[assinatura.situacao]} tamanho="pequeno">
            {ROTULO_DA_SITUACAO[assinatura.situacao]}
          </Chip>
        </div>
        <p className={estilos.apoio}>
          {precoDoCiclo(assinatura)} · {comQuemVale(assinatura.plano)}
        </p>
      </div>

      <p className={estilos.situacao}>{situacaoNaConta(assinatura, !porLink)}</p>

      {usaOPlano ? (
        <div className={estilos.usos}>
          <p className={estilos.rotulo}>Neste ciclo</p>
          <ul className={estilos.servicos}>
            {assinatura.servicos.map((servico) => {
              const parte = parteQueSobra(servico);
              return (
                <li key={servico.servicoId} className={estilos.uso}>
                  <span className={estilos.nomeDoUso}>
                    <span>{servico.nome}</span>
                    <span className={estilos.apoio}>{quantoSobra(servico)}</span>
                  </span>
                  {parte === null ? null : (
                    <span className={estilos.barra} aria-hidden="true">
                      <span className={estilos.preenchido} style={{ width: `${parte * 100}%` }} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {porLink ? (
        assinatura.linkParaPagar ? (
          <div className={estilos.acaoPrincipal}>
            <BotaoLink href={assinatura.linkParaPagar} externo>
              Pagar
            </BotaoLink>
            <p className={estilos.apoio}>{`${textos.formas}, na página ${textos.do}. ${SEM_RENOVACAO}`}</p>
          </div>
        ) : (
          <p className={estilos.apoio}>{SEM_RENOVACAO}</p>
        )
      ) : (
        <>
          {fatura !== undefined ? (
            fatura ? (
              <div className={estilos.acaoPrincipal}>
                <BotaoLink href={fatura} externo>
                  Abrir a fatura
                </BotaoLink>
              </div>
            ) : (
              <p className={estilos.apoio}>Não há fatura a pagar agora.</p>
            )
          ) : null}
          {aPagar && fatura === undefined ? (
            <div className={estilos.acaoPrincipal}>
              <Botao onClick={pagar} carregando={enviando}>
                Pagar
              </Botao>
              <p className={estilos.apoio}>{fraseDaFatura(assinatura)}</p>
            </div>
          ) : null}
        </>
      )}

      <div className={estilos.pe}>
        {confirmando ? (
          <div className={estilos.confirmacao}>
            <p>
              {porLink
                ? "Os links das próximas mensalidades param, e o plano deixa de valer nos atendimentos a partir de agora."
                : online
                  ? "A cobrança online para, e o plano deixa de valer nos atendimentos a partir de agora."
                  : "O plano deixa de valer nos atendimentos a partir de agora."}
            </p>
            <div className={estilos.acoes}>
              <Botao variante="fantasma" onClick={() => setConfirmando(false)} disabled={enviando}>
                Manter
              </Botao>
              <Botao onClick={cancelar} carregando={enviando}>
                Sim, cancelar
              </Botao>
            </div>
          </div>
        ) : (
          <>
            <span className={estilos.apoio}>{online ? "Pago online" : "Pago no balcão"}</span>
            <Botao variante="fantasma" onClick={() => setConfirmando(true)} disabled={enviando}>
              Cancelar assinatura
            </Botao>
          </>
        )}
      </div>
    </article>
  );
}
