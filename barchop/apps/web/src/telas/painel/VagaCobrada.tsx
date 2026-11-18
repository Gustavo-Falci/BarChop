"use client";

import { formatarReais } from "@barchop/formato";
import type { PreviaDaInclusao } from "@barchop/types";
import { useRequisicao } from "../../api/useRequisicao";
import { diaEMes } from "../../painel/assinatura";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./VagaCobrada.module.css";

// Profissional novo no meio do período pago (plano
// profissional-novo-pago, canvas aprovado em 18/11): o que o convite e o
// reativar mostram antes de cobrar, e o que a equipe e o Pix da
// diferença dizem de quem aguarda.

// A prévia, lida uma vez por tela. Falhou: a tela segue sem o valor (a
// API ainda cobra certo, e a recusa volta com o seu aviso).
export function usePreviaDaInclusao(ligada: boolean): PreviaDaInclusao | null {
  const api = useApiDoPainel();
  const { dados } = useRequisicao(
    () => (ligada ? api.barbeiro.previaDaInclusao().catch(() => null) : Promise.resolve(null)),
    [ligada]
  );
  return dados?.cobra ? dados : null;
}

// O rótulo do botão que inclui: diz que cobra, e quanto, no cartão; no
// Pix, que o próximo passo é pagar.
export function rotuloQueCobra(acao: string, previa: PreviaDaInclusao | null): string {
  if (!previa) return acao;
  return previa.forma === "pix" ? `${acao} e pagar no Pix` : `${acao} e cobrar ${formatarReais(previa.valorCentavos)}`;
}

// O valor logo acima do botão, em texto e sem caixa (canvas): o que
// cobra, onde e até quando.
export function CustoDaVaga({ previa, contexto }: { previa: PreviaDaInclusao; contexto: string }) {
  const valor = formatarReais(previa.valorCentavos);
  const ate = previa.ate ? diaEMes(previa.ate) : null;
  const noPix = previa.forma === "pix";
  const onde = previa.cartaoFinal ? `No cartão final ${previa.cartaoFinal}` : "No cartão";
  return (
    <div className={estilos.custo} aria-live="polite">
      <span className={estilos.apoio}>{contexto}</span>
      <strong className={estilos.valor}>{noPix ? `${valor} no Pix` : `${valor} agora`}</strong>
      <span className={estilos.apoio}>
        {noPix
          ? `Entra na equipe depois do Pix da diferença${ate ? `, que paga os dias até ${ate}` : ""}.`
          : `${onde}${ate ? `, até ${ate}` : ""}. A próxima mensalidade já vem com mais 1 profissional.`}
      </span>
    </div>
  );
}

// O texto da recusa do cartão: o que não aconteceu e que nada foi cobrado.
export function textoDaRecusa(previa: PreviaDaInclusao | null, oQueNaoAconteceu: string): string {
  const cartao = previa?.cartaoFinal ? `o cartão final ${previa.cartaoFinal}` : "o cartão";
  return `O banco recusou ${cartao}. ${oQueNaoAconteceu} e nada foi cobrado.`;
}
