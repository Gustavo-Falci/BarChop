"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResumoDaAssinatura } from "@barchop/types";
import { diaEMes, diasQueFaltam, emLista, nomeDoPlano, profissionais, temPlanoPago } from "./assinatura";
import { faixaFechada, fecharFaixa } from "./faixa";
import { IconeFechar } from "./icones";
import { useAssinatura } from "./ProvedorDaAssinatura";
import estilos from "./FaixaDaAssinatura.module.css";

interface Recado {
  tom: "neutro" | "atencao";
  texto: string;
  acao: string;
  // Só o recado neutro com folga de prazo fecha: nos últimos 3 dias, e
  // no de atenção, a faixa é o aviso que não pode sumir.
  fechavel: boolean;
  // O que identifica o recado ao fechar. Não o texto: "faltam 10 dias"
  // vira "faltam 9" no meio das 24h e é o mesmo recado.
  chave: string;
}

const DIA = 24 * 60 * 60 * 1000;
const ULTIMOS_DIAS = 3;

function diasAte(instante: string): number {
  return Math.ceil((Date.parse(instante) - Date.now()) / DIA);
}

// O que a assinatura pede de atenção agora, do mais urgente pro menos.
// Ativa e em dia não pede nada: sem faixa.
function recadoDa(resumo: ResumoDaAssinatura): Recado | null {
  if (resumo.situacao === "em_atraso") {
    return {
      tom: "atencao",
      texto: "Pagamento pendente: atualize o cartão para não perder o plano.",
      acao: "Resolver",
      fechavel: false,
      chave: "atraso",
    };
  }
  // Só enquanto o plano pago vale: acabado, o que importa é o Grátis.
  if (temPlanoPago(resumo) && resumo.cancelaEm) {
    return {
      tom: "neutro",
      texto: `Assinatura cancelada: o ${nomeDoPlano(resumo)} vale até ${diaEMes(resumo.cancelaEm)}.`,
      acao: "Ver plano",
      fechavel: diasAte(resumo.cancelaEm) > ULTIMOS_DIAS,
      chave: `cancelada:${resumo.cancelaEm}`,
    };
  }
  if (resumo.situacao === "teste" && resumo.diasDeTesteRestantes) {
    return {
      tom: "neutro",
      texto: `Teste grátis: ${diasQueFaltam(resumo.diasDeTesteRestantes)}.`,
      acao: "Escolher plano",
      fechavel: resumo.diasDeTesteRestantes > ULTIMOS_DIAS,
      chave: `teste:${resumo.testeTerminaEm ?? ""}`,
    };
  }
  if (resumo.excedente && resumo.limiteDeProfissionais !== null) {
    const fora = resumo.foraDoLink.map((membro) => membro.nome);
    return {
      tom: "atencao",
      texto:
        `No Grátis, só ${profissionais(resumo.limiteDeProfissionais)} aparece no seu link.` +
        (fora.length > 0 ? ` Fora do link: ${emLista(fora)}.` : ""),
      acao: "Escolher plano",
      fechavel: false,
      chave: "excedente",
    };
  }
  if (resumo.situacao === "teste") {
    return {
      tom: "atencao",
      texto: "Seu teste acabou: a barbearia está no Grátis.",
      acao: "Escolher plano",
      fechavel: false,
      chave: "teste-acabou",
    };
  }
  return null;
}

// A faixa no topo do painel (só o dono a vê: pros outros papéis o
// resumo nem chega). Leva sempre pra tela do plano, que explica o resto.
export function FaixaDaAssinatura() {
  const { resumo } = useAssinatura();
  const recado = resumo ? recadoDa(resumo) : null;
  // O que foi fechado mora no navegador; lido depois de montar, pra o
  // HTML do servidor e o primeiro quadro do cliente não discordarem.
  const [fechadaAgora, setFechadaAgora] = useState<string | null>(null);
  const [lida, setLida] = useState(false);
  useEffect(() => setLida(true), []);

  if (!recado || !lida) return null;
  if (recado.fechavel && (fechadaAgora === recado.chave || faixaFechada(recado.chave))) return null;

  function fechar() {
    if (!recado) return;
    fecharFaixa(recado.chave);
    setFechadaAgora(recado.chave);
  }

  return (
    <section aria-label="Assinatura" className={`${estilos.faixa} ${estilos[recado.tom]}`}>
      <p className={estilos.texto}>{recado.texto}</p>
      <div className={estilos.acoes}>
        <Link href="/painel/faturas" className={estilos.acao}>
          {recado.acao}
        </Link>
        {recado.fechavel ? (
          <button type="button" className={estilos.fechar} onClick={fechar} aria-label="Fechar aviso" title="Fechar por hoje">
            <IconeFechar width={16} height={16} />
          </button>
        ) : null}
      </div>
    </section>
  );
}
