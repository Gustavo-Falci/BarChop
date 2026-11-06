"use client";

import { BotaoLink } from "../../componentes/Botao";
import { IconeFechar } from "../../painel/icones";
import estilos from "./CheckoutCancelado.module.css";

// Quem desiste no Checkout da Stripe volta pra cá (a urlDeCancelamento
// da API): nada foi cobrado, e dá pra tentar de novo ou voltar ao painel.
// Sem falar do teste (onda C): a tela aparece também pra quem não está
// nele.
export function CheckoutCancelado() {
  return (
    <section className={estilos.tela} aria-labelledby="pagamento-nao-concluido">
      <div className={estilos.cabecalho}>
        <span className={estilos.marca} aria-hidden="true">
          <IconeFechar width={24} height={24} />
        </span>
        <h1 id="pagamento-nao-concluido" className={estilos.titulo}>
          Pagamento não concluído
        </h1>
        <p className={estilos.texto}>
          Você saiu da página de pagamento antes de terminar. Nenhuma cobrança foi feita no seu cartão.
        </p>
        <p className={estilos.detalhe}>Dá pra tentar de novo quando quiser.</p>
      </div>
      <div className={estilos.acoes}>
        <BotaoLink href="/painel/faturas">Tentar de novo</BotaoLink>
        <BotaoLink href="/painel" variante="fantasma">
          Voltar ao painel
        </BotaoLink>
      </div>
    </section>
  );
}
