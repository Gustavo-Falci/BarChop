"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { SolicitacaoNaFila } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { useApiDoSuporte, type ApiDoSuporte } from "../../suporte/ProvedorDoSuporte";
import { sessaoDoSuporte } from "../../sessao/armazenamento";
import estilos from "./FilaDoSuporte.module.css";

const ENTRAR = "/painel/suporte/entrar";

// O mesmo limite do schema de POST /suporte/solicitacoes/:id/recusar.
const RESPOSTA_MAX = 500;

// O instante do pedido no fuso das barbearias: o suporte compara com o
// que o dono diz ("pedi ontem à noite").
const FORMATADOR = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

// A fila de pedidos de troca do link (Onda 1, F4d). Fora do (guardado)
// do painel: a sessão aqui é a do suporte, que não tem barbearia.
export function FilaDoSuporte() {
  const router = useRouter();
  const api = useApiDoSuporte();
  const [fila, setFila] = useState<SolicitacaoNaFila[] | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();

  const sair = useCallback(() => {
    sessaoDoSuporte.limpar();
    router.replace(ENTRAR);
  }, [router]);

  // A guarda no efeito, e nada renderiza antes da fila chegar: o mesmo
  // desenho do SessaoDoPainel. A sessão do painel não abre esta tela —
  // o token do barbeiro dá 401 nas rotas do suporte.
  useEffect(() => {
    if (!sessaoDoSuporte.ler()) {
      router.replace(ENTRAR);
      return;
    }

    let vivo = true;
    api
      .solicitacoes()
      .then((pendentes) => {
        if (vivo) setFila(pendentes);
      })
      .catch((causa) => {
        if (!vivo) return;
        const erro = causa as ErroDaApi;
        if (erro.status === 401) {
          sair();
          return;
        }
        setAviso(erro.mensagem || "Não foi possível carregar os pedidos agora.");
      });

    return () => {
      vivo = false;
    };
  }, [api, router, sair]);

  const tirarDaFila = useCallback((id: string) => {
    setFila((atual) => atual?.filter((pedido) => pedido.id !== id) ?? null);
  }, []);

  return (
    <main className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Pedidos de troca de link"
        apoio="Aprovar troca o link na hora; o antigo continua levando à barbearia. Recusar pede uma resposta, que o dono lê em Configurações."
        acao={
          <Botao variante="fantasma" onClick={sair}>
            Sair
          </Botao>
        }
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {fila === null ? null : fila.length === 0 ? (
        <p>Nenhum pedido aguardando.</p>
      ) : (
        <ol className={estilos.lista}>
          {fila.map((pedido) => (
            <li key={pedido.id}>
              <PedidoNaFila
                pedido={pedido}
                api={api}
                aoSair={sair}
                aoDecidir={tirarDaFila}
              />
            </li>
          ))}
        </ol>
      )}
    </main>
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
      <h2 className={estilos.titulo}>{pedido.barbearia.nome}</h2>
      <p className={estilos.troca}>
        <code>{pedido.barbearia.slug}</code>
        <span aria-label="para"> → </span>
        <code>{pedido.slugPedido}</code>
      </p>
      <p>{pedido.motivo ? `Motivo: ${pedido.motivo}` : "Sem motivo informado."}</p>
      <p className={estilos.apoio}>Pedido em {FORMATADOR.format(new Date(pedido.criadoEm))}</p>

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {recusando ? (
        <div className={estilos.recusa}>
          <label className={estilos.rotulo} htmlFor={idDaResposta}>
            Resposta pro dono
          </label>
          <textarea
            id={idDaResposta}
            className={estilos.area}
            rows={3}
            maxLength={RESPOSTA_MAX}
            aria-invalid={erroResposta ? "true" : undefined}
            aria-describedby={erroResposta ? `${idDaResposta}-erro` : undefined}
            value={resposta}
            onChange={(evento) => setResposta(evento.target.value)}
          />
          {erroResposta ? (
            <span className={estilos.erro} id={`${idDaResposta}-erro`}>
              {erroResposta}
            </span>
          ) : null}
          <div className={estilos.acoes}>
            <Botao onClick={recusar} carregando={enviando}>
              Confirmar recusa
            </Botao>
            <Botao variante="fantasma" onClick={() => setRecusando(false)} disabled={enviando}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : (
        <div className={estilos.acoes}>
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
