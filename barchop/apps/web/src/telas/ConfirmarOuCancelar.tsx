"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { AgendamentoDoLembrete } from "@barchop/types";
import { ErroDaApi } from "@barchop/api-client";
import { useApi } from "../api/ProvedorDaApi";
import { useRequisicao } from "../api/useRequisicao";
import { Aviso } from "../componentes/Aviso";
import { BlocoDoDia } from "../componentes/BlocoDoDia";
import { Botao, BotaoLink } from "../componentes/Botao";
import { Chip } from "../componentes/Chip";
import { caminhoDoPasso } from "../fluxo/passos";
import { formatarDataComSemana } from "../formato/datas";
import { prazoAcabou } from "../formato/prazos";
import { useNoHost } from "../tenant/ProvedorDoHost";
import { AvisoDoPrazo, linkDoWhatsApp } from "./AvisoDoPrazo";
import estilos from "./ConfirmarOuCancelar.module.css";
import { Carregando } from "../componentes/Carregando";

// "Corte e Barba".
function emLista(nomes: string[]): string {
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : (nomes[0] ?? "");
}

// "Sábado, 10 de outubro".
function diaPorExtenso(data: string): string {
  const texto = formatarDataComSemana(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// O destino do link do horário (e-mail de lembrete, tela de sucesso do
// agendamento, WhatsApp do painel): confirmar presença ou
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
//
// Passado o prazo de cancelar da barbearia (painel v2, 3g), o Cancelar
// some e entra o contato da casa; confirmar presença não tem prazo.
// `agora` é prop com padrão pelo mesmo motivo da MinhaConta.
export function ConfirmarOuCancelar({ agora = new Date() }: { agora?: Date } = {}) {
  const { token } = useParams<{ slug: string; token: string }>();
  const api = useApi();
  const noHost = useNoHost();
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
        <p>Confira se o link chegou inteiro, ou fale direto com a barbearia.</p>
      </div>
    );
  }
  if (!lido.dados) return <div className={estilos.pagina}><Carregando /></div>;

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
  const podeCancelar = !prazoAcabou(
    agendamento.barbearia.prazoCancelarHoras,
    agendamento.data,
    agendamento.horaInicio,
    agora
  );

  const confirmado = ativo && agendamento.presencaConfirmadaEm !== null;
  // O aviso do prazo já traz o WhatsApp; o rodapé ficaria repetido.
  const avisoDoPrazo = ativo && !podeCancelar;
  const { whatsapp } = agendamento.barbearia;

  return (
    <div className={estilos.pagina}>
      <h1>Seu horário</h1>

      {/* O cartão da prancha da onda B: o dia num bloco, a data por
          extenso com o selo do estado, e o resto em linhas. Sem o "Onde"
          da prancha: o lembrete não traz o endereço (fora da onda). */}
      <section className={estilos.cartao} aria-label="O horário">
        <div className={estilos.topo}>
          <BlocoDoDia data={agendamento.data} soVisual />
          <div className={estilos.quando}>
            <p className={estilos.dataEHora}>
              {diaPorExtenso(agendamento.data)} às {agendamento.horaInicio}
            </p>
            {confirmado ? (
              <Chip tom="ok" tamanho="pequeno">
                Presença confirmada
              </Chip>
            ) : cancelado ? (
              <Chip tom="erro" tamanho="pequeno">
                Cancelado
              </Chip>
            ) : null}
          </div>
        </div>
        <dl className={estilos.linhas}>
          <div>
            <dt>Serviços</dt>
            <dd>{emLista(agendamento.servicos.map((s) => s.nome))}</dd>
          </div>
          <div>
            <dt>Profissional</dt>
            <dd>Com {agendamento.barbeiro.nome}</dd>
          </div>
          <div>
            <dt>Barbearia</dt>
            <dd>{agendamento.barbearia.nome}</dd>
          </div>
        </dl>
      </section>

      {cancelado ? (
        <div className={estilos.acoes}>
          <p className={estilos.estado}>Horário cancelado. Ele ficou livre pra outra pessoa.</p>
          {/* Pelo slug que veio com o token, e não o da URL: o dono pode
              ter trocado o link depois que o e-mail saiu. */}
          <BotaoLink href={noHost(caminhoDoPasso(agendamento.barbearia.slug, "servicos", { servicoIds: [] }))}>
            Marcar outro horário
          </BotaoLink>
        </div>
      ) : null}

      {ativo && cancelando && podeCancelar ? (
        <div className={estilos.certeza}>
          <p className={estilos.estado}>Cancelar o horário?</p>
          <p className={estilos.apoio}>Ele fica livre pra outra pessoa.</p>
          <Botao
            variante="contorno"
            carregando={enviando}
            onClick={() => agir(api.publico.cancelarPeloLembrete)}
          >
            Sim, cancelar
          </Botao>
          <Botao variante="fantasma" onClick={() => setCancelando(false)}>
            Voltar
          </Botao>
        </div>
      ) : null}

      {ativo && !cancelando ? (
        <div className={estilos.acoes}>
          {confirmado ? (
            <p className={estilos.estado}>Presença confirmada. Te esperamos!</p>
          ) : (
            <>
              <p className={estilos.apoio}>Vai conseguir vir? Confirme pra barbearia saber que você vem.</p>
              <Botao carregando={enviando} onClick={() => agir(api.publico.confirmarPresenca)}>
                Confirmar presença
              </Botao>
            </>
          )}
          {podeCancelar ? (
            <Botao variante="contorno" onClick={() => setCancelando(true)}>
              Cancelar horário
            </Botao>
          ) : null}
        </div>
      ) : null}

      {avisoDoPrazo ? (
        <AvisoDoPrazo
          acao="cancelar"
          whatsapp={whatsapp}
          telefone={agendamento.barbearia.telefone}
        />
      ) : null}

      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {whatsapp && !avisoDoPrazo ? (
        <p className={estilos.rodape}>
          Algum problema? Fale com a barbearia pelo <a href={linkDoWhatsApp(whatsapp)}>WhatsApp</a>.
        </p>
      ) : null}
    </div>
  );
}
