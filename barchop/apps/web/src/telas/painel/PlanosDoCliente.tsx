"use client";

import { useState } from "react";
import type { ErroDaApi } from "@barchop/api-client";
import type { AssinaturaDoPainel, PlanoDoPainel } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Chip } from "../../componentes/Chip";
import { SeletorEmPilulas } from "../../componentes/SeletorEmPilulas";
import { useRequisicao } from "../../api/useRequisicao";
import { somarDias } from "../../formato/datas";
import {
  ROTULO_DA_SITUACAO,
  TOM_DA_SITUACAO,
  deQuemEOPlano,
  diaEMes,
  fraseDoCiclo,
  fraseDoRecebido,
  podeReceber,
  precoDoCiclo,
} from "../../painel/planos";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { JanelaDoRecebi } from "./JanelaDoRecebi";
import estilos from "./PlanosDoCliente.module.css";

// O que acontece ao assinar, antes de assinar.
function fraseDoComeco(plano: PlanoDoPainel, hoje: string): string {
  if (plano.diasDeTeste > 0) {
    const dias = plano.diasDeTeste === 1 ? "1 dia grátis" : `${plano.diasDeTeste} dias grátis`;
    return `Começa com ${dias}, até ${diaEMes(somarDias(hoje, plano.diasDeTeste))}.`;
  }
  return "Fica pendente até o primeiro Recebi: marque quando o cliente pagar.";
}

// Uma assinatura do cliente, com o Recebi e o cancelar. O cancelar pede
// confirmação: o plano para de cobrir os atendimentos na hora.
function Assinatura({
  assinatura,
  hoje,
  aoReceber,
  aoCancelar,
}: {
  assinatura: AssinaturaDoPainel;
  hoje: string;
  aoReceber: () => void;
  aoCancelar: () => void;
}) {
  const api = useApiDoPainel();
  const [confirmando, setConfirmando] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();

  async function cancelar() {
    setAviso(undefined);
    setCancelando(true);
    try {
      await api.barbeiro.cancelarAssinaturaDoPlano(assinatura.id);
      aoCancelar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível cancelar agora.");
      setCancelando(false);
    }
  }

  return (
    <li className={estilos.assinatura}>
      <div className={estilos.cabeca}>
        <span className={estilos.nome}>{assinatura.plano.nome}</span>
        <Chip tom={TOM_DA_SITUACAO[assinatura.situacao]} tamanho="pequeno">
          {ROTULO_DA_SITUACAO[assinatura.situacao]}
        </Chip>
      </div>
      <p className={estilos.apoio}>
        {deQuemEOPlano(assinatura.plano)} · {precoDoCiclo(assinatura)}
      </p>
      <p className={estilos.apoio}>{fraseDoCiclo(assinatura)}</p>

      {confirmando ? (
        <div className={estilos.confirmacao}>
          <p>O plano deixa de valer nos atendimentos a partir de agora.</p>
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          <div className={estilos.botoes}>
            <Botao variante="fantasma" onClick={() => setConfirmando(false)} disabled={cancelando}>
              Manter
            </Botao>
            <Botao onClick={cancelar} carregando={cancelando}>
              Sim, cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div className={estilos.botoes}>
          <Botao variante="fantasma" onClick={() => setConfirmando(true)}>
            Cancelar assinatura
          </Botao>
          {podeReceber(assinatura, hoje) ? <Botao onClick={aoReceber}>Recebi</Botao> : null}
        </div>
      )}
    </li>
  );
}

