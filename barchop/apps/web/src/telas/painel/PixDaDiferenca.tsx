"use client";

import { useRouter } from "next/navigation";
import { Aviso } from "../../componentes/Aviso";
import { BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Carregando } from "../../componentes/Carregando";
import { emLista } from "../../painel/assinatura";
import { useAssinatura } from "../../painel/ProvedorDaAssinatura";
import { PagarADiferenca, useDiferenca } from "./FaturasNoPix";
import estilos from "./PixDaDiferenca.module.css";

// O Pix da diferença (plano profissional-novo-pago, canvas aprovado em
// 18/11): quem passou das vagas pagas no Pix aguarda; um QR só paga
// todos, de hoje até o fim do período pago. No "Já paguei" eles entram
// e recebem o convite; o Suporte confere depois. O mesmo QR fica no topo
// de Faturas.
export function PixDaDiferenca() {
  const router = useRouter();
  const { recarregar } = useAssinatura();
  const { equipe, aguardam, cotacao } = useDiferenca();

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }
  if (!aguardam) return <Carregando />;

  const voltar = { href: "/painel/equipe", rotulo: "Equipe" };
  if (aguardam.length === 0) {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina voltar={voltar} titulo="Pix da diferença" />
        <p className={estilos.apoio}>Ninguém aguarda pagamento.</p>
      </div>
    );
  }

  const nomes = emLista(aguardam.map((m) => m.nome));
  const um = aguardam.length === 1;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        voltar={voltar}
        titulo={um ? `Pague a vaga de ${nomes}` : `Pague as vagas de ${nomes}`}
        apoio={
          um
            ? `${nomes} entra na equipe depois do Pix. Até lá aparece como aguardando pagamento e não recebe o convite.`
            : `${nomes} entram na equipe depois do Pix. Até lá aparecem como aguardando pagamento e não recebem o convite.`
        }
      />

      {cotacao.erro ? <Aviso>{cotacao.erro.mensagem || "Não deu para gerar o Pix agora."}</Aviso> : null}
      {cotacao.dados ? (
        <PagarADiferenca
          aguardam={aguardam}
          cotacao={cotacao.dados}
          comPassos
          aoPagar={() => {
            recarregar();
            router.push("/painel/equipe");
          }}
        />
      ) : cotacao.erro ? null : (
        <Carregando />
      )}
      <BotaoLink href="/painel/equipe" variante="fantasma">
        Pagar depois
      </BotaoLink>
    </div>
  );
}
