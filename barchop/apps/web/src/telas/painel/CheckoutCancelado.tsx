"use client";

import { BotaoLink } from "../../componentes/Botao";
import estilos from "./CheckoutCancelado.module.css";

// Quem desiste no Checkout da Stripe volta pra cá (a urlDeCancelamento
// da API): nada foi cobrado, e dá pra voltar aos planos ou ao painel,
// como no Barbeiro.app.
export function CheckoutCancelado() {
  return (
    <section className={estilos.tela} aria-labelledby="checkout-cancelado">
      <span className={estilos.marca} aria-hidden="true">
        ✕
      </span>
      <h1 id="checkout-cancelado" className={estilos.titulo}>
        Checkout cancelado
      </h1>
      <p className={estilos.texto}>
        Você saiu da página de pagamento. Sem problema: dá para tentar de novo quando quiser.
      </p>
      <p className={estilos.detalhe}>Nenhuma cobrança foi feita no seu cartão.</p>
      <div className={estilos.acoes}>
        <BotaoLink href="/painel/faturas">Ver planos</BotaoLink>
        <BotaoLink href="/painel" variante="contorno">
          ← Voltar ao painel
        </BotaoLink>
      </div>
    </section>
  );
}
