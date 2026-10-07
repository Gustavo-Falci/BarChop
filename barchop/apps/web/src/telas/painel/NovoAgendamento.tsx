"use client";

import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ErroDaApi } from "@barchop/api-client";
import type { ClienteSerializado } from "@barchop/types";
import { Aviso } from "../../componentes/Aviso";
import { Botao } from "../../componentes/Botao";
import { Calendario } from "../../componentes/Calendario";
import { Vazio } from "../../componentes/Vazio";
import { formatarPreco, ItemDeServico } from "../../componentes/ItemDeServico";
import { ListaDeHorarios } from "../../componentes/ListaDeHorarios";
import { useRequisicao } from "../../api/useRequisicao";
import { ehPassado, formatarDataLonga, hojeIso } from "../../formato/datas";
import { deslocamentoDoFecho } from "./fecho";
import { useApiDoPainel } from "../../painel/ProvedorDoPainel";
import { usePainel } from "../../painel/SessaoDoPainel";
import { BuscaDeCliente } from "./BuscaDeCliente";
import estilos from "./NovoAgendamento.module.css";

// Quatro blocos numa tela só, e não um wizard: o wizard do fluxo do
// cliente existe porque celular não comporta quatro passos, e um
// monitor comporta. `agora` por parâmetro, como toda tela que olhe
// relógio — fake timers não entram nesta suíte.
export function NovoAgendamento({ agora = new Date() }: { agora?: Date }) {
  const router = useRouter();
  const query = useSearchParams();
  const api = useApiDoPainel();
  const { perfil, slug } = usePainel();

  const data = query.get("data") ?? hojeIso(agora);
  const hora = query.get("hora") ?? "";
  const [mes, setMes] = useState(data.slice(0, 7));
  const [cliente, setCliente] = useState<ClienteSerializado | null>(null);
  const [servicoIds, setServicoIds] = useState<string[]>([]);
  const [confirmouPassado, setConfirmouPassado] = useState(false);
  // Um passo aberto por vez. `null` é o estado de tudo recolhido, que é
  // onde a tela termina quando a última escolha é feita.
  const [aberto, setAberto] = useState<Etapa | null>("cliente");
  const [aviso, setAviso] = useState<string | undefined>();
  const [enviando, setEnviando] = useState(false);

  const servicos = useRequisicao(() => api.barbeiro.servicos(), []);

  // Com quem. O profissional marca só na própria agenda (a API recusa o
  // resto); dono e recepção escolhem entre quem atende e já entrou. O
  // padrão é quem está logado, se atende — a recepção, que não atende,
  // cai no primeiro da equipe em vez de receber 422. A coluna da agenda
  // manda `?profissional=` pela URL.
  const idDoProfissional = useId();
  const soOProprio = perfil.papel === "profissional";
  const equipe = useRequisicao(
    () => (soOProprio ? Promise.resolve([]) : api.barbeiro.equipe()),
    [soOProprio]
  );
  const atendentes = (equipe.dados ?? []).filter(
    (membro) => membro.ativo && membro.atende && !membro.convitePendente
  );
  const [escolhido, setEscolhido] = useState<string | undefined>(
    () => query.get("profissional") ?? undefined
  );
  const profissionalId = soOProprio
    ? perfil.id
    : (escolhido ?? (perfil.atende ? perfil.id : atendentes[0]?.id));

  // A lista de clientes manda um cliente pronto pela URL (a ação
  // "Agendar" de cada linha). Sem isto, quem clicou lá chegava aqui e
  // tinha que procurar de novo a pessoa que acabou de escolher.
  const clienteDaUrl = query.get("cliente");
  const clientePedido = useRequisicao(
    () =>
      clienteDaUrl
        ? api.barbeiro.cliente(clienteDaUrl)
        : Promise.resolve(null),
    [clienteDaUrl]
  );

  // Efeito, e não sincronização durante o render: `setCliente` no corpo
  // do componente dispararia a cada render enquanto os dados
  // estivessem em mãos. Roda uma vez por resposta, e só enquanto
  // ninguém escolheu nada — reabrir o passo por baixo de uma escolha
  // manual seria a tela desfazendo o que a pessoa fez.
  const pedido = clientePedido.dados;
  useEffect(() => {
    if (!pedido) return;
    setCliente((atual) => atual ?? pedido);
    setAberto((atual) => (atual === "cliente" ? "servicos" : atual));
  }, [pedido]);

  // Só com serviço escolhido a pergunta faz sentido: /disponibilidade
  // exige `servicoIds` não vazio (minItems: 1 no schema da API) porque
  // é a duração dos serviços que decide onde um atendimento cabe. Sem
  // serviço, a tela nem chama a rota — chamaria com um array vazio que
  // a API rejeitaria com 400.
  const horarios = useRequisicao(
    () =>
      servicoIds.length === 0 || !profissionalId
        ? Promise.resolve([])
        : // Com o token do painel: a API devolve os horários sem as
          // regras do cliente (antecedência, mesmo dia, janela) — o
          // painel encaixa livre (painel v2, marco 3).
          api.publico.disponibilidadeDoDia(
            slug,
            { barbeiroId: profissionalId, data, servicoIds },
            { comToken: true }
          ),
    [slug, profissionalId, data, servicoIds.join(",")]
  );

  const diasComVaga = useRequisicao(
    () =>
      servicoIds.length === 0 || !profissionalId
        ? Promise.resolve({})
        : api.publico.disponibilidadeDoMes(
            slug,
            { barbeiroId: profissionalId, mes, servicoIds },
            { comToken: true }
          ),
    [slug, profissionalId, mes, servicoIds.join(",")]
  );

  // A hora que a agenda mandou pela URL só é sintetizada na lista
  // enquanto nenhum serviço foi escolhido — o estado de "chegou
  // preenchida" do teste 1, em que a chamada acima nem acontece. Depois
  // que existe serviço e a busca de verdade já respondeu, a lista que
  // ela devolveu é a única fonte de verdade: sintetizar `hora` ali
  // também reintroduziria um horário que a disponibilidade acabou de
  // excluir (por exemplo, depois de somar um segundo serviço), marcado
  // como atual e com o botão de agendar ligado — a tela mentindo sobre
  // um horário que a própria API acabou de rejeitar.
  const horariosCarregados = horarios.dados ?? [];
  const horariosParaExibir =
    servicoIds.length === 0 && hora ? [hora] : horariosCarregados;

  // Enquanto a busca de disponibilidade ainda não respondeu pra esta
  // combinação de serviços (`carregando`), a lista antiga que sobrou de
  // antes não é evidência de nada — nem a favor nem contra — então não
  // trava o botão por causa dela; isso é o que mantém o clique em
  // "Agendar" funcionando no mesmo instante em que o primeiro serviço é
  // marcado, sem esperar a resposta chegar. Depois que a resposta
  // chegou (`!carregando`), `hora` só continua aceitável se estiver na
  // lista que voltou.
  const horaAceitavel =
    servicoIds.length === 0 || horarios.carregando || horariosCarregados.includes(hora);

  const passado = ehPassado(data, agora);

  // A lista do que falta e a condição do botão saem da mesma origem: se
  // fossem escritas duas vezes, divergiriam na primeira mudança e a tela
  // passaria a mentir sobre o próprio botão.
  const faltando = [
    cliente ? null : "cliente",
    servicoIds.length > 0 ? null : "serviço",
    hora && horaAceitavel ? null : "horário",
    !passado || confirmouPassado ? null : CONFIRMAR_PASSADO,
  ].filter((item): item is string => item !== null);

  const pronto = faltando.length === 0;

  // A confirmação do passado conta para `pronto`, mas fica de fora da
  // frase: ela tem caixa de seleção própria logo ali no fecho, e
  // listá-la seria pedir duas vezes a mesma coisa.
  const aEscolher = faltando.filter((item) => item !== CONFIRMAR_PASSADO);

  const quadroRef = useRef<HTMLDivElement>(null);
  const fechoRef = useRef<HTMLDivElement>(null);
  const [deslocamento, setDeslocamento] = useState(0);

  // Medir é a única forma: a altura de um passo depende do conteúdo que
  // a API devolveu (quantos serviços, quantos horários, quantas semanas
  // tem o mês), e nada disso é conhecido antes de renderizar.
  const medir = useCallback(() => {
    const quadro = quadroRef.current;
    const fecho = fechoRef.current;
    if (!quadro || !fecho) return;

    const secao = aberto
      ? quadro.querySelector(`[data-etapa="${aberto}"]`)
      : null;

    setDeslocamento(
      deslocamentoDoFecho({
        topoDoPasso: secao
          ? secao.getBoundingClientRect().top - quadro.getBoundingClientRect().top
          : null,
        altura: quadro.getBoundingClientRect().height,
        alturaDoFecho: fecho.getBoundingClientRect().height,
      })
    );
  }, [aberto]);

  // `useLayoutEffect` e não `useEffect`: a medida vira posição na tela, e
  // com o efeito assíncrono o fecho apareceria um quadro no lugar antigo
  // antes de saltar para o novo.
  useLayoutEffect(() => {
    medir();

    // jsdom não implementa ResizeObserver, e o guard também cobre o
    // servidor. Sem ele, a altura muda quando a disponibilidade chega
    // (o mês pode ter cinco ou seis linhas) e o fecho fica no lugar de
    // antes.
    if (typeof ResizeObserver === "undefined") return;

    const observador = new ResizeObserver(medir);
    if (quadroRef.current) observador.observe(quadroRef.current);
    if (fechoRef.current) observador.observe(fechoRef.current);
    return () => observador.disconnect();
  }, [medir]);

  function alternar(etapa: Etapa) {
    setAberto((atual) => (atual === etapa ? null : etapa));
  }

  function trocarQuery(proximos: Record<string, string | null>) {
    const atual = new URLSearchParams(query.toString());
    for (const [chave, valor] of Object.entries(proximos)) {
      if (valor === null) atual.delete(chave);
      else atual.set(chave, valor);
    }
    router.push(`/painel/agendamentos/novo?${atual.toString()}`);
  }

  async function agendar() {
    if (!cliente || !profissionalId) return;
    setAviso(undefined);
    setEnviando(true);

    try {
      const criado = await api.barbeiro.criarAgendamento({
        barbeiroId: profissionalId,
        clienteId: cliente.id,
        servicoIds,
        data,
        horaInicio: hora,
      });
      router.push(`/painel/agendamentos/${criado.id}`);
    } catch (causa) {
      const erro = causa as ErroDaApi;
      if (erro.codigo === "horario_ocupado") {
        // A corrida que a trava do banco pega depois de a
        // disponibilidade já ter dito que cabia. A resposta certa é
        // recarregar os horários, não repetir o envio.
        setAviso("Esse horário acabou de ser ocupado. Escolha outro.");
        horarios.recarregar();
      } else {
        setAviso(erro.mensagem || "Não foi possível agendar agora.");
      }
    }

    setEnviando(false);
  }

  const escolhidos = (servicos.dados ?? []).filter((s) => servicoIds.includes(s.id));
  const duracao = escolhidos.reduce((total, s) => total + s.duracaoMinutos, 0);
  const total = escolhidos.reduce((soma, s) => soma + Math.round(Number(s.preco) * 100), 0);

  const servicosEscolhidos = escolhidos.map((servico) => servico.nome).join(", ");

  return (
    <div className={estilos.pagina}>
      <h1>Novo agendamento</h1>

      {soOProprio ? null : (
        <div className={estilos.profissional}>
          <label htmlFor={idDoProfissional}>Profissional</label>
          <select
            id={idDoProfissional}
            value={profissionalId ?? ""}
            onChange={(evento) => setEscolhido(evento.target.value)}
            disabled={!equipe.dados}
          >
            {atendentes.map((membro) => (
              <option key={membro.id} value={membro.id}>
                {membro.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Duas colunas: a sequência de passos à esquerda e o fecho ao
          lado, grudado no topo enquanto se rola. O que vai ser criado
          fica à vista o tempo todo, em vez de esperar no fim da
          página. */}
      <div className={estilos.colunas}>
      {/* Um quadro só, com quatro passos numerados, em vez de quatro
          cartões soltos: a numeração diz a ordem que a dependência já
          impunha (serviço decide dia, dia decide horário) e cada passo
          resolvido resume a escolha no próprio cabeçalho, então a tela
          responde "o que já está decidido" sem precisar rolar. */}
      <div className={estilos.quadro} data-testid="passos" ref={quadroRef}>
        <Passo
          etapa="cliente"
          numero={1}
          titulo="Cliente"
          feito={Boolean(cliente)}
          aberto={aberto === "cliente"}
          aoAlternar={() => alternar("cliente")}
          resumo={cliente ? `${cliente.nome} · ${cliente.telefone}` : undefined}
        >
          <BuscaDeCliente
            escolhido={cliente}
            aoEscolher={(escolhido) => {
              setCliente(escolhido);
              // Escolha única: feita, não há mais nada a fazer aqui, e o
              // passo seguinte é o que interessa. Serviços não avança
              // assim — lá a escolha é múltipla, e fechar no primeiro
              // clique tiraria o segundo serviço do alcance.
              setAberto("servicos");
            }}
          />
        </Passo>

        <Passo
          etapa="servicos"
          numero={2}
          titulo="Serviços"
          feito={servicoIds.length > 0}
          aberto={aberto === "servicos"}
          aoAlternar={() => alternar("servicos")}
          resumo={
            servicoIds.length > 0
              ? servicosEscolhidos + " · " + duracao + " min"
              : undefined
          }
          idDoResumo="resumo-servicos"
        >
          {(servicos.dados ?? [])
            .filter((servico) => servico.ativo)
            .map((servico) => (
              <ItemDeServico
                key={servico.id}
                servico={servico}
                marcado={servicoIds.includes(servico.id)}
                aoAlternar={(id) =>
                  setServicoIds((atuais) =>
                    atuais.includes(id)
                      ? atuais.filter((outro) => outro !== id)
                      : [...atuais, id]
                  )
                }
              />
            ))}
        </Passo>

        <Passo
          etapa="data"
          numero={3}
          titulo="Data"
          feito={servicoIds.length > 0}
          aberto={aberto === "data"}
          aoAlternar={() => alternar("data")}
          resumo={formatarDataLonga(data)}
          idDoResumo="resumo-data"
        >
          {/* Sem serviço, /disponibilidade/mes nem é chamada: o mapa vem
              vazio e o calendário sairia com o mês inteiro desabilitado
              — indistinguível de uma agenda lotada. */}
          {servicoIds.length === 0 ? (
            <Vazio
              mensagem="Escolha um serviço"
              dica="Os dias com vaga dependem da duração do que for atendido."
            />
          ) : (
            <Calendario
              mes={mes}
              dias={diasComVaga.dados ?? {}}
              agora={agora}
              selecionada={data}
              // O horário escolhido é de um dia específico: trocar a
              // data sem limpar `hora` deixaria a URL com um par
              // data/hora que nunca foram oferecidos juntos. Diferente
              // do caso de somar um serviço (em que o horário antigo
              // pode ou não continuar cabendo, e só a resposta da
              // disponibilidade decide), aqui não há dúvida a esperar:
              // um novo dia sempre invalida a hora do dia anterior.
              aoEscolher={(escolhida) => {
                trocarQuery({ data: escolhida, hora: null });
                setAberto("horario");
              }}
              aoTrocarMes={setMes}
            />
          )}
        </Passo>

        <Passo
          etapa="horario"
          numero={4}
          titulo="Horário"
          feito={Boolean(hora) && horaAceitavel}
          aberto={aberto === "horario"}
          aoAlternar={() => alternar("horario")}
          // Só com `horaAceitavel`: depois de somar um serviço que não
          // cabe mais, a hora continua na URL mas deixou de valer, e um
          // resumo dizendo "11:00" anunciaria como decidido um horário
          // que a disponibilidade acabou de excluir.
          resumo={hora && horaAceitavel ? hora : undefined}
          idDoResumo="resumo-horario"
        >
          {horariosParaExibir.length === 0 ? (
            <Vazio
              mensagem={
                servicoIds.length === 0
                  ? "Nada a mostrar ainda"
                  : "Sem horário livre neste dia"
              }
              dica={
                servicoIds.length === 0
                  ? // Frase diferente da do passo da data de propósito:
                    // chegando pelo menu os dois ficam vazios ao mesmo
                    // tempo, e repetir "Escolha um serviço" nos dois faz
                    // o quadro virar um eco.
                    "Os horários aparecem depois do serviço e do dia."
                  : "Tente outro dia no calendário acima."
              }
            />
          ) : (
            <ListaDeHorarios
              horarios={horariosParaExibir}
              selecionada={hora}
              aoEscolher={(escolhida) => {
                trocarQuery({ hora: escolhida });
                // Última escolha da sequência: recolhe tudo e o que
                // sobra à vista é o fecho, que é onde a tela termina.
                setAberto(null);
              }}
            />
          )}
        </Passo>
      </div>

      {/* O fecho: tudo que vai ser criado, empilhado sobre o botão. O
          resumo estava solto dentro de Serviços, sem rótulo, e o botão
          desabilitava calado. */}
      <div
        className={estilos.fecho}
        data-testid="fecho"
        ref={fechoRef}
        style={{ "--deslocamento": `${deslocamento}px` } as CSSProperties}
      >
        <div className={estilos.resumo} data-testid="resumo-do-pedido">
          <strong className={estilos.total}>
            {duracao} min · {formatarPreco((total / 100).toFixed(2))}
          </strong>
          <span className={estilos.quando}>
            {formatarDataLonga(data)}
            {hora ? " · " + hora : ""}
          </span>
        </div>

        {passado ? (
          // garantirAlteravel não toca o escopo do barbeiro, então isto
          // é recuperável — registrar retroativamente um atendimento que
          // acabou de acontecer é legítimo. Fazer isso sem perceber,
          // não. Fica junto do botão porque é a última coisa entre a
          // intenção e a criação.
          <label className={estilos.passado}>
            <input
              type="checkbox"
              checked={confirmouPassado}
              onChange={(evento) => setConfirmouPassado(evento.target.checked)}
            />
            <span>Data no passado. Registrar mesmo assim</span>
          </label>
        ) : null}

        {aEscolher.length === 0 ? null : (
          <p className={estilos.falta}>Falta escolher: {emLista(aEscolher)}</p>
        )}

        {/* Junto do botão que o causou: numa coluna à parte, o aviso
            ficaria longe dele — e, com a página rolada, fora da vista. */}
        {aviso ? <Aviso>{aviso}</Aviso> : null}

        <Botao disabled={!pronto} carregando={enviando} onClick={agendar}>
          Agendar
        </Botao>
      </div>
      </div>
    </div>
  );
}

type Etapa = "cliente" | "servicos" | "data" | "horario";

// Uma constante, e não a frase solta em dois lugares: ela entra na conta
// do que falta e é retirada da frase, e um erro de digitação entre as
// duas ocorrências ligaria o botão sem a confirmação.
const CONFIRMAR_PASSADO = "confirmar o registro retroativo";

// Um passo do quadro. Recolhido, o cabeçalho é o botão que abre e o
// chip ao lado mostra a escolha — e também reabre, porque é nele que a
// mão vai quando a intenção é rever o que ficou decidido.
function Passo({
  etapa,
  numero,
  titulo,
  feito,
  aberto,
  resumo,
  idDoResumo,
  aoAlternar,
  children,
}: {
  etapa: Etapa;
  numero: number;
  titulo: string;
  feito: boolean;
  aberto: boolean;
  resumo?: string;
  idDoResumo?: string;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  const idDoCorpo = `passo-${numero}`;

  return (
    <section
      className={estilos.passo}
      // Lido pela medição do fecho, que precisa do topo do passo aberto.
      data-etapa={etapa}
      data-feito={feito ? "true" : undefined}
      data-aberto={aberto ? "true" : undefined}
    >
      <div className={estilos.linha}>
        {/* O <h2> permanece: é ele que põe o passo no sumário de
            cabeçalhos de quem navega por leitor de tela. O botão por
            dentro é o padrão de acordeão. */}
        <h2 className={estilos.titulo}>
          <button
            type="button"
            className={estilos.cabecalho}
            aria-expanded={aberto}
            aria-controls={aberto ? idDoCorpo : undefined}
            onClick={aoAlternar}
          >
            {/* `aria-hidden` no número: quem nomeia o botão é o título,
                e o "1" lido antes dele só atrapalharia. */}
            <span className={estilos.numero} aria-hidden="true">
              {numero}
            </span>
            {titulo}
          </button>
        </h2>

        {/* Só recolhido: aberto, a escolha já está à vista no corpo, e
            dois elementos marcados como atuais confundiriam tanto a
            leitura quanto a busca por papel. */}
        {!aberto && resumo ? (
          <button
            type="button"
            className={estilos.valor}
            data-testid={idDoResumo}
            aria-current="true"
            onClick={aoAlternar}
          >
            {resumo}
          </button>
        ) : null}
      </div>

      {aberto ? (
        <div className={estilos.corpo} id={idDoCorpo}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

// "cliente, serviço e horário" — vírgula entre os primeiros e "e" antes
// do último, que é como se lê uma lista em português.
function emLista(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return itens.slice(0, -1).join(", ") + " e " + itens[itens.length - 1];
}
