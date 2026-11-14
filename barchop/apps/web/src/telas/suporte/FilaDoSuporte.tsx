"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import { PLANOS, formatarReais } from "@barchop/formato";
import type { PixNaFila, SolicitacaoNaFila } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { diaEMes, nomeComCiclo, pontasDoPeriodo, profissionais } from "../../painel/assinatura";
import { antesDoPix } from "../../suporte/antesDoPix";
import { CascaDoSuporte } from "../../suporte/CascaDoSuporte";
import { useApiDoSuporte, type ApiDoSuporte } from "../../suporte/ProvedorDoSuporte";
import { sessaoDoSuporte } from "../../sessao/armazenamento";
import estilos from "./FilaDoSuporte.module.css";

const ENTRAR = "/painel/suporte/entrar";

// O mesmo limite do schema das duas recusas (troca de link e Pix).
const RESPOSTA_MAX = 500;

// O instante do pedido no fuso das barbearias: o suporte compara com o
// que o dono diz ("pedi ontem à noite") e com a hora do Pix no extrato.
const FORMATADOR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function ehNaoAutenticado(causa: unknown): boolean {
  return (causa as ErroDaApi | undefined)?.status === 401;
}

// A fila de Pedidos do suporte: os Pix do BarChop pra conferir no
// extrato (plano pix-do-barchop, PR 3; canvas Pix-Suporte) e, depois,
// os pedidos de troca do link (Onda 1, F4d). Fora do (guardado) do
// painel: a sessão aqui é a do suporte, que não tem barbearia.
export function FilaDoSuporte() {
  const router = useRouter();
  const api = useApiDoSuporte();
  const [links, setLinks] = useState<SolicitacaoNaFila[] | null>(null);
  const [pix, setPix] = useState<PixNaFila[] | null>(null);
  // Pix decididos nesta tela: o cartão fica com a confirmação, mas não
  // conta mais como aberto.
  const [pixDecididos, setPixDecididos] = useState<ReadonlySet<string>>(new Set());
  const [avisoDosLinks, setAvisoDosLinks] = useState<string | undefined>();
  const [avisoDoPix, setAvisoDoPix] = useState<string | undefined>();

  const sair = useCallback(() => {
    sessaoDoSuporte.limpar();
    router.replace(ENTRAR);
  }, [router]);

  // A guarda no efeito, e nada renderiza antes das listas chegarem: o
  // mesmo desenho do SessaoDoPainel. A sessão do painel não abre esta
  // tela — o token do barbeiro dá 401 nas rotas do suporte. Cada lista
  // vem por conta própria: uma falhando não esconde a outra.
  useEffect(() => {
    if (!sessaoDoSuporte.ler()) {
      router.replace(ENTRAR);
      return;
    }

    let vivo = true;
    void Promise.allSettled([api.solicitacoes(), api.pixNaFila()]).then(([doLink, doPix]) => {
      if (!vivo) return;
      if (
        (doLink.status === "rejected" && ehNaoAutenticado(doLink.reason)) ||
        (doPix.status === "rejected" && ehNaoAutenticado(doPix.reason))
      ) {
        sair();
        return;
      }
      if (doLink.status === "fulfilled") {
        setLinks(doLink.value);
      } else {
        setLinks([]);
        setAvisoDosLinks(
          (doLink.reason as ErroDaApi).mensagem || "Não foi possível carregar os pedidos de troca de link agora."
        );
      }
      if (doPix.status === "fulfilled") {
        setPix(doPix.value);
      } else {
        setPix([]);
        setAvisoDoPix("Não foi possível carregar os Pix agora.");
      }
    });

    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  const tirarDaFila = useCallback((id: string) => {
    setLinks((atual) => atual?.filter((pedido) => pedido.id !== id) ?? null);
  }, []);

  const tirarOPix = useCallback((id: string) => {
    setPix((atual) => atual?.filter((pagamento) => pagamento.id !== id) ?? null);
  }, []);

  const decidiuOPix = useCallback((id: string) => {
    setPixDecididos((atual) => new Set(atual).add(id));
  }, []);

  const carregou = links !== null && pix !== null;
  const abertos = carregou ? pix.filter((p) => !pixDecididos.has(p.id)).length + links.length : undefined;
  const vazia = carregou && links.length === 0 && pix.length === 0 && !avisoDosLinks && !avisoDoPix;

  return (
    <CascaDoSuporte aoSair={sair} abertos={abertos}>
      <main className={estilos.pagina}>
        <CabecalhoDaPagina
          titulo="Pedidos"
          apoio="Pix: procure no extrato do BarChop o valor exato, perto da hora do Já paguei; o plano já vale desde então. Troca de link: aprovar troca o link na hora, e o antigo continua levando à barbearia."
        />
        {avisoDoPix ? <Aviso>{avisoDoPix}</Aviso> : null}
        {avisoDosLinks ? <Aviso>{avisoDosLinks}</Aviso> : null}
        {!carregou ? null : vazia ? (
          <p>Nenhum pedido aguardando.</p>
        ) : (
          <ol className={estilos.lista}>
            {pix.map((pagamento) => (
              <li key={pagamento.id}>
                <PixParaConferir
                  pagamento={pagamento}
                  api={api}
                  aoSair={sair}
                  aoDecidir={decidiuOPix}
                  aoSumir={tirarOPix}
                />
              </li>
            ))}
            {links.map((pedido) => (
              <li key={pedido.id}>
                <PedidoNaFila pedido={pedido} api={api} aoSair={sair} aoDecidir={tirarDaFila} />
              </li>
            ))}
          </ol>
        )}
      </main>
    </CascaDoSuporte>
  );
}

type EtapaDoPix = "decidindo" | "recusando" | "confirmado" | "recusado";

function PixParaConferir({
  pagamento,
  api,
  aoSair,
  aoDecidir,
  aoSumir,
}: {
  pagamento: PixNaFila;
  api: ApiDoSuporte;
  aoSair: () => void;
  aoDecidir: (id: string) => void;
  aoSumir: (id: string) => void;
}) {
  const idDaResposta = useId();
  const valor = formatarReais(pagamento.valorCentavos);
  const antes = antesDoPix(pagamento.antes);
  const nome = pagamento.barbearia.nome;
  const [etapa, setEtapa] = useState<EtapaDoPix>("decidindo");
  // A resposta já vem escrita, pra o caso comum; o Suporte ajusta.
  const [resposta, setResposta] = useState(
    `Não achamos um Pix de ${valor} no dia ${diaEMes(pagamento.criadoEm)}. Se você pagou, fale com a gente pela Central de ajuda com o horário do Pix.`
  );
  const [erroResposta, setErroResposta] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);
  const resultado = useRef<HTMLParagraphElement>(null);

  // Os botões somem com a decisão: o foco vai pro resultado, pra não
  // cair no começo da página.
  useEffect(() => {
    if (etapa === "confirmado" || etapa === "recusado") resultado.current?.focus();
  }, [etapa]);

  async function decidir(chamada: () => Promise<unknown>, depois: "confirmado" | "recusado") {
    setAviso(undefined);
    setEnviando(true);
    try {
      await chamada();
      setEtapa(depois);
      aoDecidir(pagamento.id);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.status === 401) {
        aoSair();
      } else if (erro.codigo === "pix_decidido" || erro.status === 404) {
        // Outro operador decidiu, ou o dono tocou "Ainda não paguei".
        aoSumir(pagamento.id);
      } else {
        setAviso(erro.mensagem || "Não foi possível decidir agora.");
      }
    } finally {
      setEnviando(false);
    }
  }

  function recusar() {
    setErroResposta(undefined);
    const texto = resposta.trim();
    if (!texto) {
      setErroResposta("Escreva a resposta pro dono: é o que ele lê em Faturas.");
      return;
    }
    void decidir(() => api.recusarPix(pagamento.id, texto), "recusado");
  }

  const dono = pagamento.dono
    ? [pagamento.dono.nome, pagamento.dono.email].filter(Boolean).join(" · ")
    : "Sem dono ativo";

  return (
    <article className={estilos.pedido} aria-label={`Pix da ${nome}`}>
      <div className={estilos.topoComSelo}>
        <div className={estilos.topo}>
          <h2 className={estilos.titulo}>{nome}</h2>
          <p className={estilos.apoio}>Já paguei em {FORMATADOR.format(new Date(pagamento.criadoEm))}</p>
        </div>
        <Chip tom="neutro" tamanho="pequeno">
          Pix
        </Chip>
      </div>

      <div className={estilos.extrato}>
        <span className={estilos.rotulo}>Procure no extrato</span>
        <span className={estilos.valor}>{valor}</span>
        <span className={estilos.identificador}>identificador {pagamento.identificador}</span>
      </div>

      <dl className={estilos.dados}>
        <dt>Plano</dt>
        <dd>
          {nomeComCiclo(pagamento.plano, pagamento.ciclo)} · {profissionais(pagamento.profissionais)}
        </dd>
        <dt>Vale</dt>
        <dd>{pontasDoPeriodo(pagamento.periodoComecaEm, pagamento.periodoTerminaEm).join(" a ")}</dd>
        <dt>Antes</dt>
        <dd>{antes.rotulo}</dd>
        <dt>Dono</dt>
        <dd>{dono}</dd>
      </dl>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {etapa === "decidindo" ? (
        <div className={estilos.decisao}>
          <Botao
            onClick={() => void decidir(() => api.confirmarPix(pagamento.id), "confirmado")}
            carregando={enviando}
          >
            Achei o Pix
          </Botao>
          <Botao variante="contorno" onClick={() => setEtapa("recusando")} disabled={enviando}>
            Não achei
          </Botao>
        </div>
      ) : null}

      {etapa === "recusando" ? (
        <div className={estilos.recusa}>
          <label className={estilos.rotuloDaResposta} htmlFor={idDaResposta}>
            Resposta pro dono
          </label>
          <span className={estilos.apoio} id={`${idDaResposta}-apoio`}>
            Ele lê em Faturas. {antes.naRecusa}
          </span>
          <textarea
            id={idDaResposta}
            className={estilos.area}
            rows={4}
            maxLength={RESPOSTA_MAX}
            aria-invalid={erroResposta ? "true" : undefined}
            aria-describedby={
              erroResposta ? `${idDaResposta}-apoio ${idDaResposta}-erro` : `${idDaResposta}-apoio`
            }
            value={resposta}
            onChange={(evento) => setResposta(evento.target.value)}
          />
          {erroResposta ? (
            <span className={estilos.erro} id={`${idDaResposta}-erro`}>
              {erroResposta}
            </span>
          ) : null}
          <div className={`${estilos.decisao} ${estilos.decisaoDaRecusa}`}>
            <Botao onClick={recusar} carregando={enviando}>
              Confirmar recusa
            </Botao>
            <Botao variante="fantasma" onClick={() => setEtapa("decidindo")} disabled={enviando}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : null}

      {etapa === "confirmado" || etapa === "recusado" ? (
        <p
          ref={resultado}
          tabIndex={-1}
          role="status"
          className={`${estilos.resultado} ${etapa === "confirmado" ? estilos.confirmado : estilos.recusado}`}
        >
          {etapa === "confirmado" ? (
            <>
              <strong>Pix confirmado.</strong> O &quot;Aguardando conferência&quot; sai de Faturas da {nome}; o{" "}
              {PLANOS[pagamento.plano].nome} segue até{" "}
              {pontasDoPeriodo(pagamento.periodoComecaEm, pagamento.periodoTerminaEm)[1]}.
            </>
          ) : (
            <>
              <strong>Pix recusado.</strong> {antes.depoisDaRecusa} A resposta aparece em Faturas da {nome}.
            </>
          )}
        </p>
      ) : null}
    </article>
  );
}

function PedidoNaFila({
  pedido,
  api,
  aoSair,
  aoDecidir,
}: {
  pedido: SolicitacaoNaFila;
  api: ApiDoSuporte;
  aoSair: () => void;
  aoDecidir: (id: string) => void;
}) {
  const idDaResposta = useId();
  const [recusando, setRecusando] = useState(false);
  const [resposta, setResposta] = useState("");
  const [erroResposta, setErroResposta] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  async function decidir(chamada: () => Promise<unknown>) {
    setAviso(undefined);
    setEnviando(true);
    try {
      await chamada();
      aoDecidir(pedido.id);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.status === 401) {
        aoSair();
      } else if (erro.codigo === "conflito") {
        // A API desfez tudo e o pedido segue pendente: o nome foi pra
        // outra barbearia depois do pedido.
        setAviso(
          "Esse link já está em uso por outra barbearia: foi tomado depois do pedido. Recuse com uma resposta pro dono.",
        );
        setRecusando(true);
      } else if (erro.codigo === "solicitacao_decidida" || erro.status === 404) {
        // Outro operador decidiu, ou o dono cancelou: não está mais na fila.
        aoDecidir(pedido.id);
      } else {
        setAviso(erro.mensagem || "Não foi possível decidir agora.");
      }
    } finally {
      setEnviando(false);
    }
  }

  function recusar() {
    setErroResposta(undefined);
    const texto = resposta.trim();
    if (!texto) {
      setErroResposta("Escreva a resposta pro dono: é o que ele lê em Configurações.");
      return;
    }
    void decidir(() => api.recusar(pedido.id, texto));
  }

  return (
    <article className={estilos.pedido} aria-label={`Pedido da ${pedido.barbearia.nome}`}>
      <div className={estilos.topo}>
        <h2 className={estilos.titulo}>{pedido.barbearia.nome}</h2>
        <p className={estilos.apoio}>Pedido em {FORMATADOR.format(new Date(pedido.criadoEm))}</p>
      </div>
      {/* O link de hoje e o pedido num bloco só, com rótulo (onda C). */}
      <dl className={estilos.links}>
        <dt>Hoje</dt>
        <dd>{pedido.barbearia.slug}</dd>
        <dt>Pedido</dt>
        <dd className={estilos.pedidoNovo}>{pedido.slugPedido}</dd>
      </dl>
      <div className={estilos.motivo}>
        <span className={estilos.rotulo}>Motivo</span>
        <p>{pedido.motivo ?? "Sem motivo informado."}</p>
      </div>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {recusando ? (
        <div className={estilos.recusa}>
          <label className={estilos.rotuloDaResposta} htmlFor={idDaResposta}>
            Resposta pro dono
          </label>
          <span className={estilos.apoio} id={`${idDaResposta}-apoio`}>
            É o que ele lê em Configurações.
          </span>
          <textarea
            id={idDaResposta}
            className={estilos.area}
            rows={3}
            maxLength={RESPOSTA_MAX}
            aria-invalid={erroResposta ? "true" : undefined}
            aria-describedby={
              erroResposta ? `${idDaResposta}-apoio ${idDaResposta}-erro` : `${idDaResposta}-apoio`
            }
            value={resposta}
            onChange={(evento) => setResposta(evento.target.value)}
          />
          {erroResposta ? (
            <span className={estilos.erro} id={`${idDaResposta}-erro`}>
              {erroResposta}
            </span>
          ) : null}
          <div className={`${estilos.decisao} ${estilos.decisaoDaRecusa}`}>
            <Botao onClick={recusar} carregando={enviando}>
              Confirmar recusa
            </Botao>
            <Botao variante="fantasma" onClick={() => setRecusando(false)} disabled={enviando}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : (
        <div className={estilos.decisao}>
          <Botao onClick={() => void decidir(() => api.aprovar(pedido.id))} carregando={enviando}>
            Aprovar
          </Botao>
          <Botao variante="contorno" onClick={() => setRecusando(true)} disabled={enviando}>
            Recusar
          </Botao>
        </div>
      )}
    </article>
  );
}
