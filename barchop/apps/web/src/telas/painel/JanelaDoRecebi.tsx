"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import { FORMAS_DE_PAGAMENTO, fimDoCiclo, formatarReais } from "@barchop/formato";
import type { AssinaturaDoPainel, FormaDoPagamento, RecebimentoDoBalcao } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import { depoisDaSaida } from "../../movimento/depoisDaSaida";
import { ROTULO_DA_FORMA } from "../../painel/caixa";
import { diaEMes } from "../../painel/planos";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./JanelaDoRecebi.module.css";

// "Pelo plano" não é forma de pagar a mensalidade.
const OPCOES_DE_FORMA = FORMAS_DE_PAGAMENTO.map((valor) => ({ valor, rotulo: ROTULO_DA_FORMA[valor] }));

// O "Recebi" do balcão (PR 7b): a mensalidade entra no caixa com a forma,
// e o ciclo recomeça hoje. Na lista de assinantes e no detalhe do
// cliente.
export function JanelaDoRecebi({
  assinatura,
  hoje,
  aoReceber,
  aoFechar,
}: {
  assinatura: AssinaturaDoPainel;
  hoje: string;
  aoReceber: (recebido: RecebimentoDoBalcao) => void;
  aoFechar: () => void;
}) {
  const api = useApiDoPainel();
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const [forma, setForma] = useState<FormaDoPagamento>("pix");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | undefined>();

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  async function confirmar() {
    setErro(undefined);
    setEnviando(true);
    try {
      aoReceber(await api.barbeiro.receberMensalidade(assinatura.id, forma));
    } catch (causa) {
      setErro((causa as ErroDaApi).mensagem || "Não foi possível lançar agora.");
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={janela}
      className={estilos.janela}
      aria-labelledby={titulo}
      onClose={(evento) => depoisDaSaida(evento.currentTarget, aoFechar)}
    >
      <h2 id={titulo} className={estilos.titulo}>
        Recebi a mensalidade
      </h2>
      <p className={estilos.apoio}>
        {assinatura.cliente.nome} · {assinatura.plano.nome} · {formatarReais(assinatura.precoCentavos)}
      </p>
      <SeletorEmPilulas
        nome={`forma-${assinatura.id}`}
        legenda="Como pagou"
        opcoes={OPCOES_DE_FORMA}
        valor={forma}
        aoTrocar={setForma}
        efeito={`Entra no caixa e o plano vale até ${diaEMes(fimDoCiclo(hoje, assinatura.ciclo))}.`}
      />
      {erro ? <Aviso>{erro}</Aviso> : null}
      <div className={estilos.rodape}>
        <Botao variante="fantasma" onClick={() => janela.current?.close()} disabled={enviando}>
          Cancelar
        </Botao>
        <Botao onClick={confirmar} carregando={enviando}>
          Confirmar
        </Botao>
      </div>
    </dialog>
  );
}