// Os planos do cliente no detalhe (Onda 2, marco 3, PR 7b): o que ele
// assina, o Recebi de cada ciclo e o assinar no balcão. Sem plano pra
// oferecer e sem assinatura, a seção não aparece. Fora do Completo, o
// `planos()` é 403: some o assinar, e o que já assina segue.
export function PlanosDoCliente({ clienteId, hoje }: { clienteId: string; hoje: string }) {
  const api = useApiDoPainel();
  const assinaturas = useRequisicao(() => api.barbeiro.assinantes(clienteId), [clienteId]);
  const planos = useRequisicao(() => api.barbeiro.planos(), []);
  const [escolhendo, setEscolhendo] = useState(false);
  const [escolhido, setEscolhido] = useState("");
  const [assinando, setAssinando] = useState(false);
  const [recebendo, setRecebendo] = useState<AssinaturaDoPainel | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const [feito, setFeito] = useState<string | undefined>();

  // Só aparece depois das duas respostas, e não some ao reler.
  if (assinaturas.erro || !assinaturas.dados || (!planos.dados && !planos.erro)) return null;

  const vivas = assinaturas.dados.assinantes.filter((a) => a.situacao !== "cancelada");
  // Os que a API aceitaria: ativos, no balcão, e que o cliente ainda não
  // tem (uma viva por cliente e plano).
  const jaTem = new Set(vivas.map((a) => a.plano.id));
  const oferecidos = (planos.dados?.planos ?? []).filter((p) => p.ativo && p.aceitaNoBalcao && !jaTem.has(p.id));
  if (vivas.length === 0 && oferecidos.length === 0) return null;

  const planoEscolhido = oferecidos.find((p) => p.id === escolhido);

  async function assinar() {
    if (!planoEscolhido) return;
    setAviso(undefined);
    setAssinando(true);
    try {
      await api.barbeiro.assinarPlano(clienteId, planoEscolhido.id);
      setFeito(undefined);
      setEscolhendo(false);
      setEscolhido("");
      assinaturas.recarregar();
      planos.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível assinar agora.");
    }
    setAssinando(false);
  }

  return (
    <section className={estilos.planos} aria-labelledby="planos-do-cliente">
      <h2 id="planos-do-cliente" className={estilos.rotulo}>
        Planos
      </h2>
      {feito ? <Aviso tom="sucesso">{feito}</Aviso> : null}

      {vivas.length > 0 ? (
        <ul className={estilos.lista}>
          {vivas.map((assinatura) => (
            <Assinatura
              key={assinatura.id}
              assinatura={assinatura}
              hoje={hoje}
              aoReceber={() => setRecebendo(assinatura)}
              aoCancelar={() => {
                setFeito(`Assinatura do plano ${assinatura.plano.nome} cancelada.`);
                assinaturas.recarregar();
                planos.recarregar();
              }}
            />
          ))}
        </ul>
      ) : null}

      {oferecidos.length > 0 && !escolhendo ? (
        <div className={estilos.botoes}>
          <Botao variante="contorno" onClick={() => setEscolhendo(true)}>
            Assinar plano
          </Botao>
        </div>
      ) : null}

      {escolhendo ? (
        <div className={estilos.escolha}>
          <SeletorEmPilulas
            nome={`plano-${clienteId}`}
            legenda="Qual plano"
            opcoes={oferecidos.map((p) => ({ valor: p.id, rotulo: `${p.nome} · ${precoDoCiclo(p)}` }))}
            valor={escolhido}
            aoTrocar={setEscolhido}
            efeito={planoEscolhido ? fraseDoComeco(planoEscolhido, hoje) : undefined}
          />
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          <div className={estilos.botoes}>
            <Botao variante="fantasma" onClick={() => setEscolhendo(false)} disabled={assinando}>
              Cancelar
            </Botao>
            <Botao onClick={assinar} carregando={assinando} disabled={!planoEscolhido}>
              Assinar
            </Botao>
          </div>
        </div>
      ) : null}

      {recebendo ? (
        <JanelaDoRecebi
          assinatura={recebendo}
          hoje={hoje}
          aoReceber={(resultado) => {
            setFeito(`Recebido: ${fraseDoRecebido(resultado, hoje)}.`);
            setRecebendo(null);
            assinaturas.recarregar();
          }}
          aoFechar={() => setRecebendo(null)}
        />
      ) : null}
    </section>
  );
}
