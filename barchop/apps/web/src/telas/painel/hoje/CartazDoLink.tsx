"use client";

import { Aviso } from "../../../componentes/Aviso";
import { CodigoQr } from "../../../componentes/CodigoQr";
import { useRequisicao } from "../../../api/useRequisicao";
import { linkDaBarbearia } from "../../../painel/compartilhar";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import estilos from "./CartazDoLink.module.css";

// O cartaz pro balcão (painel v2, marco 4), aberto pela janela de
// compartilhar numa aba própria, sem a barra do painel: o que sai na
// impressão é só ele.
export function CartazDoLink() {
  const api = useApiDoPainel();
  const { slug } = usePainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);

  if (barbearia.erro) return <Aviso>Não foi possível montar o cartaz agora.</Aviso>;
  if (!barbearia.dados) return <p>Carregando…</p>;

  const link = linkDaBarbearia(slug, process.env.NEXT_PUBLIC_URL_DO_SITE, window.location.origin);

  return (
    <main className={estilos.pagina}>
      <article className={estilos.cartaz}>
        <h1 className={estilos.nome}>{barbearia.dados.nome}</h1>
        <p className={estilos.chamada}>Aponte a câmera do celular e agende seu horário</p>
        <CodigoQr texto={link} rotulo="QR code do link da barbearia" className={estilos.qr} />
        <p className={estilos.link}>{link}</p>
      </article>
      <button type="button" className={estilos.imprimir} onClick={() => window.print()}>
        Imprimir
      </button>
    </main>
  );
}
