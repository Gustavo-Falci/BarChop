"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { formatarReais, normalizarCpf } from "@barchop/formato";
import type { AssinaturaOnlineCriada, PlanoDaVitrine, ProvedorDePagamento } from "@barchop/types";
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
  incluiACada,
  planoDaQuery,
} from "../fluxo/planos";
import { caminhoDoPasso } from "../fluxo/passos";
import { PROVEDORES, comMaiuscula } from "../fluxo/provedores";
import { IconeCheck, IconeSeta } from "../painel/icones";
import { porCiclo, servicoDoPlano } from "../painel/planos";
import { useTemSessaoDoCliente } from "../sessao/useSessaoDoCliente";
import { useNoHost } from "../tenant/ProvedorDoHost";
import estilos from "./PlanosDaBarbearia.module.css";

// Os planos da barbearia, pra assinar (Onda 2, marco 3, PR 11 do plano
// planos-de-assinatura). Assinar online pede o cliente logado: sem
// sessão, o "Assinar" leva ao login, que volta pra cá com o plano
// marcado. Assinar acontece só no toque, nunca ao abrir a página: um
// link montado por outra pessoa criaria cliente e cobrança no provedor.
//
// O pagamento é na fatura do provedor da conta de quem vende (Asaas ou
// Stripe, `plano.pagamento`), em outra aba: o BarChop nunca vê cartão. O
// CPF só aparece quando a API pede (`cpf_obrigatorio`, só no Asaas). O link é um <a> de verdade, e não um `window.open` depois do
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
  // O "Como funciona" nomeia o provedor só quando todo plano online é
  // pago no mesmo.
  const provedores = new Set(planos.flatMap((plano) => (plano.pagamento ? [plano.pagamento.provedor] : [])));
  return (
    <main className={estilos.pagina}>
      <div className={estilos.cabeca}>
        <div className={estilos.titulo}>
          <Link href={noHost(`/${slug}`)} className={estilos.voltar}>
            <IconeSeta width="16" height="16" className={estilos.setaDeVolta} />
            Voltar pra barbearia
          </Link>
          <h1>Planos de assinatura</h1>
          <p className={estilos.apoio}>Um valor fixo por ciclo, com os serviços incluídos.</p>
        </div>
        <p className={estilos.apoio}>
          Já assina? <Link href={noHost(`/${slug}/minha-conta`)}>Veja em Minha conta</Link>
        </p>
      </div>
      {planos.length === 0 ? (
        <p>Esta barbearia não tem planos à venda agora.</p>
      ) : (
        <>
          <ul className={estilos.lista}>
            {planos.map((plano) => (
              <CartaoDoPlano key={plano.id} slug={slug} plano={plano} marcado={plano.id === marcado} />
            ))}
          </ul>
          <ComoFunciona
            online={planos.some((plano) => plano.aceitaOnline)}
            provedor={provedores.size === 1 ? [...provedores][0]! : null}
          />
        </>
      )}
    </main>
  );
}

