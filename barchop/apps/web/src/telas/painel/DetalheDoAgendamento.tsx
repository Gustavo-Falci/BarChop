"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EdicaoDoAgendamento, ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataComSemana } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { IconeCheck, IconeConversa } from "../../painel/icones";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoAgendamento.module.css";

type Status = "pendente" | "confirmado" | "concluido" | "cancelado" | "no_show";

// O caminho normal de um atendimento. Cancelado e falta saem dele — não
// são um quarto passo, são o caminho interrompido.
const CAMINHO: Status[] = ["pendente", "confirmado", "concluido"];

// O tom de cada status no selo do cabeçalho: dá pra ler a situação pela
// cor antes de ler a palavra.
const TOM_DO_STATUS: Record<string, "acento" | "neutro" | "ok" | "atencao" | "erro"> = {
  pendente: "atencao",
  confirmado: "acento",
  concluido: "ok",
  cancelado: "erro",
  no_show: "erro",
};

// A API aceita qualquer transição (o barbeiro é a autoridade sobre o
// próprio dia), mas a tela oferece só o que faz sentido a partir de
// cada estado, com verbo: "Confirmar", não "confirmado". Cinco botões
// iguais obrigavam a ler todos pra achar o próximo passo.
type Acao = { para: Status; rotulo: string; peso: "principal" | "secundaria" | "perigo" };
const ACOES: Record<string, Acao[]> = {
  pendente: [
    { para: "confirmado", rotulo: "Confirmar", peso: "principal" },
    { para: "concluido", rotulo: "Concluir", peso: "secundaria" },
    { para: "no_show", rotulo: "Marcar falta", peso: "secundaria" },
    { para: "cancelado", rotulo: "Cancelar agendamento", peso: "perigo" },
  ],
  confirmado: [
    { para: "concluido", rotulo: "Concluir atendimento", peso: "principal" },
    { para: "no_show", rotulo: "Marcar falta", peso: "secundaria" },
    { para: "cancelado", rotulo: "Cancelar agendamento", peso: "perigo" },
  ],
  concluido: [{ para: "confirmado", rotulo: "Reabrir", peso: "secundaria" }],
  // Reativar devolve o horário à agenda; se alguém já o pegou, a API
  // responde 409 e a mensagem dela aparece no aviso.
  cancelado: [{ para: "confirmado", rotulo: "Reativar agendamento", peso: "secundaria" }],
  no_show: [{ para: "confirmado", rotulo: "Desfazer falta", peso: "secundaria" }],
};

function maiuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function frase(status: string, presencaConfirmada: boolean): string {
  switch (status) {
    case "pendente":
      return "Ainda não combinado com o cliente.";
    case "confirmado":
      return presencaConfirmada
        ? "O cliente confirmou presença pelo link."
        : "Combinado com o cliente.";
    case "concluido":
      return "Atendimento feito.";
    case "cancelado":
      return "Cancelado — o horário ficou livre na agenda.";
    case "no_show":
      return "O cliente faltou sem avisar.";
    default:
      return "";
  }
}

