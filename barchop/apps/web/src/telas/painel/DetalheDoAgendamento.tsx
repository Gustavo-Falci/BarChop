"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { EdicaoDoAgendamento, ErroDaApi } from "@barchop/api-client";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { CabecalhoDaPagina } from "../../componentes/CabecalhoDaPagina";
import { Chip } from "../../componentes/Chip";
import { LadoALado } from "../../componentes/Colunas";
import { formatarPreco } from "../../componentes/ItemDeServico";
import { Secao } from "../../componentes/Secao";
import { useRequisicao } from "../../api/useRequisicao";
import { formatarDataComSemana } from "../../formato/datas";
import { rotuloDoStatus } from "../../formato/status";
import { IconeConversa } from "../../painel/icones";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import estilos from "./DetalheDoAgendamento.module.css";

// Qualquer transição é aceita pela API: o barbeiro é a autoridade sobre
// o que aconteceu no salão.
const STATUS = ["pendente", "confirmado", "concluido", "cancelado", "no_show"] as const;

// O tom de cada status, o mesmo nos botões e no selo do cabeçalho: dá
// pra ler a situação pela cor antes de ler a palavra.
const TOM_DO_STATUS: Record<string, "acento" | "neutro" | "ok" | "atencao" | "erro"> = {
  pendente: "atencao",
  confirmado: "acento",
  concluido: "ok",
  cancelado: "erro",
  no_show: "erro",
};

// Uma linha de apoio por botão: "cancelado" e "não compareceu" parecem
// a mesma coisa até alguém dizer que um é aviso e o outro é falta.
const APOIO_DO_STATUS: Record<string, string> = {
  pendente: "Ainda não combinado",
  confirmado: "Combinado com o cliente",
  concluido: "Atendimento feito",
  cancelado: "Desmarcado com aviso",
  no_show: "Faltou sem avisar",
};

function maiuscula(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
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
  // Qual ação está no ar: o status clicado ou as observações. Um
  // booleano só travava os cinco botões e o Salvar juntos, e não dava
  // pra saber qual clique estava sendo salvo.
  const [salvando, setSalvando] = useState<string | null>(null);
  const [observacoesSalvas, setObservacoesSalvas] = useState(false);

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
  const telefoneDiscavel = atual.cliente.telefone.replace(/\D/g, "");
  const quando = maiuscula(formatarDataComSemana(atual.data));

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
        apoio={`${quando} · ${atual.horaInicio}–${atual.horaFim}`}
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

      {/* Lado a lado: o atendimento à esquerda, o que se muda nele à
          direita (as telas usam a largura — pedido do dono). */}
      <LadoALado>
        <Secao titulo="O atendimento">
          {/* Rótulo e valor, em vez de parágrafos soltos: telefone, data
              e serviço eram três linhas sem nome, com um vão entre cada. */}
          <dl className={estilos.ficha}>
            <div className={estilos.linha}>
              <dt>Cliente</dt>
              <dd>
                <Link className={estilos.link} href={`/painel/clientes/${atual.cliente.id}`}>
                  {atual.cliente.nome}
                </Link>
                {telefoneDiscavel ? (
                  <a className={estilos.secundario} href={`tel:+55${telefoneDiscavel}`}>
                    {atual.cliente.telefone}
                  </a>
                ) : null}
              </dd>
            </div>
            <div className={estilos.linha}>
              <dt>Quando</dt>
              <dd>
                {quando}
                <span className={estilos.secundario}>
                  {atual.horaInicio}–{atual.horaFim}
                </span>
              </dd>
            </div>
            <div className={estilos.linha}>
              <dt>Com</dt>
              <dd>{atual.barbeiro.nome}</dd>
            </div>
            <div className={estilos.linha}>
              <dt>Serviços</dt>
              <dd>
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
                  {atual.servicos.length > 1 ? (
                    <li className={estilos.total}>
                      <span>Total</span>
                      {/* precoNoMomento, não o preço de hoje: é o que foi
                          combinado com aquele cliente naquele dia. */}
                      <span className={estilos.valor}>{formatarPreco((total / 100).toFixed(2))}</span>
                    </li>
                  ) : null}
                </ul>
              </dd>
            </div>
          </dl>

          <div className={estilos.selos}>
            <Chip tom="neutro" tamanho="pequeno">
              Agendado pelo {atual.origem}
            </Chip>
            {atual.presencaConfirmadaEm ? (
              <Chip tom="ok" tamanho="pequeno">
                ✓ Confirmou presença
              </Chip>
            ) : null}
          </div>

          {/* A API não tem remarcar no escopo do barbeiro, e aceitar data e
              hora no PATCH pularia a checagem de disponibilidade inteira.
              Dizer isso é melhor do que um botão que voltaria erro. */}
          <p className={estilos.nota}>Para mudar o horário, cancele e crie outro agendamento.</p>
        </Secao>

        <div className={estilos.pilha}>
          <Secao titulo="Status" descricao="Marque o que aconteceu com este atendimento.">
            <div className={estilos.opcoes}>
              {STATUS.map((opcao) => {
                const marcado = opcao === atual.status;
                return (
                  <button
                    key={opcao}
                    type="button"
                    className={estilos.opcao}
                    data-tom={TOM_DO_STATUS[opcao]}
                    aria-pressed={marcado}
                    aria-busy={salvando === opcao || undefined}
                    disabled={salvando !== null}
                    onClick={() => {
                      if (!marcado) void aplicar({ status: opcao }, opcao);
                    }}
                  >
                    <span className={estilos.ponto} aria-hidden="true" />
                    <span className={estilos.rotuloDaOpcao}>{rotuloDoStatus(opcao)}</span>
                    {/* Fora do nome acessível: o botão se chama pelo
                        status, e o leitor de tela já ouve o "pressionado". */}
                    <span className={estilos.apoioDaOpcao} aria-hidden="true">
                      {salvando === opcao ? "Salvando…" : APOIO_DO_STATUS[opcao]}
                    </span>
                  </button>
                );
              })}
            </div>
          </Secao>

          <Secao
            titulo="Anotações"
            acao={
              <div className={estilos.rodape}>
                {observacoesSalvas && !observacoesMudaram ? (
                  <span className={estilos.salvo} role="status">
                    ✓ Salvo
                  </span>
                ) : null}
                <Botao
                  onClick={() => aplicar({ observacoes }, "observacoes")}
                  carregando={salvando === "observacoes"}
                  disabled={!observacoesMudaram || salvando !== null}
                >
                  Salvar observações
                </Botao>
              </div>
            }
          >
            {/* <textarea> à mão, e não o Campo (que é um <input>): mesmo
                desenho da descrição em CadastroDeServico. */}
            <div className={estilos.campoLongo}>
              <label className={estilos.rotulo} htmlFor={idDoCampo}>
                Observações
              </label>
              <span className={estilos.apoio} id={`${idDoCampo}-apoio`}>
                Só a equipe vê. Ex.: prefere máquina 2, costuma atrasar.
              </span>
              <textarea
                id={idDoCampo}
                className={estilos.area}
                aria-describedby={`${idDoCampo}-apoio`}
                rows={4}
                value={observacoes}
                onChange={(evento) => {
                  setObservacoes(evento.target.value);
                  setObservacoesSalvas(false);
                }}
              />
            </div>
          </Secao>
        </div>
      </LadoALado>
    </div>
  );
}