// Os três passos, sem caixa. O do pagamento só fala do online quando
// algum plano da vitrine aceita: numa casa só de balcão, falar de
// provedor e cartão confundiria.
function ComoFunciona({ online, provedor }: { online: boolean; provedor: ProvedorDePagamento | null }) {
  return (
    <section className={estilos.comoFunciona} aria-labelledby="como-funciona">
      <h2 id="como-funciona" className={estilos.tituloDoComo}>
        Como funciona
      </h2>
      <ol className={estilos.passos}>
        <li className={estilos.passoDoComo}>
          <span className={estilos.numero} aria-hidden="true">
            1
          </span>
          <p className={estilos.nomeDoPasso}>Escolha o plano</p>
          <p className={estilos.apoio}>Cada um diz com quem vale e o que inclui.</p>
        </li>
        <li className={estilos.passoDoComo}>
          <span className={estilos.numero} aria-hidden="true">
            2
          </span>
          <p className={estilos.nomeDoPasso}>{online ? "Pague online ou no balcão" : "Pague no balcão"}</p>
          <p className={estilos.apoio}>
            {online
              ? `Online, a fatura abre na página ${provedor ? PROVEDORES[provedor].do : "de pagamento"}: o BarChop nunca vê seu cartão.`
              : "O pagamento é combinado na barbearia."}
          </p>
        </li>
        <li className={estilos.passoDoComo}>
          <span className={estilos.numero} aria-hidden="true">
            3
          </span>
          <p className={estilos.nomeDoPasso}>Agende como sempre</p>
          <p className={estilos.apoio}>No dia, você não paga o que o plano cobre. O resto é pago na hora.</p>
        </li>
      </ol>
    </section>
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
  const idDoInclui = useId();
  // Como na Minha conta: lido sem quebrar a hidratação (`undefined` até
  // o navegador responder).
  const temSessao = useTemSessaoDoCliente(slug) === true;
  const minhaConta = noHost(`/${slug}/minha-conta`);
  // Sem o online agora, nenhum texto de pagamento aparece.
  const textos = PROVEDORES[plano.pagamento?.provedor ?? "asaas"];
  const naPagina = `${textos.formas}, na página ${textos.do}.`;

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
      <div className={estilos.quem}>
        <div className={estilos.topo}>
          <h2 className={estilos.nomeDoPlano}>{plano.nome}</h2>
          {plano.diasDeTeste > 0 ? <span className={estilos.selo}>{fraseDoTesteGratis(plano.diasDeTeste)}</span> : null}
        </div>
        <p className={estilos.apoio}>{comQuemVale(plano)}</p>
      </div>
      {plano.descricao ? <p className={estilos.descricao}>{plano.descricao}</p> : null}
      <p className={estilos.preco}>
        <span className={estilos.valor}>{formatarReais(plano.precoCentavos)}</span>{" "}
        <span className={estilos.ciclo}>{porCiclo(plano.ciclo)}</span>
      </p>
      <div className={estilos.inclui}>
        <p id={idDoInclui} className={estilos.rotulo}>
          {incluiACada(plano.ciclo)}
        </p>
        <ul className={estilos.servicos} aria-labelledby={idDoInclui}>
          {plano.servicos.map((servico) => (
            <li key={servico.servicoId} className={estilos.servico}>
              <IconeCheck className={estilos.check} />
              {servicoDoPlano(servico)}
            </li>
          ))}
        </ul>
      </div>

      <div className={estilos.rodape}>
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
                  {passo.criada.assinatura.situacao === "teste"
                    ? `${naPagina} O plano já vale no teste grátis.`
                    : `${naPagina} Quando o pagamento entrar, a assinatura aparece ativa em Minha conta.`}
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
              apoio={`${comMaiuscula(textos.o)} pede o CPF de quem assina. Ele fica guardado no seu cadastro desta barbearia.`}
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
            <div className={estilos.acaoPrincipal}>
              <Botao onClick={() => void assinar()} carregando={enviando}>
                Assinar
              </Botao>
            </div>
            <p className={`${estilos.apoio} ${estilos.centro}`}>
              {plano.aceitaNoBalcao ? `${textos.formas}. Ou assine no balcão.` : `${textos.formas}.`}
            </p>
          </div>
        ) : (
          // Sem o Assinar. O online marcado sem a conta de quem vende vira
          // "Pagamento online indisponível", no lugar do botão. No balcão,
          // o caminho é ir à barbearia: o botão leva pro agendamento, já
          // com o profissional quando o plano é dele.
          <div className={estilos.passo}>
            {plano.onlineIndisponivel ? <p className={estilos.indisponivel}>Pagamento online indisponível</p> : null}
            {plano.aceitaNoBalcao ? (
              <>
                <p className={estilos.apoio}>
                  <strong className={estilos.forte}>Assine na barbearia.</strong> O pagamento é combinado no balcão.
                </p>
                <div className={estilos.acaoPrincipal}>
                  <BotaoLink
                    href={noHost(caminhoDoPasso(slug, "servicos", { servicoIds: [], profissional: plano.vendedor?.id }))}
                    variante="contorno"
                  >
                    {plano.vendedor ? `Agendar com ${plano.vendedor.nome}` : "Agendar um horário"}
                  </BotaoLink>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </li>
  );
}
