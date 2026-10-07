"use client";

import { useId } from "react";
import { CodigoQr } from "../../../componentes/CodigoQr";
import estilos from "./CartaoDoLink.module.css";

// O cartão do link no Hoje (painel v2, marco 4): o endereço da página
// da barbearia, o QR dele e a porta pra janela de compartilhar. Pra
// todos os papéis — o link é público, e quem manda pro cliente pode
// ser o profissional.
export function CartaoDoLink({ link, aoCompartilhar }: { link: string; aoCompartilhar: () => void }) {
  const titulo = useId();
  return (
    <section className={estilos.cartao} aria-labelledby={titulo}>
      <div className={estilos.texto}>
        <h2 id={titulo} className={estilos.titulo}>
          Seu link
        </h2>
        <p className={estilos.apoio}>Onde o cliente marca sozinho. Mande no WhatsApp ou ponha no balcão.</p>
        <strong className={estilos.link}>{link}</strong>
        <button type="button" className={estilos.acao} onClick={aoCompartilhar}>
          Compartilhar
        </button>
      </div>
      <CodigoQr texto={link} rotulo="QR code do seu link" className={estilos.qr} />
    </section>
  );
}
