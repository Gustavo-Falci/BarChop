"use client";

import { useId, useState } from "react";
import { CodigoQr } from "../../../componentes/CodigoQr";
import { copiarLink } from "../../../painel/compartilhar";
import { IconeCopiar } from "../../../painel/icones";
import estilos from "./CartaoDoLink.module.css";

// O cartão do link no Hoje (painel v2, marco 4): o endereço da página
// da barbearia, o QR dele e a porta pra janela de compartilhar. Pra
// todos os papéis — o link é público, e quem manda pro cliente pode
// ser o profissional.
//
// No celular (redesenho, PR 2) o QR fica recolhido atrás do botão "QR
// code": aberto, ele empurrava o resto do dia pra baixo da dobra. O
// copiar fica no próprio cartão, ao lado do link, e marca o passo "Seu
// link" como o da janela. No desktop o QR segue à vista, sem o botão.
export function CartaoDoLink({
  link,
  aoCompartilhar,
  aoCopiar,
}: {
  link: string;
  aoCompartilhar: () => void;
  aoCopiar: () => Promise<void>;
}) {
  const titulo = useId();
  const idDoQr = useId();
  const [qrAberto, setQrAberto] = useState(false);
  const [aviso, setAviso] = useState("");

  async function copiar() {
    if (!(await copiarLink(link))) {
      setAviso(`Não deu pra copiar daqui. Seu link: ${link}`);
      return;
    }
    await aoCopiar();
    setAviso("Link copiado.");
  }

  return (
    <section className={estilos.cartao} aria-labelledby={titulo}>
      <div className={estilos.texto}>
        <h2 id={titulo} className={estilos.titulo}>
          Seu link
        </h2>
        <p className={estilos.apoio}>Onde o cliente marca sozinho. Mande no WhatsApp ou ponha no balcão.</p>
        <div className={estilos.linhaDoLink}>
          <strong className={estilos.link}>{link}</strong>
          <button type="button" className={estilos.copiar} aria-label="Copiar o link" onClick={copiar}>
            <IconeCopiar />
          </button>
        </div>
        {/* Montado desde o início, vazio: região viva que nasce junto com
            o texto não é anunciada por todo leitor de tela. */}
        <p role="status" className={estilos.aviso}>
          {aviso}
        </p>
        <div className={estilos.acoes}>
          <button type="button" className={estilos.acao} onClick={aoCompartilhar}>
            Compartilhar
          </button>
          <button
            type="button"
            className={estilos.alternarQr}
            aria-expanded={qrAberto}
            aria-controls={idDoQr}
            onClick={() => setQrAberto((aberto) => !aberto)}
          >
            QR code
          </button>
        </div>
      </div>
      <div id={idDoQr} className={estilos.qr} data-aberto={qrAberto ? "" : undefined}>
        <CodigoQr texto={link} rotulo="QR code do seu link" className={estilos.codigo} />
      </div>
    </section>
  );
}
