"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { AgendamentoDoLembrete } from "@barchop/types";
import { ErroDaApi } from "@barchop/api-client";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { Botao } from "../componentes/Botao";
import { formatarDataLonga } from "../formato/datas";
import estilos from "./ConfirmarOuCancelar.module.css";

// O destino do link do e-mail de lembrete: confirmar presença ou
// cancelar, sem login — quem autoriza é o token da URL.
//
// Só age no clique. Leitor de e-mail e antivírus abrem links sozinhos
// pra inspecionar; se abrir a página confirmasse, o cliente "confirmaria"
// sem ter lido o e-mail. Por isso o carregamento é só leitura (GET) e
// cada ação é um botão (POST).
//
// A tela se monta do que o token devolve — a barbearia vem junto —, e
// não de uma busca pelo slug da URL: o dono pode ter trocado o link da
// barbearia depois que o e-mail saiu.
export function ConfirmarOuCancelar() {
  const { token } = useParams<{ slug: string; token: string }>();
  const api = useApi();
  const lido = useRequisicao(() => api.publico.lembrete(token), [token]);

  // O que a última ação devolveu vale mais que a leitura inicial.
  const [atualizado, setAtualizado] = useState<AgendamentoDoLembrete | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | undefined>();
  const [vencido, setVencido] = useState(false);

  if (vencido || lido.erro?.status === 410) {
    return (
      <div className={estilos.pagina}>
        <h1>Esse link venceu</h1>
        <p>O horário já começou. Se precisar, fale direto com a barbearia.</p>
      </div>
    );
  }
  if (lido.erro) {
    return (
      <div className={estilos.pagina}>
        <h1>{lido.erro.status === 401 ? "Link inválido" : "Não encontramos esse horário"}</h1>
        <p>Confira se o link do e-mail chegou inteiro, ou fale direto com a barbearia.</p>
      </div>
    );
  }
  if (!lido.dados) return <p className={estilos.pagina}>Carregando…</p>;

  const agendamento = atualizado ?? lido.dados;

  async function agir(acao: (token: string) => Promise<AgendamentoDoLembrete>) {
    setAviso(undefined);
    setEnviando(true);
    try {
      setAtualizado(await acao(token));
      setCancelando(false);
    } catch (causa) {
      if (causa instanceof ErroDaApi && causa.status === 410) {
        setVencido(true);
      } else {
        setAviso(
          (causa instanceof ErroDaApi && causa.mensagem) || "Não foi possível agora. Tente de novo."
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  const cancelado = agendamento.status === "cancelado";
  const ativo = agendamento.status === "pendente" || agendamento.status === "confirmado";

  return (
    <div className={estilos.pagina}>
      <h1>Seu horário</h1>
      <section className={estilos.resumo} aria-label="O horário">
        <p className={estilos.barbearia}>{agendamento.barbearia.nome}</p>
        <p className={estilos.quando}>
          {formatarDataLonga(agendamento.data)} às {agendamento.horaInicio}
        </p>
        <p>
          Com {agendamento.barbeiro.nome} · {agendamento.servicos.map((s) => s.nome).join(" + ")}
        </p>
      </section>

      {cancelado ? (
        <p className={estilos.estado}>Horário cancelado. O horário ficou livre pra outra pessoa.</p>
      ) : null}

      {ativo && agendamento.presencaConfirmadaEm ? (
        <p className={estilos.estado}>Presença confirmada. Te esperamos!</p>
      ) : null}

      {ativo && cancelando ? (
        <div className={estilos.acoes}>
          <p>Tem certeza? O horário fica livre pra outra pessoa.</p>
          <Botao
            variante="contorno"
            carregando={enviando}
            onClick={() => agir(api.publico.cancelarPeloLembrete)}
          >
            Sim, cancelar
          </Botao>
          <Botao variante="contorno" onClick={() => setCancelando(false)}>
            Voltar
          </Botao>
        </div>
      ) : null}

      {ativo && !cancelando ? (
        <div className={estilos.acoes}>
          {agendamento.presencaConfirmadaEm ? null : (
            <Botao carregando={enviando} onClick={() => agir(api.publico.confirmarPresenca)}>
              Confirmar presença
            </Botao>
          )}
          <Botao variante="contorno" onClick={() => setCancelando(true)}>
            Cancelar horário
          </Botao>
        </div>
      ) : null}

      {aviso ? <Aviso>{aviso}</Aviso> : null}
    </div>
  );
}
