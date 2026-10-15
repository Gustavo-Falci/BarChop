import {
  IDS_DOS_PLANOS,
  PLANOS,
  formatarReais,
  limiteDeProfissionais,
  precosDoCiclo,
  type IdDoPlano,
} from "@barchop/formato";
import Link from "next/link";
import { LinkDeAcao } from "./LinkDeAcao";
import estilos from "./TabelaDePrecos.module.css";

// Os três planos do site (Onda 2, PR 6 da cobrança), na Home e em
// /precos. Preço, extra e limite saem de planos.ts — o mesmo módulo do
// painel, da API e da Stripe —, então ninguém escreve um preço à mão.
// O que ainda não existe leva "(em breve)": o site não vende o que o
// produto não faz (decisão 8 do plano da cobrança).

const DESTAQUES: Record<IdDoPlano, { apoio: string; itens: string[]; convite: string }> = {
  gratis: {
    apoio: "Para quem trabalha sozinho, sem pagar nada.",
    itens: ["Agenda, link de agendamento e painel", "Lembrete por e-mail"],
    convite: "Começar grátis",
  },
  essencial: {
    apoio: "Para a barbearia pequena.",
    itens: ["Tudo do Grátis", "Caixa e relatórios (em breve)"],
    convite: "Testar 14 dias grátis",
  },
  completo: {
    apoio: "Para qualquer tamanho de equipe.",
    itens: ["Tudo do Essencial", "Relatórios completos (em breve)", "WhatsApp e planos para os seus clientes (em breve)"],
    convite: "Testar 14 dias grátis",
  },
};

function fraseDoLimite(plano: IdDoPlano): string {
  const limite = limiteDeProfissionais(plano);
  if (limite === null) return "Profissionais sem limite";
  return limite === 1 ? "1 profissional" : `Até ${limite} profissionais`;
}

export function TabelaDePrecos() {
  return (
    <ul aria-label="Planos" className={estilos.planos}>
      {IDS_DOS_PLANOS.map((id) => {
        const plano = PLANOS[id];
        const mensal = precosDoCiclo(id, "mensal");
        const anual = precosDoCiclo(id, "anual");
        const pago = mensal.base > 0;
        const destaque = DESTAQUES[id];
        return (
          <li key={id} aria-labelledby={`plano-${id}`} className={estilos.plano}>
            <div className={estilos.cabeca}>
              <h3 id={`plano-${id}`} className={estilos.nome}>
                {plano.nome}
              </h3>
              <p className={estilos.apoio}>{destaque.apoio}</p>
            </div>

            <p className={estilos.preco}>
              <span className={estilos.valor}>{formatarReais(mensal.base)}</span>
              <span className={estilos.periodo}>/mês</span>
            </p>
            {pago ? (
              <p className={estilos.detalhe}>
                Com 1 profissional · + {formatarReais(mensal.extra)} por profissional a mais
                <br />
                ou {formatarReais(anual.base)} por ano (2 meses grátis)
              </p>
            ) : (
              <p className={estilos.detalhe}>
                Para sempre, sem cartão.{" "}
                <Link href="/gratis" className={estilos.saibaMais}>
                  Saiba mais sobre o Grátis
                </Link>
              </p>
            )}

            <ul className={estilos.itens}>
              <li>{fraseDoLimite(id)}</li>
              {destaque.itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <div className={estilos.convite}>
              <LinkDeAcao href="/painel/cadastro" variante={pago ? "primario" : "contorno"}>
                {destaque.convite}
              </LinkDeAcao>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
