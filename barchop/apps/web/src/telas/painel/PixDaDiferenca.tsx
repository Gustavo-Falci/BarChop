"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao, BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Carregando } from "../../componentes/Carregando";
import { useRequisicao } from "../../api/useRequisicao";
import { emLista, pontasDoPeriodo, profissionais } from "../../painel/assinatura";
import { useAssinatura } from "../../painel/ProvedorDaAssinatura";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { PassosDoPix, PixParaPagar } from "./FaturasNoPix";
import estilos from "./PixDaDiferenca.module.css";

// O Pix da diferença (plano profissional-novo-pago, canvas aprovado em
// 18/11): quem passou das vagas pagas no Pix aguarda; um QR só paga
// todos, de hoje até o fim do período pago. No "Já paguei" eles entram
// e recebem o convite; o Suporte confere depois.
export function PixDaDiferenca() {
  const api = useApiDoPainel();
  const router = useRouter();
  const { recarregar } = useAssinatura();
  const equipe = useRequisicao(() => api.barbeiro.equipe(), []);
  const aguardam = equipe.dados?.filter((m) => m.aguardaPagamento) ?? null;
  const quantos = aguardam?.length ?? 0;
  const cotacao = useRequisicao(
    () => (quantos > 0 ? api.barbeiro.cotacaoDaDiferenca() : Promise.resolve(null)),
    [quantos]
  );
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (equipe.erro) {
    return <Aviso>{equipe.erro.mensagem || "Não foi possível carregar a equipe agora."}</Aviso>;
  }
  if (!aguardam) return <Carregando />;

  const voltar = { href: "/painel/equipe", rotulo: "Equipe" };
  if (quantos === 0) {
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina voltar={voltar} titulo="Pix da diferença" />
        <p className={estilos.apoio}>Ninguém aguarda pagamento.</p>
      </div>
    );
  }

  const nomes = emLista(aguardam.map((m) => m.nome));
  const um = quantos === 1;

  async function pagar() {
    setPagando(true);
    setErro(null);
    try {
      await api.barbeiro.jaPagueiADiferenca();
      recarregar();
      router.push("/painel/equipe");
    } catch (causa) {
      setPagando(false);
      setErro(
        causa instanceof ErroDaApi
          ? `Não deu para registrar o pagamento: ${causa.message}.`
          : "Não deu para registrar o pagamento. Tente de novo."
      );
    }
  }

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
      {!cotacao.dados ? (
        cotacao.erro ? null : <Carregando />
      ) : (
        <PixParaPagar
          titulo="Pix da diferença"
          valorCentavos={cotacao.dados.valorCentavos}
          descricao={`${profissionais(quantos)} a mais, de ${pontasDoPeriodo(cotacao.dados.periodoComecaEm, cotacao.dados.periodoTerminaEm).join(" a ")}`}
          copiaECola={cotacao.dados.copiaECola}
          recebedor={cotacao.dados.recebedor}
        >
          <PassosDoPix />
          {erro ? <Aviso>{erro}</Aviso> : null}
          <Botao onClick={pagar} carregando={pagando}>
            Já paguei
          </Botao>
          <p className={estilos.apoio}>
            {um ? `${nomes} entra na hora e recebe o convite por e-mail.` : `${nomes} entram na hora e recebem o convite por e-mail.`}{" "}
            O suporte do BarChop confere o Pix no extrato; se não achar, {um ? "volta" : "voltam"} a aguardar e nada é
            apagado.
          </p>
          <BotaoLink href="/painel/equipe" variante="fantasma">
            Pagar depois
          </BotaoLink>
        </PixParaPagar>
      )}
    </div>
  );
}
