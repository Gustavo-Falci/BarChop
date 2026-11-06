"use client";

import Link from "next/link";
import { Aviso } from "../../../componentes/Aviso";
import { CodigoQr } from "../../../componentes/CodigoQr";
import { useRequisicao } from "../../../api/useRequisicao";
import { linkDaBarbearia } from "../../../painel/compartilhar";
import { useApiDoPainel } from "../../../painel/ProvedorDoPainel";
import { usePainel } from "../../../painel/SessaoDoPainel";
import estilos from "./CartazDoLink.module.css";
import { Carregando } from "../../../componentes/Carregando";
import { IconeSeta } from "../../../painel/icones";
import { enderecoSemProtocolo } from "../../../tenant/endereco";

// O cartaz pro balcão (painel v2, marco 4), aberto pela janela de
// compartilhar numa aba própria, sem a barra do painel: o que sai na
// impressão é só ele. Onda C: uma barra em cima, com o caminho de volta
// e o tamanho da folha, que some na impressão.
export function CartazDoLink() {
  const api = useApiDoPainel();
  const { slug } = usePainel();
  const barbearia = useRequisicao(() => api.barbeiro.minhaBarbearia(), []);

  if (barbearia.erro) return <Aviso>Não foi possível montar o cartaz agora.</Aviso>;
  if (!barbearia.dados) return <Carregando />;

  const link = linkDaBarbearia(slug, process.env.NEXT_PUBLIC_URL_DO_SITE, window.location.origin);

  return (
    <div className={estilos.tela}>
      <div className={estilos.barra}>
        <Link href="/painel" className={estilos.voltar}>
          <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
          Voltar ao painel
        </Link>
        <span className={estilos.folha}>Sai numa folha A4</span>
      </div>
      <main className={estilos.pagina}>
        <article className={estilos.cartaz}>
          <h1 className={estilos.nome}>{barbearia.dados.nome}</h1>
          <p className={estilos.chamada}>Aponte a câmera do celular e agende seu horário</p>
          {/* O QR leva o link inteiro; o texto vai sem o "https://". */}
          <CodigoQr texto={link} rotulo="QR code do link da barbearia" className={estilos.qr} />
          <p className={estilos.link}>
            <EnderecoQueQuebra endereco={enderecoSemProtocolo(link)} />
          </p>
        </article>
        <button type="button" className={estilos.imprimir} onClick={() => window.print()}>
          Imprimir
        </button>
      </main>
    </div>
  );
}

// O endereço quebra antes de cada ponto ou barra, e não no hífen do
// meio do nome: cada pedaço é um bloco em linha, que só quebra por dentro
// se sozinho não couber no cartão.
function EnderecoQueQuebra({ endereco }: { endereco: string }) {
  return (
    <>
      {endereco.split(/(?=[./])/).map((pedaco, indice) => (
        <span key={indice} className={estilos.pedaco}>
          {pedaco}
        </span>
      ))}
    </>
  );
}
