"use client";

import Link from "next/link";
import type { ResumoDaAssinatura } from "@barchop/types";
import { diaEMes, diasQueFaltam, emLista, nomeDoPlano, profissionais } from "./assinatura";
import { useAssinatura } from "./ProvedorDaAssinatura";
import estilos from "./FaixaDaAssinatura.module.css";

interface Recado {
  tom: "neutro" | "atencao";
  texto: string;
  acao: string;
}

// O que a assinatura pede de atenção agora, do mais urgente pro menos.
// Ativa e em dia não pede nada: sem faixa.
function recadoDa(resumo: ResumoDaAssinatura): Recado | null {
  if (resumo.situacao === "em_atraso") {
    return {
      tom: "atencao",
      texto: "Pagamento pendente: atualize o cartão para não perder o plano.",
      acao: "Resolver",
    };
  }
  if (resumo.cancelaEm) {
    return {
      tom: "neutro",
      texto: `Assinatura cancelada: o ${nomeDoPlano(resumo)} vale até ${diaEMes(resumo.cancelaEm)}.`,
      acao: "Ver plano",
    };
  }
  if (resumo.situacao === "teste" && resumo.diasDeTesteRestantes) {
    return {
      tom: "neutro",
      texto: `Teste grátis: ${diasQueFaltam(resumo.diasDeTesteRestantes)}.`,
      acao: "Escolher plano",
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
    };
  }
  if (resumo.situacao === "teste") {
    return { tom: "atencao", texto: "Seu teste acabou: a barbearia está no Grátis.", acao: "Escolher plano" };
  }
  return null;
}

// A faixa no topo do painel (só o dono a vê: pros outros papéis o
// resumo nem chega). Leva sempre pra tela do plano, que explica o resto.
export function FaixaDaAssinatura() {
  const { resumo } = useAssinatura();
  const recado = resumo ? recadoDa(resumo) : null;
  if (!recado) return null;

  return (
    <section aria-label="Assinatura" className={`${estilos.faixa} ${estilos[recado.tom]}`}>
      <p className={estilos.texto}>{recado.texto}</p>
      <Link href="/painel/assinatura" className={estilos.acao}>
        {recado.acao}
      </Link>
    </section>
  );
}
