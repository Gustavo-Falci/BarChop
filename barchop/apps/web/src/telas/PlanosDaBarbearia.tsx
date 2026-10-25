"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { normalizarCpf } from "@barchop/formato";
import type { AssinaturaOnlineCriada, PlanoDaVitrine } from "@barchop/types";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Campo } from "../componentes/Campo";
import { Carregando } from "../componentes/Carregando";
import {
  caminhoDoLoginParaAssinar,
  comQuemVale,
  fraseDaFatura,
  fraseDoTesteGratis,
  planoDaQuery,
} from "../fluxo/planos";
import { precoDoCiclo, resumoDosServicos } from "../painel/planos";
import { sessaoDoCliente } from "../sessao/armazenamento";
import { useNoHost } from "../tenant/ProvedorDoHost";
import estilos from "./PlanosDaBarbearia.module.css";

// Os planos da barbearia, pra assinar (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura). Assinar online pede o cliente logado: sem
// sessão, o "Assinar" leva ao login, que volta pra cá com o plano
// marcado. Assinar acontece só no toque, nunca ao abrir a página: um
// link montado por outra pessoa criaria cliente e cobrança no Asaas.
//
// O pagamento é na fatura do Asaas, em outra aba: o BarChop nunca vê
// cartão. O link é um <a> de verdade, e não um `window.open` depois do
// pedido, que o Safari do iPhone bloqueia.
export function PlanosDaBarbearia() {
  const { slug } = useParams<{ slug: string }>();
  const query = useSearchParams();
  const noHost = useNoHost();
  const api = useApi();
  const vitrine = useRequisicao(() => api.publico.planos(slug), [slug]);
  const marcado = planoDaQuery(query.get("plano"));

  if (vitrine.carregando) {
    return (
      <main className={estilos.pagina}>
        <Carregando />
      </main>
    );
  }
  if (vitrine.erro) {
    return (
      <main className={estilos.pagina}>
        <h1>Planos de assinatura</h1>
        <Aviso>Não foi possível carregar os planos agora.</Aviso>
      </main>
    );
  }

  const planos = vitrine.dados?.planos ?? [];
  return (
    <main className={estilos.pagina}>
      <div className={estilos.cabeca}>
        <h1>Planos de assinatura</h1>
        <p className={estilos.apoio}>Um preço por ciclo, com os serviços incluídos.</p>
      </div>
      {planos.length === 0 ? (
        <p>
          Esta barbearia não tem planos à venda agora. <Link href={noHost(`/${slug}`)}>Voltar pra página</Link>
        </p>
      ) : (
        <ul className={estilos.lista}>
          {planos.map((plano) => (
            <CartaoDoPlano key={plano.id} slug={slug} plano={plano} marcado={plano.id === marcado} />
          ))}
        </ul>
      )}
    </main>
  );
}

type Passo = { tipo: "inicio" } | { tipo: "cpf" } | { tipo: "pagar"; criada: AssinaturaOnlineCriada };

