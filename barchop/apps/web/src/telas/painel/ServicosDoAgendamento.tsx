"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { AgendamentoComCliente, PreviaDaMudanca, ProximoCompromisso, ServicoSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao, BotaoLink } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Carregando } from "../../componentes/Carregando";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { ehPassado, formatarDataComSemana } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { depoisDaSaida } from "../../movimento/depoisDaSaida";
import { IconeCheck } from "../../painel/icones";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import estilos from "./ServicosDoAgendamento.module.css";

// Mudar os serviços de um agendamento (pedido do dono, 22/11/2026;
// canvas aprovado, página "servicos"; plano
// mudar-servicos-do-agendamento). Tirar o que sai, marcar o que entra; a
// barra de baixo diz o tempo, o total e se cabe na agenda, pela prévia da
// API (GET .../servicos/previa). O Salvar abre a confirmação: com tempo,
// "Confirma os adicionais?"; sem tempo, o aviso de que vira encaixe e o
// "tem certeza?". A conta do tempo é da API; a tela só repete a soma pra
// a barra não piscar enquanto a prévia chega.

// O que a API aceita (lib/servicos-do-agendamento.ts). Pago também não
// muda, mas isso a prévia diz (409 com_pagamento).
const STATUS_QUE_MUDAM = ["pendente", "confirmado", "concluido"];

function emMinutos(hora: string): number {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));
}

function centavos(preco: string): number {
  return Math.round(Number(preco) * 100);
}

function emReais(totalEmCentavos: number): string {
  return formatarPreco((totalEmCentavos / 100).toFixed(2));
}

function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

function maiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// O que vem depois do limite, no fim de "só tem tempo até as 09:40, ...".
// Sem nada depois e o limite no próprio fim do horário, o dia está
// fechado ou o horário já passa do expediente: não há "quando acaba".
function depoisDoLimite(proximo: ProximoCompromisso, limite: string, horaFimAtual: string): string {
  switch (proximo.tipo) {
    case "atendimento":
      return `quando começa ${proximo.cliente}`;
    case "pausa":
      return "quando começa a pausa";
    case "bloqueio":
      return "quando começa um bloqueio";
    default:
      return emMinutos(limite) > emMinutos(horaFimAtual) ? "quando acaba o expediente" : "fora do expediente";
  }
}

export function ServicosDoAgendamento() {
  const { id } = useParams<{ id: string }>();
  const api = useApiDoPainel();
  const agendamento = useRequisicao(() => api.barbeiro.agendamento(id), [id]);
  const catalogo = useRequisicao(() => api.barbeiro.servicos(), []);
  const barbeiroId = agendamento.dados?.barbeiro.id;
  const feitos = useRequisicao(
    () => (barbeiroId ? api.barbeiro.servicosDoMembro(barbeiroId) : Promise.resolve(null)),
    [barbeiroId]
  );

  if (agendamento.erro) {
    return (
      <Aviso>
        {agendamento.erro.codigo === "nao_encontrado" ? "Agendamento não encontrado." : agendamento.erro.mensagem}
      </Aviso>
    );
  }
  if (!agendamento.dados || !catalogo.dados || !feitos.dados) return <Carregando />;

  return <Edicao agendamento={agendamento.dados} catalogo={catalogo.dados} feitos={feitos.dados} />;
}