export function DetalheDoAgendamento() {
  const { id } = useParams<{ id: string }>();
  const api = useApiDoPainel();
  const agendamento = useRequisicao(() => api.barbeiro.agendamento(id), [id]);
  const idDoCampo = useId();

  // O wa.me do "lembrar pelo WhatsApp", buscado já ao carregar: vira um
  // <a> de verdade. Buscar no clique e abrir com window.open depois do
  // await perde o gesto do usuário, e o navegador bloqueia a janela.
  // Só pra agendamento de pé — a API recusa os outros com 422.
  const status = agendamento.dados?.status;
  const lembravel = status === "pendente" || status === "confirmado";
  const whatsapp = useRequisicao(
    () => (lembravel ? api.barbeiro.lembreteWhatsApp(id) : Promise.resolve(null)),
    [id, lembravel]
  );

  const [observacoes, setObservacoes] = useState("");
  const [aviso, setAviso] = useState<string | undefined>();
  // Qual ação está no ar: o status de destino ou as observações. Um
  // booleano só travava tudo junto, e não dava pra saber qual clique
  // estava sendo salvo.
  const [salvando, setSalvando] = useState<string | null>(null);
  const [observacoesSalvas, setObservacoesSalvas] = useState(false);
  // Cancelar libera o horário pra outro cliente: pede um segundo clique,
  // ali mesmo, em vez de um modal.
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);

  // Sincronizado durante a renderização, e não num `useEffect`: mesmo
  // mecanismo do fix em ConfiguracoesDaBarbearia (181514d). A trava
  // `!agendamento.dados` mais abaixo olha se os dados chegaram, não se
  // `observacoes` já foi sincronizado com eles — entre o commit que abre
  // o formulário e o efeito que preencheria o campo, digitar aí corre
  // contra o preenchimento. O `!==` contra o rastreador evita o loop e
  // também é o que faz `agendamento.recarregar()` — chamado depois de
  // toda ação em `aplicar()`, inclusive "Salvar observações" — sincronizar
  // de novo: a resposta fresca do GET não é `===` à anterior.
  const [agendamentoSincronizado, setAgendamentoSincronizado] = useState<typeof agendamento.dados>(
    null
  );
  if (agendamento.dados && agendamento.dados !== agendamentoSincronizado) {
    setAgendamentoSincronizado(agendamento.dados);
    setObservacoes(agendamento.dados.observacoes ?? "");
  }

  if (agendamento.erro) {
    return (
      <Aviso>
        {agendamento.erro.codigo === "nao_encontrado"
          ? "Agendamento não encontrado."
          : agendamento.erro.mensagem}
      </Aviso>
    );
  }
  if (!agendamento.dados) return <p>Carregando…</p>;

  const atual = agendamento.dados;
  const observacoesMudaram = observacoes !== (atual.observacoes ?? "");

  async function aplicar(edicao: EdicaoDoAgendamento, qual: string) {
    setAviso(undefined);
    setObservacoesSalvas(false);
    setConfirmandoCancelar(false);
    setSalvando(qual);
    try {
      await api.barbeiro.atualizarAgendamento(id, edicao);
      if (qual === "observacoes") setObservacoesSalvas(true);
      agendamento.recarregar();
    } catch (causa) {
      setAviso((causa as ErroDaApi).mensagem || "Não foi possível salvar agora.");
    }
    setSalvando(null);
  }

  const total = atual.servicos.reduce(
    (soma, s) => soma + Math.round(Number(s.precoNoMomento) * 100),
    0
  );
  const duracao = atual.servicos.reduce((soma, s) => soma + s.duracaoNoMomento, 0);
  const telefoneDiscavel = atual.cliente.telefone.replace(/\D/g, "");
  const acoes = ACOES[atual.status] ?? [];
  const noCaminho = CAMINHO.indexOf(atual.status as Status);

  return (
    <div className={estilos.pagina}>
      <CabecalhoDaPagina
        titulo={atual.cliente.nome}
        voltar={{ href: `/painel/agenda?vista=dia&data=${atual.data}`, rotulo: "Agenda" }}
        selo={
          <Chip tom={TOM_DO_STATUS[atual.status] ?? "neutro"} tamanho="pequeno">
            {maiuscula(rotuloDoStatus(atual.status))}
          </Chip>
        }
        apoio={`${maiuscula(formatarDataComSemana(atual.data))} · ${atual.horaInicio}–${atual.horaFim} · com ${atual.barbeiro.nome}`}
        acao={
          // noreferrer além do noopener: o WhatsApp não precisa saber de
          // qual tela do painel o link saiu.
          lembravel && whatsapp.dados ? (
            <a
              className={estilos.whatsapp}
              href={whatsapp.dados}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconeConversa width={18} height={18} />
              Lembrar pelo WhatsApp
            </a>
          ) : null
        }
      />
      {aviso ? <Aviso>{aviso}</Aviso> : null}

      {/* A faixa do próximo passo: onde o atendimento está e o que fazer
          agora. É o motivo de abrir esta tela, por isso vem antes dos
          dados e é a única coisa com moldura. */}
      <section className={estilos.faixa} aria-label="Situação do atendimento" data-tom={TOM_DO_STATUS[atual.status]}>
        <div className={estilos.situacao}>
          {noCaminho >= 0 ? (
            <ol className={estilos.caminho}>
              {CAMINHO.map((passo, indice) => {
                const estado = indice < noCaminho ? "feito" : indice === noCaminho ? "atual" : "falta";
                return (
                  <li
                    key={passo}
                    className={estilos.etapa}
                    data-estado={estado}
                    aria-current={estado === "atual" ? "step" : undefined}
                  >
                    <span className={estilos.marca} aria-hidden="true">
                      {estado === "feito" ? <IconeCheck width={14} height={14} /> : null}
                    </span>
                    {maiuscula(rotuloDoStatus(passo))}
                  </li>
                );
              })}
            </ol>
          ) : null}
          <p className={estilos.frase}>{frase(atual.status, Boolean(atual.presencaConfirmadaEm))}</p>
        </div>

        <div className={estilos.acoes}>
          {confirmandoCancelar ? (
            <div className={estilos.confirmar} role="group" aria-label="Confirmar cancelamento">
              <span>Cancelar? O horário volta a ficar livre.</span>
              <button
                type="button"
                className={estilos.perigo}
                aria-busy={salvando === "cancelado" || undefined}
                disabled={salvando !== null}
                onClick={() => void aplicar({ status: "cancelado" }, "cancelado")}
              >
                Sim, cancelar
              </button>
              <button type="button" className={estilos.discreta} onClick={() => setConfirmandoCancelar(false)}>
                Não
              </button>
            </div>
          ) : (
            acoes.map((acao) => (
              <button
                key={acao.para}
                type="button"
                className={
                  acao.peso === "principal"
                    ? estilos.principal
                    : acao.peso === "perigo"
                      ? estilos.discretaPerigo
                      : estilos.secundaria
                }
                aria-busy={salvando === acao.para || undefined}
                disabled={salvando !== null}
                onClick={() =>
                  acao.para === "cancelado"
                    ? setConfirmandoCancelar(true)
                    : void aplicar({ status: acao.para }, acao.para)
                }
              >
                {salvando === acao.para ? "Salvando…" : acao.rotulo}
              </button>
            ))
          )}
        </div>
        {/* A API não tem remarcar no escopo do barbeiro, e aceitar data e
            hora no PATCH pularia a checagem de disponibilidade inteira.
            Dizer isso — perto do Cancelar, que é o caminho — é melhor do
            que um botão que voltaria erro. */}
        {lembravel ? (
          <p className={estilos.nota}>Para mudar o horário, cancele e crie outro agendamento.</p>
        ) : null}
      </section>

      {/* O resto sem caixas: duas colunas separadas por um fio, cada
          grupo com um rótulo miúdo em vez de título de bloco. */}
      <div className={estilos.corpo}>
        <div className={estilos.coluna}>
          <section className={estilos.grupo} aria-labelledby={`${idDoCampo}-servicos`}>
            <h2 id={`${idDoCampo}-servicos`} className={estilos.rotuloDoGrupo}>
              Serviços
            </h2>
            <ul className={estilos.servicos}>
              {atual.servicos.map((s) => (
                <li key={s.servicoId}>
                  <span>
                    {s.nome}
                    <span className={estilos.secundario}> · {s.duracaoNoMomento} min</span>
                  </span>
                  <span className={estilos.valor}>{formatarPreco(s.precoNoMomento)}</span>
                </li>
              ))}
              {/* Com um serviço só, o total repetiria a linha de cima. */}
              {atual.servicos.length > 1 ? (
                <li className={estilos.total}>
                  <span>
                    Total<span className={estilos.secundario}> · {duracao} min</span>
                  </span>
                  {/* precoNoMomento, não o preço de hoje: é o que foi
                      combinado com aquele cliente naquele dia. */}
                  <span className={estilos.valor}>{formatarPreco((total / 100).toFixed(2))}</span>
                </li>
              ) : null}
            </ul>
          </section>

          <section className={estilos.grupo} aria-labelledby={`${idDoCampo}-cliente`}>
            <h2 id={`${idDoCampo}-cliente`} className={estilos.rotuloDoGrupo}>
              Cliente
            </h2>
            <div className={estilos.cliente}>
              <span className={estilos.inicial} aria-hidden="true">
                {atual.cliente.nome.trim().charAt(0).toUpperCase()}
              </span>
              <div className={estilos.dadosDoCliente}>
                <Link className={estilos.link} href={`/painel/clientes/${atual.cliente.id}`}>
                  {atual.cliente.nome}
                </Link>
                {telefoneDiscavel ? (
                  <a className={estilos.telefone} href={`tel:+55${telefoneDiscavel}`}>
                    {atual.cliente.telefone}
                  </a>
                ) : null}
              </div>
            </div>
            {/* A presença confirmada não repete aqui: a frase da faixa já
                diz, no lugar onde se decide o próximo passo. */}
            <div className={estilos.selos}>
              <Chip tom="neutro" tamanho="pequeno">
                Agendado pelo {atual.origem}
              </Chip>
            </div>
          </section>
        </div>

        <div className={estilos.coluna}>
          <section className={estilos.grupo}>
            {/* <textarea> à mão, e não o Campo (que é um <input>): mesmo
                desenho da descrição em CadastroDeServico. O rótulo do
                campo faz as vezes do rótulo do grupo. */}
            <label className={estilos.rotuloDoGrupo} htmlFor={idDoCampo}>
              Observações
            </label>
            <textarea
              id={idDoCampo}
              className={estilos.area}
              aria-describedby={`${idDoCampo}-apoio`}
              placeholder="Ex.: prefere máquina 2 nas laterais."
              rows={5}
              value={observacoes}
              onChange={(evento) => {
                setObservacoes(evento.target.value);
                setObservacoesSalvas(false);
              }}
            />
            <div className={estilos.rodapeDoCampo}>
              <span className={estilos.secundario} id={`${idDoCampo}-apoio`}>
                Só a equipe vê.
              </span>
              {observacoesMudaram ? (
                <div className={estilos.botoesDoCampo}>
                  <Botao
                    variante="fantasma"
                    onClick={() => setObservacoes(atual.observacoes ?? "")}
                    disabled={salvando !== null}
                  >
                    Descartar
                  </Botao>
                  <Botao
                    onClick={() => aplicar({ observacoes }, "observacoes")}
                    carregando={salvando === "observacoes"}
                    disabled={salvando !== null}
                  >
                    Salvar observações
                  </Botao>
                </div>
              ) : observacoesSalvas ? (
                <span className={estilos.salvo} role="status">
                  ✓ Salvo
                </span>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