function CartaoDoPlano({ slug, plano, marcado }: { slug: string; plano: PlanoDaVitrine; marcado: boolean }) {
  const api = useApi();
  const router = useRouter();
  const noHost = useNoHost();
  const [passo, setPasso] = useState<Passo>({ tipo: "inicio" });
  const [cpf, setCpf] = useState("");
  const [erroDoCpf, setErroDoCpf] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [jaAssina, setJaAssina] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cartao = useRef<HTMLLIElement>(null);
  const temSessao = Boolean(sessaoDoCliente(slug).ler());
  const minhaConta = noHost(`/${slug}/minha-conta`);

  // Quem voltou do login cai no plano que escolheu.
  useEffect(() => {
    if (marcado) cartao.current?.scrollIntoView?.({ block: "center" });
  }, [marcado]);

  async function assinar(comCpf?: string) {
    if (!temSessao) {
      router.push(noHost(caminhoDoLoginParaAssinar(slug, plano.id)));
      return;
    }
    setAviso(undefined);
    setJaAssina(false);
    setEnviando(true);
    try {
      setPasso({ tipo: "pagar", criada: await api.cliente.assinarPlano(plano.id, comCpf) });
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (falha.codigo === "nao_autenticado") {
        router.push(noHost(caminhoDoLoginParaAssinar(slug, plano.id)));
      } else if (falha.codigo === "cpf_obrigatorio") {
        setPasso({ tipo: "cpf" });
      } else if (falha.codigo === "cpf_invalido") {
        setErroDoCpf("Confira o CPF: os números não batem.");
      } else {
        setJaAssina(falha.codigo === "ja_assina");
        setAviso(falha.mensagem || "Não foi possível assinar agora.");
      }
    }
    setEnviando(false);
  }

  function continuarComCpf() {
    // A mesma conta da API: barra aqui o que ela recusaria.
    if (normalizarCpf(cpf) === null) {
      setErroDoCpf("Confira o CPF: os números não batem.");
      return;
    }
    void assinar(cpf);
  }

  return (
    <li ref={cartao} className={marcado ? `${estilos.plano} ${estilos.marcado}` : estilos.plano}>
      <div className={estilos.topo}>
        <h2 className={estilos.nomeDoPlano}>{plano.nome}</h2>
        <span className={estilos.preco}>{precoDoCiclo(plano)}</span>
      </div>
      <p className={estilos.apoio}>{comQuemVale(plano)}</p>
      {plano.descricao ? <p className={estilos.descricao}>{plano.descricao}</p> : null}
      <p>
        <span className={estilos.rotulo}>Inclui:</span> {resumoDosServicos(plano.servicos)} a cada ciclo
      </p>
      {plano.diasDeTeste > 0 ? <p className={estilos.teste}>{fraseDoTesteGratis(plano.diasDeTeste)}</p> : null}

      {passo.tipo === "pagar" ? (
        <div className={estilos.passo} role="status">
          <p>
            <strong>Assinatura feita.</strong> {fraseDaFatura(passo.criada.assinatura)}
          </p>
          {passo.criada.linkDaFatura ? (
            <>
              <div className={estilos.acoes}>
                <BotaoLink href={passo.criada.linkDaFatura} externo>
                  Abrir a fatura
                </BotaoLink>
                <BotaoLink href={minhaConta} variante="fantasma">
                  Ver em Minha conta
                </BotaoLink>
              </div>
              <p className={estilos.apoio}>
                Pix, cartão ou boleto, na página do Asaas. Quando o pagamento entrar, a assinatura aparece ativa em
                Minha conta.
              </p>
            </>
          ) : (
            <p>
              A fatura não abriu agora: ela fica em <Link href={minhaConta}>Minha conta</Link>.
            </p>
          )}
        </div>
      ) : passo.tipo === "cpf" ? (
        <div className={estilos.passo}>
          <Campo
            rotulo="CPF"
            inputMode="numeric"
            autoComplete="off"
            maxLength={14}
            placeholder="000.000.000-00"
            apoio="O Asaas pede o CPF de quem assina. Ele fica guardado no seu cadastro desta barbearia."
            valor={cpf}
            onChange={(proximo) => {
              setCpf(proximo);
              setErroDoCpf(undefined);
            }}
            erro={erroDoCpf}
          />
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          <div className={estilos.acoes}>
            <Botao variante="fantasma" onClick={() => setPasso({ tipo: "inicio" })} disabled={enviando}>
              Voltar
            </Botao>
            <Botao onClick={continuarComCpf} carregando={enviando}>
              Continuar pro pagamento
            </Botao>
          </div>
        </div>
      ) : plano.aceitaOnline ? (
        <div className={estilos.passo}>
          {marcado && temSessao ? <p className={estilos.apoio}>Você entrou. Toque em Assinar pra continuar.</p> : null}
          {aviso ? (
            <Aviso>
              {aviso}
              {jaAssina ? (
                <>
                  {" "}
                  <Link href={minhaConta}>Ver em Minha conta</Link>
                </>
              ) : null}
            </Aviso>
          ) : null}
          <div className={estilos.acoes}>
            <Botao onClick={() => void assinar()} carregando={enviando}>
              Assinar
            </Botao>
          </div>
          {plano.aceitaNoBalcao ? (
            <p className={estilos.apoio}>Ou assine na barbearia, pagando no balcão.</p>
          ) : null}
        </div>
      ) : (
        <p className={estilos.apoio}>Assine na barbearia: o pagamento é combinado no balcão.</p>
      )}
    </li>
  );
}
