"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaNaConta } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Cartao } from "../componentes/Cartao";
import { Chip } from "../componentes/Chip";
import { comQuemVale, fraseDaFatura, fraseDoUso, situacaoNaConta } from "../fluxo/planos";
import { ROTULO_DA_SITUACAO, TOM_DA_SITUACAO, precoDoCiclo } from "../painel/planos";
import estilos from "./MinhaConta.module.css";

// As assinaturas do cliente na Minha conta (Onda 2, marco 3, PR 11 do
// plano planos-de-assinatura). As canceladas ficam fora: a lista é do
// que vale. Os usos só aparecem quando o plano cobre o atendimento (ativa
// ou em teste); na pendente, "2 de 2" diria que já dá pra usar.
//
// A online pendente ou em atraso tem o "Pagar": o mesmo POST do assinar
// devolve a fatura dela, e o link aparece pra um segundo toque (um
// `window.open` depois do pedido, o Safari do iPhone bloqueia).
export function MinhasAssinaturas() {
  const api = useApi();
  const assinaturas = useRequisicao(() => api.cliente.minhasAssinaturas(), []);
  const vivas = (assinaturas.dados ?? []).filter((a) => a.situacao !== "cancelada");
  // Falhou ou não tem: a Minha conta segue com os agendamentos.
  if (vivas.length === 0) return null;

  return (
    <section className={estilos.assinaturas} aria-labelledby="minhas-assinaturas">
      <h2 id="minhas-assinaturas" className={estilos.tituloDaSecao}>
        Minhas assinaturas
      </h2>
      {vivas.map((assinatura) => (
        <Assinatura key={assinatura.id} assinatura={assinatura} aoCancelar={assinaturas.recarregar} />
      ))}
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
    <Cartao>
      <div className={estilos.item}>
        <div className={estilos.linha}>
          <strong>{assinatura.plano.nome}</strong>
          <Chip tom={TOM_DA_SITUACAO[assinatura.situacao]}>{ROTULO_DA_SITUACAO[assinatura.situacao]}</Chip>
        </div>
        <p className={estilos.apoio}>
          {precoDoCiclo(assinatura)} · {comQuemVale(assinatura.plano)}
        </p>
        <p className={estilos.texto}>{situacaoNaConta(assinatura)}</p>
        {usaOPlano ? (
          <ul className={estilos.usos}>
            {assinatura.servicos.map((servico) => (
              <li key={servico.servicoId}>{fraseDoUso(servico)}</li>
            ))}
          </ul>
        ) : null}

        {aviso ? <Aviso>{aviso}</Aviso> : null}
        {fatura !== undefined ? (
          fatura ? (
            <div className={estilos.acoes}>
              <BotaoLink href={fatura} externo>
                Abrir a fatura
              </BotaoLink>
            </div>
          ) : (
            <p className={estilos.texto}>Não há fatura a pagar agora.</p>
          )
        ) : null}

        {confirmando ? (
          <div className={estilos.confirmacao}>
            <p className={estilos.texto}>
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
          <div className={estilos.acoes}>
            {aPagar && fatura === undefined ? (
              <Botao onClick={pagar} carregando={enviando}>
                Pagar
              </Botao>
            ) : null}
            <Botao variante="fantasma" onClick={() => setConfirmando(true)} disabled={enviando}>
              Cancelar assinatura
            </Botao>
          </div>
        )}
        {aPagar && fatura === undefined ? <p className={estilos.apoio}>{fraseDaFatura(assinatura)}</p> : null}
      </div>
    </Cartao>
  );
}