function Edicao({
  agendamento,
  catalogo,
  feitos,
}: {
  agendamento: AgendamentoComCliente;
  catalogo: ServicoSerializado[];
  feitos: string[];
}) {
  const api = useApiDoPainel();
  const router = useRouter();
  const { perfil } = usePainel();
  const idDaTela = useId();
  const { id } = agendamento;
  const voltar = `/painel/agendamentos/${id}`;

  // O que sai, pelo id do serviço; o que entra, na ordem em que foi
  // marcado (é a ordem do e-mail e da tela).
  const [tirados, setTirados] = useState<string[]>([]);
  const [novos, setNovos] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);

  const ficam = agendamento.servicos.filter((servico) => !tirados.includes(servico.servicoId));
  const lista = [...ficam.map((servico) => servico.servicoId), ...novos];
  const chave = lista.join(",");
  const mudou = tirados.length > 0 || novos.length > 0;

  // A prévia da lista de agora. A resposta leva a chave junto: a de uma
  // lista velha (o barbeiro marcou outro no meio) não vale pra esta.
  const previa = useRequisicao(
    () =>
      mudou
        ? api.barbeiro.previaDosServicos(id, lista).then((dados) => ({ chave, dados }))
        : Promise.resolve(null),
    [id, chave]
  );
  const previaDaLista: PreviaDaMudanca | null = previa.dados?.chave === chave ? previa.dados.dados : null;
  const previaPronta = mudou && !previa.carregando && !previa.erro ? previaDaLista : null;

  const proprio = perfil.id === agendamento.barbeiro.id;
  const nomeDoBarbeiro = primeiroNome(agendamento.barbeiro.nome);

  // Fora do que a API aceita: a tela diz por quê e leva de volta, em vez
  // de deixar marcar tudo pra recusar no fim.
  const passou = ehPassado(agendamento.data);
  if (passou || !STATUS_QUE_MUDAM.includes(agendamento.status)) {
    const motivo = passou ? "o dia já passou" : `ele está ${rotuloDoStatus(agendamento.status).toLowerCase()}`;
    return (
      <div className={estilos.pagina}>
        <CabecalhoDaPagina titulo="Serviços" voltar={{ href: voltar, rotulo: "Agendamento" }} />
        <Aviso tom="atencao">{`Não dá pra mudar os serviços deste atendimento: ${motivo}.`}</Aviso>
        <BotaoLink href={voltar} variante="contorno">
          Voltar pro agendamento
        </BotaoLink>
      </div>
    );
  }

  const inicio = emMinutos(agendamento.horaInicio);
  const duracaoAtual = emMinutos(agendamento.horaFim) - inicio;
  const entram = novos.map((sid) => catalogo.find((servico) => servico.id === sid)!).filter(Boolean);
  // A mesma conta da API (duracaoDaMudanca), pra barra não esperar a
  // prévia: o encaixe soma os novos à duração real.
  const somaQueFica = ficam.reduce((soma, servico) => soma + servico.duracaoNoMomento, 0);
  const somaNova = entram.reduce((soma, servico) => soma + servico.duracaoMinutos, 0);
  const previsto = Math.min(duracaoAtual, somaQueFica) + somaNova;
  const totalAntes = agendamento.servicos.reduce((soma, servico) => soma + centavos(servico.precoNoMomento), 0);
  const totalDepois =
    ficam.reduce((soma, servico) => soma + centavos(servico.precoNoMomento), 0) +
    entram.reduce((soma, servico) => soma + centavos(servico.preco), 0);

  const naAgenda = agendamento.servicos.map((servico) => servico.servicoId);
  const paraAdicionar = catalogo.filter(
    (servico) => servico.ativo && feitos.includes(servico.id) && !naAgenda.includes(servico.id)
  );
  const soUm = lista.length === 1;

  function alternarTirado(servicoId: string) {
    const tirado = tirados.includes(servicoId);
    // O último que fica não sai: sem serviço nenhum o atendimento não
    // existe (a API recusa a lista vazia).
    if (!tirado && soUm) return;
    setTirados(tirado ? tirados.filter((sid) => sid !== servicoId) : [...tirados, servicoId]);
  }

  function alternarNovo(servicoId: string) {
    const marcado = novos.includes(servicoId);
    if (marcado && soUm) return;
    setNovos(marcado ? novos.filter((sid) => sid !== servicoId) : [...novos, servicoId]);
  }

  const apoioDaBarra = !mudou
    ? "Marque o que entra ou tire o que sai."
    : previa.erro
      ? null
      : !previaPronta
        ? "Conferindo a agenda…"
        : previaPronta.cabe
          ? `Era ${duracaoAtual} min · ${emReais(totalAntes)} · termina às ${previaPronta.horaFim}`
          : `Passa das ${previaPronta.limite}, ${depoisDoLimite(previaPronta.proximo, previaPronta.limite, agendamento.horaFim)}: vira encaixe`;

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo="Serviços"
        voltar={{ href: voltar, rotulo: "Agendamento" }}
        apoio={`${agendamento.cliente.nome} · ${maiuscula(formatarDataComSemana(agendamento.data))}, ${agendamento.horaInicio}–${agendamento.horaFim} · com ${agendamento.barbeiro.nome}`}
      />

      <section className={estilos.grupo} aria-labelledby={`${idDaTela}-no`}>
        <h2 id={`${idDaTela}-no`} className={estilos.tituloDoGrupo}>
          No atendimento
        </h2>
        <ul className={estilos.cartao}>
          {agendamento.servicos.map((servico) => {
            const tirado = tirados.includes(servico.servicoId);
            const travado = !tirado && soUm;
            return (
              <li key={servico.servicoId} className={estilos.linha}>
                <span className={estilos.texto}>
                  <span className={tirado ? estilos.nomeTirado : estilos.nome}>{servico.nome}</span>
                  <span className={estilos.apoio}>
                    {tirado
                      ? "Sai do atendimento"
                      : `${servico.duracaoNoMomento} min · ${formatarPreco(servico.precoNoMomento)}`}
                  </span>
                </span>
                {/* aria-disabled, e não disabled: o botão travado segue
                    no Tab, e a frase de baixo diz por quê. */}
                <button
                  type="button"
                  className={tirado ? estilos.desfazer : estilos.tirar}
                  aria-label={tirado ? `Desfazer: manter ${servico.nome}` : `Tirar ${servico.nome}`}
                  aria-disabled={travado || undefined}
                  onClick={() => alternarTirado(servico.servicoId)}
                >
                  {tirado ? "Desfazer" : "Tirar"}
                </button>
              </li>
            );
          })}
        </ul>
        {soUm && tirados.length === 0 && novos.length === 0 ? (
          <p className={estilos.nota}>Fica pelo menos um serviço. Pra trocar o último, adicione o outro antes.</p>
        ) : null}
      </section>

      <section className={estilos.grupo} aria-labelledby={`${idDaTela}-adicionar`}>
        <div className={estilos.cabecaDoGrupo}>
          <h2 id={`${idDaTela}-adicionar`} className={estilos.tituloDoGrupo}>
            Adicionar
          </h2>
          <span className={estilos.apoio}>
            Os que {nomeDoBarbeiro} faz. O que já está no atendimento não aparece aqui.
          </span>
        </div>
        {paraAdicionar.length === 0 ? (
          <p className={estilos.nota}>Não há outro serviço que {nomeDoBarbeiro} faça.</p>
        ) : (
          <div className={estilos.cartao} role="group" aria-labelledby={`${idDaTela}-adicionar`}>
            {paraAdicionar.map((servico) => {
              const marcado = novos.includes(servico.id);
              return (
                <button
                  key={servico.id}
                  type="button"
                  role="checkbox"
                  aria-checked={marcado}
                  className={estilos.opcao}
                  data-marcado={marcado || undefined}
                  onClick={() => alternarNovo(servico.id)}
                >
                  <span className={estilos.caixa} aria-hidden="true">
                    {marcado ? <IconeCheck width={14} height={14} /> : null}
                  </span>
                  <span className={estilos.texto}>
                    <span className={estilos.nome}>{servico.nome}</span>
                    <span className={estilos.apoio}>{servico.duracaoMinutos} min</span>
                  </span>
                  <span className={estilos.preco}>{formatarPreco(servico.preco)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className={estilos.barra} aria-label="Ação principal">
        <p className={estilos.resumo} aria-live="polite">
          <span className={estilos.totalDaBarra}>
            {previsto} min · {emReais(totalDepois)}
          </span>
          {apoioDaBarra ? (
            <span className={previaPronta && !previaPronta.cabe ? estilos.apoioAtencao : estilos.apoio}>
              {apoioDaBarra}
            </span>
          ) : null}
        </p>
        {previa.erro ? (
          <p className={estilos.erro} role="alert">
            {previa.erro.mensagem || "Não foi possível conferir a agenda agora."}
          </p>
        ) : null}
        <Botao type="button" disabled={!previaPronta} onClick={() => setConfirmando(true)}>
          Salvar
        </Botao>
      </section>

      {confirmando && previaDaLista ? (
        <JanelaDaMudanca
          agendamento={agendamento}
          previa={previaDaLista}
          conferindo={previa.carregando}
          proprio={proprio}
          nomeDoBarbeiro={nomeDoBarbeiro}
          duracaoAtual={duracaoAtual}
          aoSalvar={async (avisarCliente) => {
            await api.barbeiro.mudarServicos(id, {
              servicoIds: lista,
              aceitaSemTempo: !previaDaLista.cabe,
              avisarCliente,
            });
            router.replace(`${voltar}?servicos=salvos${avisarCliente ? "&avisado=1" : ""}`);
          }}
          aoMudarAAgenda={previa.recarregar}
          aoFechar={() => setConfirmando(false)}
        />
      ) : null}
    </div>
  );
}

function JanelaDaMudanca({
  agendamento,
  previa,
  conferindo,
  proprio,
  nomeDoBarbeiro,
  duracaoAtual,
  aoSalvar,
  aoMudarAAgenda,
  aoFechar,
}: {
  agendamento: AgendamentoComCliente;
  previa: PreviaDaMudanca;
  // A prévia está sendo refeita (depois de um 409 sem_tempo).
  conferindo: boolean;
  proprio: boolean;
  nomeDoBarbeiro: string;
  duracaoAtual: number;
  aoSalvar: (avisarCliente: boolean) => Promise<void>;
  aoMudarAAgenda: () => void;
  aoFechar: () => void;
}) {
  const janela = useRef<HTMLDialogElement>(null);
  const titulo = useId();
  const temEmail = Boolean(agendamento.cliente.email);
  const nomeDoCliente = primeiroNome(agendamento.cliente.nome);
  const [avisar, setAvisar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    janela.current?.showModal();
  }, []);

  const soTira = previa.entram.length === 0;
  const soAdiciona = previa.saem.length === 0;
  const tituloDaJanela = soTira ? "Tirar do atendimento?" : soAdiciona ? "Confirma os adicionais?" : "Confirma a mudança?";
  const sobra = duracaoAtual - (emMinutos(previa.horaFim) - emMinutos(agendamento.horaInicio));
  const agenda = proprio ? "sua agenda" : `agenda de ${nomeDoBarbeiro}`;

  async function confirmar() {
    setEnviando(true);
    setErro(null);
    try {
      await aoSalvar(temEmail && avisar);
    } catch (causa) {
      const falha = causa as ErroDaApi;
      if (falha.codigo === "sem_tempo") {
        // A agenda mudou com a janela aberta (outro cliente marcou logo
        // depois): refaz a prévia, e a janela pergunta de novo.
        aoMudarAAgenda();
        setErro("A agenda mudou enquanto a janela estava aberta. Confira de novo.");
      } else {
        setErro(falha.mensagem || "Não foi possível salvar agora.");
      }
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
      <h2 id={titulo} className={estilos.tituloDaJanela}>
        {tituloDaJanela}
      </h2>

      <ul className={estilos.mudancas}>
        {previa.saem.map((servico) => (
          <li key={servico.servicoId} className={estilos.mudanca}>
            <span className={estilos.sinalSai} aria-hidden="true">
              −
            </span>
            <span className={estilos.texto}>
              <span className={estilos.nome}>Tirar {servico.nome}</span>
              <span className={estilos.apoio}>{servico.duracaoMinutos} min</span>
            </span>
            <span className={estilos.preco}>− {formatarPreco(servico.preco)}</span>
          </li>
        ))}
        {previa.entram.map((servico) => (
          <li key={servico.servicoId} className={estilos.mudanca}>
            <span className={estilos.sinalEntra} aria-hidden="true">
              +
            </span>
            <span className={estilos.texto}>
              <span className={estilos.nome}>{servico.nome}</span>
              <span className={estilos.apoio}>{servico.duracaoMinutos} min</span>
            </span>
            <span className={estilos.preco}>+ {formatarPreco(servico.preco)}</span>
          </li>
        ))}
      </ul>

      {previa.cabe ? (
        <p className={estilos.apoio}>
          {`Termina às ${previa.horaFim}.`}
          {sobra > 0 ? ` Os ${sobra} min que sobram ficam livres na agenda.` : ` Cabe na ${agenda}.`}
        </p>
      ) : (
        <div className={estilos.semTempo}>
          <Aviso tom="atencao">
            {`O tempo previsto pra concluir os serviços é de ${previa.previstoMinutos} min (até ${previa.terminaPrevisto}), e na ${agenda} só tem tempo até as ${previa.limite}, ${depoisDoLimite(previa.proximo, previa.limite, agendamento.horaFim)}. Tem certeza?`}
          </Aviso>
          <p className={estilos.apoio}>
            {`Na agenda ele fica como encaixe, das ${agendamento.horaInicio} às ${previa.horaFim}. O cliente paga os serviços inteiros.`}
          </p>
        </div>
      )}

      <p className={estilos.totalDaJanela}>
        <span>Total</span>
        <span>
          {formatarPreco(previa.totalDepois)}
          {previa.totalDepois !== previa.totalAntes ? ` (era ${formatarPreco(previa.totalAntes)})` : ""}
        </span>
      </p>

      {temEmail ? (
        <label className={estilos.avisar}>
          <input type="checkbox" checked={avisar} onChange={(evento) => setAvisar(evento.target.checked)} />
          Avisar {nomeDoCliente} por e-mail
        </label>
      ) : (
        <p className={estilos.apoio}>O cliente não tem e-mail: avise você pelo telefone.</p>
      )}

      {erro ? <Aviso>{erro}</Aviso> : null}

      <div className={estilos.botoes}>
        <Botao type="button" onClick={() => void confirmar()} carregando={enviando} disabled={conferindo}>
          {previa.cabe ? "Confirmar" : "Sim, adicionar mesmo assim"}
        </Botao>
        <Botao type="button" variante="contorno" onClick={() => janela.current?.close()}>
          Voltar
        </Botao>
      </div>
    </dialog>
  );
}
