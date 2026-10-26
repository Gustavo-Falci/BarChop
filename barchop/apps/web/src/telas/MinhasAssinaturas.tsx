"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaNaConta } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Chip } from "../componentes/Chip";
import {
  caminhoDosPlanos,
  comQuemVale,
  fraseDaFatura,
  parteQueSobra,
  quantoSobra,
  situacaoNaConta,
} from "../fluxo/planos";
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
// Sem assinatura, e com a vitrine ligada, o convite pros planos: é daqui
// que o "Já assina? Veja em Minha conta" dos planos traz o cliente.
export function MinhasAssinaturas() {
  const { slug } = useParams<{ slug: string }>();
  const api = useApi();
  const noHost = useNoHost();
  const assinaturas = useRequisicao(() => api.cliente.minhasAssinaturas(), []);
  const vitrine = useRequisicao(() => api.publico.planos(slug), [slug]);
  // Falhou ou ainda não veio: a Minha conta segue com os agendamentos.
  if (!assinaturas.dados) return null;
  const vivas = assinaturas.dados.filter((a) => a.situacao !== "cancelada");
  const temVitrine = (vitrine.dados?.planos.length ?? 0) > 0;
  if (vivas.length === 0 && !temVitrine) return null;

  return (
    <section className={estilos.meuPlano} aria-labelledby="meu-plano">
      <h2 id="meu-plano" className={estilos.rotulo}>
        {vivas.length > 1 ? "Meus planos" : "Meu plano"}
      </h2>
      {vivas.map((assinatura) => (
        <Assinatura key={assinatura.id} assinatura={assinatura} aoCancelar={assinaturas.recarregar} />
      ))}
      {vivas.length === 0 ? (
        <div className={estilos.convite}>
          <h3 className={estilos.nomeDoPlano}>Você não assina um plano</h3>
          <p className={estilos.apoio}>
            Com um plano, você paga um valor fixo por ciclo e os serviços incluídos já estão pagos.
          </p>
          <BotaoLink href={noHost(caminhoDosPlanos(slug))} variante="contorno">
            Ver os planos
          </BotaoLink>
        </div>
      ) : temVitrine ? (
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

      <p className={estilos.situacao}>{situacaoNaConta(assinatura)}</p>

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

      <div className={estilos.pe}>
        {confirmando ? (
          <div className={estilos.confirmacao}>
            <p>
              {online
                ? "O Asaas para de cobrar, e o plano deixa de valer nos atendimentos a partir de agora."
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
