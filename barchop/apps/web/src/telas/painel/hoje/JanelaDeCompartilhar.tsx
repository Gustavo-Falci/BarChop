"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CodigoQr, carregarQrcode, OPCOES_DO_QR } from "../../../componentes/CodigoQr";
import { urlDoWhatsApp } from "../../../painel/compartilhar";
import estilos from "./JanelaDeCompartilhar.module.css";

// A janela de compartilhar do Hoje (painel v2, marco 4). <dialog>
// nativo: o navegador prende o foco, fecha no Esc e escurece o fundo.
// Qualquer ação avisa `aoCompartilhar`, que marca o passo "Seu link".
export function JanelaDeCompartilhar({
  link,
  nome,
  slug,
  aoCompartilhar,
  aoFechar,
}: {
  link: string;
  nome: string;
  slug: string;
  aoCompartilhar: () => Promise<void>;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [aviso, setAviso] = useState<string | null>(null);
  // O compartilhar do aparelho só existe no celular (e em alguns
  // navegadores de desktop). Onde não há, o botão nem aparece.
  const podeCompartilhar = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Sem permissão de área de transferência (navegador antigo, http
      // fora do localhost): o link fica à vista pra copiar à mão, e o
      // passo não marca — nada foi copiado.
      setAviso(`Não deu pra copiar daqui. Seu link: ${link}`);
      return;
    }
    await aoCompartilhar();
    setAviso("Link copiado. Agora é mandar pros clientes.");
  }

  async function compartilharDoAparelho() {
    try {
      await navigator.share({ title: nome, text: `Agende seu horário na ${nome}`, url: link });
    } catch {
      // Desistir na folha do sistema também rejeita: nada a avisar, e
      // nada foi compartilhado.
      return;
    }
    await aoCompartilhar();
  }

  async function baixarQr() {
    const qrcode = await carregarQrcode();
    const imagem = await qrcode.toDataURL(link, { ...OPCOES_DO_QR, width: 1024 });
    const ancora = document.createElement("a");
    ancora.href = imagem;
    ancora.download = `qr-${slug}.png`;
    ancora.click();
    await aoCompartilhar();
  }

  return (
    <dialog ref={janela} className={estilos.janela} aria-labelledby={titulo} onClose={aoFechar}>
      <div className={estilos.topo}>
        <h2 id={titulo} className={estilos.titulo}>
          Compartilhar seu link
        </h2>
        <button type="button" className={estilos.fechar} onClick={() => janela.current?.close()}>
          Fechar
        </button>
      </div>

      <div className={estilos.corpo}>
        <CodigoQr texto={link} rotulo="QR code do seu link" className={estilos.qr} />

        <div className={estilos.acoes}>
          <strong className={estilos.link}>{link}</strong>
          <button type="button" className={estilos.principal} onClick={() => void copiar()}>
            Copiar link
          </button>
          <a
            className={estilos.secundaria}
            href={urlDoWhatsApp(nome, link)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void aoCompartilhar()}
          >
            Mandar no WhatsApp
          </a>
          {podeCompartilhar ? (
            <button type="button" className={estilos.secundaria} onClick={() => void compartilharDoAparelho()}>
              Compartilhar…
            </button>
          ) : null}
          <button type="button" className={estilos.secundaria} onClick={() => void baixarQr()}>
            Baixar QR (PNG)
          </button>
          <a
            className={estilos.secundaria}
            href="/painel/cartaz"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void aoCompartilhar()}
          >
            Imprimir cartaz
          </a>
          {aviso ? (
            <p role="status" className={estilos.aviso}>
              {aviso}
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
